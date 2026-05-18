package internal

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"net/url"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type InvitationEmailMode string

const (
	InvitationEmailModeDisabled InvitationEmailMode = "disabled"
	InvitationEmailModeSMTP     InvitationEmailMode = "smtp"
)

type InvitationEmailTLSMode string

const (
	InvitationEmailTLSStartTLS InvitationEmailTLSMode = "starttls"
	InvitationEmailTLSTLS      InvitationEmailTLSMode = "tls"
	InvitationEmailTLSNone     InvitationEmailTLSMode = "none"
)

type InvitationEmailConfig struct {
	Mode            InvitationEmailMode
	RequireDelivery bool
	PublicURL       string
	From            string
	ReplyTo         string
	SMTPHost        string
	SMTPPort        string
	SMTPUsername    string
	SMTPPassword    string
	SMTPTLS         InvitationEmailTLSMode
	SMTPTimeout     time.Duration
	MaxAttempts     int
	RetryBase       time.Duration
}

type InvitationEmailMessage struct {
	DeliveryID string
	From       string
	ReplyTo    string
	To         string
	Subject    string
	Body       string
}

type InvitationEmailTransport interface {
	SendInvitationEmail(ctx context.Context, message InvitationEmailMessage) error
}

type ServiceOptions struct {
	InvitationEmail InvitationEmailConfig
	EmailTransport  InvitationEmailTransport
}

type SMTPInvitationEmailTransport struct {
	Host     string
	Port     string
	Username string
	Password string
	TLSMode  InvitationEmailTLSMode
	Timeout  time.Duration
}

func DefaultInvitationEmailConfig() InvitationEmailConfig {
	return InvitationEmailConfig{
		Mode:        InvitationEmailModeDisabled,
		SMTPTLS:     InvitationEmailTLSStartTLS,
		SMTPTimeout: 10 * time.Second,
		MaxAttempts: 5,
		RetryBase:   time.Minute,
	}
}

func (config InvitationEmailConfig) normalized() InvitationEmailConfig {
	if config.Mode == "" {
		config.Mode = InvitationEmailModeDisabled
	}
	if config.SMTPTLS == "" {
		config.SMTPTLS = InvitationEmailTLSStartTLS
	}
	if config.SMTPTimeout == 0 {
		config.SMTPTimeout = 10 * time.Second
	}
	if config.MaxAttempts == 0 {
		config.MaxAttempts = 5
	}
	if config.RetryBase == 0 {
		config.RetryBase = time.Minute
	}
	return config
}

func (config InvitationEmailConfig) Validate() error {
	config = config.normalized()
	switch config.Mode {
	case InvitationEmailModeDisabled:
		if config.RequireDelivery {
			return configInvalidError("disabled invitation email mode cannot require delivery")
		}
		return nil
	case InvitationEmailModeSMTP:
		if strings.TrimSpace(config.PublicURL) == "" {
			return configInvalidError("CLOUDGRID_PUBLIC_URL is required for SMTP invitation email delivery")
		}
		parsedURL, err := url.Parse(strings.TrimSpace(config.PublicURL))
		if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
			return configInvalidError("CLOUDGRID_PUBLIC_URL must be an absolute URL")
		}
		if _, err := mail.ParseAddress(strings.TrimSpace(config.From)); err != nil {
			return configInvalidError("CLOUDGRID_INVITATION_EMAIL_FROM must be a valid email address")
		}
		if strings.TrimSpace(config.ReplyTo) != "" {
			if _, err := mail.ParseAddress(strings.TrimSpace(config.ReplyTo)); err != nil {
				return configInvalidError("CLOUDGRID_INVITATION_EMAIL_REPLY_TO must be a valid email address")
			}
		}
		if strings.TrimSpace(config.SMTPHost) == "" || strings.TrimSpace(config.SMTPPort) == "" {
			return configInvalidError("SMTP host and port are required for invitation email delivery")
		}
		switch config.SMTPTLS {
		case InvitationEmailTLSStartTLS, InvitationEmailTLSTLS, InvitationEmailTLSNone:
		default:
			return configInvalidError("CLOUDGRID_INVITATION_EMAIL_SMTP_TLS must be starttls, tls, or none")
		}
		if config.SMTPTimeout < time.Second || config.SMTPTimeout > time.Minute {
			return configInvalidError("CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS must be between 1000 and 60000")
		}
		if config.MaxAttempts < 1 || config.MaxAttempts > 20 {
			return configInvalidError("CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS must be between 1 and 20")
		}
		if config.RetryBase < 5*time.Second || config.RetryBase > time.Hour {
			return configInvalidError("CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS must be between 5 and 3600")
		}
		return nil
	default:
		return configInvalidError("CLOUDGRID_INVITATION_EMAIL_MODE must be disabled or smtp")
	}
}

func configInvalidError(reason string) error {
	return fmt.Errorf("ERR-009 CONFIG_INVALID: %s", reason)
}

func NewSMTPInvitationEmailTransport(config InvitationEmailConfig) *SMTPInvitationEmailTransport {
	config = config.normalized()
	return &SMTPInvitationEmailTransport{
		Host:     strings.TrimSpace(config.SMTPHost),
		Port:     strings.TrimSpace(config.SMTPPort),
		Username: strings.TrimSpace(config.SMTPUsername),
		Password: config.SMTPPassword,
		TLSMode:  config.SMTPTLS,
		Timeout:  config.SMTPTimeout,
	}
}

func (transport *SMTPInvitationEmailTransport) SendInvitationEmail(ctx context.Context, message InvitationEmailMessage) error {
	address := net.JoinHostPort(transport.Host, transport.Port)
	dialer := &net.Dialer{Timeout: transport.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	defer conn.Close()

	var client *smtp.Client
	if transport.TLSMode == InvitationEmailTLSTLS {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: transport.Host, MinVersion: tls.VersionTLS12})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return err
		}
		client, err = smtp.NewClient(tlsConn, transport.Host)
	} else {
		client, err = smtp.NewClient(conn, transport.Host)
	}
	if err != nil {
		return err
	}
	defer client.Close()

	if transport.TLSMode == InvitationEmailTLSStartTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp server does not advertise STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: transport.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
	}
	if transport.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", transport.Username, transport.Password, transport.Host)); err != nil {
			return err
		}
	}
	fromAddress, err := mail.ParseAddress(message.From)
	if err != nil {
		return err
	}
	toAddress, err := mail.ParseAddress(message.To)
	if err != nil {
		return err
	}
	if err := client.Mail(fromAddress.Address); err != nil {
		return err
	}
	if err := client.Rcpt(toAddress.Address); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	defer writer.Close()
	headers := []string{
		"From: " + message.From,
		"To: " + message.To,
		"Subject: " + sanitizeEmailHeader(message.Subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
	}
	if strings.TrimSpace(message.ReplyTo) != "" {
		headers = append(headers, "Reply-To: "+sanitizeEmailHeader(message.ReplyTo))
	}
	payload := strings.Join(headers, "\r\n") + "\r\n\r\n" + message.Body + "\r\n"
	_, err = writer.Write([]byte(payload))
	return err
}

func sanitizeEmailHeader(value string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(strings.TrimSpace(value))
}

func (service *Service) prepareInvitationEmailDelivery(ctx context.Context, invitation *ports.InvitationRecord, kind ports.EmailDeliveryKind, projectID *string, recipientUserID *string) (*ports.EmailDeliveryRecord, error) {
	config := service.invitationEmail.normalized()
	now := service.now().UTC()
	switch config.Mode {
	case InvitationEmailModeDisabled:
		if config.RequireDelivery {
			return nil, invitationEmailDeliveryFailedError("invitation email delivery is disabled")
		}
		invitation.DeliveryStatus = contracts.InvitationDeliveryStatusSuppressed
		invitation.LastDeliveryErrorCode = nil
		return nil, nil
	case InvitationEmailModeSMTP:
		subject, body, err := service.renderInvitationEmailContent(ctx, *invitation, kind, projectID)
		if err != nil {
			return nil, err
		}
		deliveryID := fmt.Sprintf("email-%s-%d", normalizeID(invitation.ID), time.Now().UTC().UnixNano())
		invitation.DeliveryStatus = contracts.InvitationDeliveryStatusPending
		invitation.LastDeliveryErrorCode = nil
		invitation.LastEmailDeliveryID = &deliveryID
		return &ports.EmailDeliveryRecord{
			ID:              deliveryID,
			Kind:            kind,
			OrganizationID:  invitation.OrganizationID,
			ProjectID:       projectID,
			InvitationID:    &invitation.ID,
			RecipientEmail:  invitation.Email,
			RecipientUserID: recipientUserID,
			Template:        invitationEmailTemplate(kind),
			Status:          ports.EmailDeliveryStatusPending,
			AttemptCount:    0,
			NextAttemptAt:   &now,
			Subject:         subject,
			Body:            body,
			CreatedAt:       now,
			UpdatedAt:       now,
		}, nil
	default:
		if config.RequireDelivery {
			return nil, invitationEmailDeliveryFailedError("invitation email delivery is not configured")
		}
		invitation.DeliveryStatus = contracts.InvitationDeliveryStatusNotConfigured
		invitation.LastDeliveryErrorCode = nil
		return nil, nil
	}
}

func (service *Service) ProcessDueInvitationEmails(ctx context.Context, limit int) (int, error) {
	config := service.invitationEmail.normalized()
	if config.Mode != InvitationEmailModeSMTP {
		return 0, nil
	}
	if service.emailTransport == nil {
		return 0, invitationEmailDeliveryFailedError("invitation email transport is not configured")
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	now := service.now().UTC()
	deliveries, err := service.store.ListDueEmailDeliveries(ctx, now, limit)
	if err != nil {
		return 0, storageError()
	}
	sent := 0
	var firstErr error
	for _, delivery := range deliveries {
		if delivery.InvitationID == nil {
			continue
		}
		invitation, ok, err := service.store.GetInvitation(ctx, *delivery.InvitationID)
		if err != nil {
			return sent, storageError()
		}
		if !ok || invitation.Status != contracts.OrganizationInvitationStatusPending {
			delivery.Status = ports.EmailDeliveryStatusSuppressed
			delivery.UpdatedAt = now
			if err := service.store.PutEmailDelivery(ctx, delivery); err != nil {
				return sent, storageError()
			}
			continue
		}
		delivery.AttemptCount++
		delivery.LastAttemptAt = &now
		delivery.UpdatedAt = now
		message := InvitationEmailMessage{
			DeliveryID: delivery.ID,
			From:       config.From,
			ReplyTo:    config.ReplyTo,
			To:         delivery.RecipientEmail,
			Subject:    delivery.Subject,
			Body:       delivery.Body,
		}
		if err := service.emailTransport.SendInvitationEmail(ctx, message); err != nil {
			code := "smtp_send_failed"
			delivery.LastErrorCode = &code
			invitation.LastDeliveryErrorCode = &code
			invitation.LastDeliveryAttemptAt = &now
			invitation.LastEmailDeliveryID = &delivery.ID
			if delivery.AttemptCount >= config.MaxAttempts {
				delivery.Status = ports.EmailDeliveryStatusFailedTerminal
				delivery.NextAttemptAt = nil
				invitation.DeliveryStatus = contracts.InvitationDeliveryStatusFailedTerminal
			} else {
				delivery.Status = ports.EmailDeliveryStatusFailedRetryable
				next := now.Add(invitationEmailRetryDelay(config.RetryBase, delivery.AttemptCount))
				delivery.NextAttemptAt = &next
				invitation.DeliveryStatus = contracts.InvitationDeliveryStatusFailedRetryable
			}
			if err := service.store.PutInvitationAndEmailDelivery(ctx, invitation, &delivery); err != nil {
				return sent, storageError()
			}
			if firstErr == nil {
				firstErr = invitationEmailDeliveryFailedError("invitation email delivery failed")
			}
			continue
		}
		delivery.Status = ports.EmailDeliveryStatusSent
		delivery.SentAt = &now
		delivery.NextAttemptAt = nil
		delivery.LastErrorCode = nil
		invitation.DeliveryStatus = contracts.InvitationDeliveryStatusSent
		invitation.LastDeliveryAttemptAt = &now
		invitation.LastDeliveryErrorCode = nil
		invitation.LastEmailDeliveryID = &delivery.ID
		if err := service.store.PutInvitationAndEmailDelivery(ctx, invitation, &delivery); err != nil {
			return sent, storageError()
		}
		sent++
	}
	return sent, firstErr
}

func (service *Service) renderInvitationEmailContent(ctx context.Context, invitation ports.InvitationRecord, kind ports.EmailDeliveryKind, projectID *string) (string, string, error) {
	organizationName := invitation.OrganizationID
	if organization, ok, err := service.store.GetOrganization(ctx, invitation.OrganizationID); err != nil {
		return "", "", storageError()
	} else if ok && strings.TrimSpace(organization.Name) != "" {
		organizationName = organization.Name
	}
	inviter := invitation.InvitedByUserID
	if user, ok, err := service.store.GetUser(ctx, invitation.InvitedByUserID); err != nil {
		return "", "", storageError()
	} else if ok {
		switch {
		case user.DisplayName != nil && strings.TrimSpace(*user.DisplayName) != "":
			inviter = strings.TrimSpace(*user.DisplayName)
		case user.Email != nil && strings.TrimSpace(*user.Email) != "":
			inviter = strings.TrimSpace(*user.Email)
		}
	}
	loginURL := strings.TrimRight(service.invitationEmail.PublicURL, "/") + "/"
	subject := fmt.Sprintf("You have been invited to CloudGrid %s", organizationName)
	lines := []string{
		fmt.Sprintf("%s invited you to CloudGrid.", inviter),
		"",
		fmt.Sprintf("Company: %s", organizationName),
		fmt.Sprintf("Email: %s", invitation.Email),
	}
	if kind == ports.EmailDeliveryKindProjectAccess && projectID != nil {
		projectName := *projectID
		if project, ok, err := service.store.GetProject(ctx, *projectID); err != nil {
			return "", "", storageError()
		} else if ok && strings.TrimSpace(project.Name) != "" {
			projectName = project.Name
		}
		role := ""
		for _, grant := range invitation.ProjectGrants {
			if grant.ProjectID == *projectID && grant.Status == contracts.InvitationProjectGrantStatusPending {
				role = string(grant.Role)
				break
			}
		}
		if role == "" {
			role = "member"
		}
		subject = fmt.Sprintf("You have been invited to CloudGrid project %s", projectName)
		lines = append(lines, fmt.Sprintf("Project: %s", projectName), fmt.Sprintf("Project role: %s", role))
	}
	lines = append(lines,
		"",
		"Sign in with the invited, verified SSO email address to accept the invitation.",
		loginURL,
		"",
		"This email does not contain a secret invitation token.",
	)
	return subject, strings.Join(lines, "\n"), nil
}

func invitationEmailTemplate(kind ports.EmailDeliveryKind) string {
	switch kind {
	case ports.EmailDeliveryKindProjectAccess:
		return "project_access_v1"
	default:
		return "organization_invitation_v1"
	}
}

func invitationEmailRetryDelay(base time.Duration, attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := base
	for i := 1; i < attempt; i++ {
		delay *= 2
		if delay > time.Hour {
			return time.Hour
		}
	}
	return delay
}
