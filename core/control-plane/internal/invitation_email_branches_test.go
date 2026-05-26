package internal

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type captureInvitationTransport struct {
	err      error
	messages []InvitationEmailMessage
}

func (transport *captureInvitationTransport) SendInvitationEmail(_ context.Context, message InvitationEmailMessage) error {
	transport.messages = append(transport.messages, message)
	return transport.err
}

func TestInvitationEmailConfigValidationBranches(t *testing.T) {
	valid := DefaultInvitationEmailConfig()
	if valid.Mode != InvitationEmailModeDisabled || valid.SMTPTLS != InvitationEmailTLSStartTLS || valid.MaxAttempts != 5 {
		t.Fatalf("default invitation email config = %#v", valid)
	}
	if err := (InvitationEmailConfig{Mode: InvitationEmailModeDisabled, RequireDelivery: true}).Validate(); err == nil {
		t.Fatal("disabled required delivery validation returned nil")
	}
	smtp := InvitationEmailConfig{
		Mode:        InvitationEmailModeSMTP,
		PublicURL:   "https://cloudgrid.example.test",
		From:        "CloudGrid <noreply@example.test>",
		ReplyTo:     "Support <support@example.test>",
		SMTPHost:    "smtp.example.test",
		SMTPPort:    "587",
		SMTPTLS:     InvitationEmailTLSStartTLS,
		SMTPTimeout: 2 * time.Second,
		MaxAttempts: 3,
		RetryBase:   30 * time.Second,
	}
	if err := smtp.Validate(); err != nil {
		t.Fatalf("valid SMTP config returned error: %v", err)
	}
	transport := NewSMTPInvitationEmailTransport(smtp)
	if transport.Host != "smtp.example.test" || transport.Port != "587" || transport.TLSMode != InvitationEmailTLSStartTLS {
		t.Fatalf("transport = %#v, want normalized SMTP settings", transport)
	}

	tests := []InvitationEmailConfig{
		{Mode: InvitationEmailModeSMTP, PublicURL: "://bad", From: smtp.From, SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: "bad", SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: smtp.From, ReplyTo: "bad", SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: smtp.From, SMTPHost: "", SMTPPort: smtp.SMTPPort},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: smtp.From, SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort, SMTPTLS: "bogus"},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: smtp.From, SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort, SMTPTimeout: time.Millisecond},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: smtp.From, SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort, MaxAttempts: 21},
		{Mode: InvitationEmailModeSMTP, PublicURL: smtp.PublicURL, From: smtp.From, SMTPHost: smtp.SMTPHost, SMTPPort: smtp.SMTPPort, RetryBase: time.Second},
		{Mode: "ses"},
	}
	for _, config := range tests {
		if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "ERR-009") {
			t.Fatalf("Validate(%#v) error = %v, want ERR-009", config, err)
		}
	}
}

func TestInvitationEmailRenderingAndPreparationBranches(t *testing.T) {
	store := newTestStore()
	service := NewServiceWithOptions(store, fixedNow, ServiceOptions{InvitationEmail: InvitationEmailConfig{
		Mode:      InvitationEmailModeSMTP,
		PublicURL: "https://cloudgrid.example.test/app/",
		From:      "CloudGrid <noreply@example.test>",
		SMTPHost:  "smtp.example.test",
		SMTPPort:  "587",
	}})
	displayName := "Ada Lovelace"
	if err := store.PutOrganization(context.Background(), ports.OrganizationRecord{ID: LocalCompanyID, Name: "Personal", Slug: "personal"}); err != nil {
		t.Fatalf("PutOrganization: %v", err)
	}
	if err := store.PutUser(context.Background(), ports.UserRecord{ID: "inviter-1", DisplayName: &displayName}); err != nil {
		t.Fatalf("PutUser: %v", err)
	}
	if err := store.PutProject(context.Background(), ports.ProjectRecord{ID: LocalProjectID, OrganizationID: LocalCompanyID, Name: "Default"}); err != nil {
		t.Fatalf("PutProject: %v", err)
	}
	invitation := ports.InvitationRecord{
		ID:              "invite-1",
		OrganizationID:  LocalCompanyID,
		Email:           "grace@example.test",
		InvitedByUserID: "inviter-1",
		ProjectGrants: []contracts.InvitationProjectGrant{{
			ProjectID: LocalProjectID,
			Role:      contracts.ProjectRoleAdmin,
			Status:    contracts.InvitationProjectGrantStatusPending,
		}},
	}

	subject, body, err := service.renderInvitationEmailContent(context.Background(), invitation, ports.EmailDeliveryKindProjectAccess, ptr(LocalProjectID))
	if err != nil {
		t.Fatalf("renderInvitationEmailContent returned error: %v", err)
	}
	if !strings.Contains(subject, "Default") || !strings.Contains(body, "Ada Lovelace") || !strings.Contains(body, "Project role: admin") {
		t.Fatalf("rendered content subject=%q body=%q", subject, body)
	}
	delivery, err := service.prepareInvitationEmailDelivery(context.Background(), &invitation, ports.EmailDeliveryKindProjectAccess, ptr(LocalProjectID), ptr("recipient-1"))
	if err != nil {
		t.Fatalf("prepareInvitationEmailDelivery returned error: %v", err)
	}
	if delivery == nil || delivery.Template != "project_access_v1" || invitation.DeliveryStatus != contracts.InvitationDeliveryStatusPending {
		t.Fatalf("delivery=%#v invitation=%#v", delivery, invitation)
	}

	disabled := NewServiceWithOptions(store, fixedNow, ServiceOptions{InvitationEmail: InvitationEmailConfig{Mode: InvitationEmailModeDisabled}})
	suppressed := invitation
	delivery, err = disabled.prepareInvitationEmailDelivery(context.Background(), &suppressed, ports.EmailDeliveryKindOrganizationInvitation, nil, nil)
	if err != nil || delivery != nil || suppressed.DeliveryStatus != contracts.InvitationDeliveryStatusSuppressed {
		t.Fatalf("disabled delivery=%#v err=%v invitation=%#v", delivery, err, suppressed)
	}
}

func TestProcessDueInvitationEmailsHandlesSuccessRetryAndSuppression(t *testing.T) {
	ctx := context.Background()
	now := fixedNow()
	store := newTestStore()
	invitation := ports.InvitationRecord{ID: "invite-1", OrganizationID: LocalCompanyID, Email: "grace@example.test", Status: contracts.OrganizationInvitationStatusPending}
	deliveryID := "delivery-1"
	if err := store.PutInvitationAndEmailDelivery(ctx, invitation, &ports.EmailDeliveryRecord{
		ID:             deliveryID,
		OrganizationID: LocalCompanyID,
		InvitationID:   &invitation.ID,
		RecipientEmail: "grace@example.test",
		Status:         ports.EmailDeliveryStatusPending,
		Subject:        "Hello",
		Body:           "Welcome",
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		t.Fatalf("seed delivery: %v", err)
	}
	transport := &captureInvitationTransport{}
	service := NewServiceWithOptions(store, fixedNow, ServiceOptions{
		InvitationEmail: InvitationEmailConfig{Mode: InvitationEmailModeSMTP, From: "CloudGrid <noreply@example.test>", SMTPHost: "smtp.example.test", SMTPPort: "587", MaxAttempts: 2, RetryBase: 5 * time.Second},
		EmailTransport:  transport,
	})
	sent, err := service.ProcessDueInvitationEmails(ctx, 0)
	if err != nil || sent != 1 || len(transport.messages) != 1 {
		t.Fatalf("success sent=%d err=%v messages=%d", sent, err, len(transport.messages))
	}

	failingStore := newTestStore()
	failingInvitation := invitation
	failingInvitation.ID = "invite-2"
	failingDeliveryID := "delivery-2"
	if err := failingStore.PutInvitationAndEmailDelivery(ctx, failingInvitation, &ports.EmailDeliveryRecord{
		ID:             failingDeliveryID,
		OrganizationID: LocalCompanyID,
		InvitationID:   &failingInvitation.ID,
		RecipientEmail: "grace@example.test",
		Status:         ports.EmailDeliveryStatusPending,
		Subject:        "Hello",
		Body:           "Welcome",
		AttemptCount:   1,
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		t.Fatalf("seed failing delivery: %v", err)
	}
	failing := NewServiceWithOptions(failingStore, fixedNow, ServiceOptions{
		InvitationEmail: InvitationEmailConfig{Mode: InvitationEmailModeSMTP, From: "CloudGrid <noreply@example.test>", SMTPHost: "smtp.example.test", SMTPPort: "587", MaxAttempts: 3, RetryBase: 5 * time.Second},
		EmailTransport:  &captureInvitationTransport{err: errors.New("smtp down")},
	})
	sent, err = failing.ProcessDueInvitationEmails(ctx, 200)
	if sent != 0 || err == nil || !strings.Contains(err.Error(), "ERR-022") {
		t.Fatalf("retry sent=%d err=%v, want invitation delivery failure", sent, err)
	}

	orphanStore := newTestStore()
	missingID := "missing-invitation"
	if err := orphanStore.PutEmailDelivery(ctx, ports.EmailDeliveryRecord{ID: "orphan", InvitationID: &missingID, Status: ports.EmailDeliveryStatusPending, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("seed orphan delivery: %v", err)
	}
	orphan := NewServiceWithOptions(orphanStore, fixedNow, ServiceOptions{
		InvitationEmail: InvitationEmailConfig{Mode: InvitationEmailModeSMTP, From: "CloudGrid <noreply@example.test>", SMTPHost: "smtp.example.test", SMTPPort: "587"},
		EmailTransport:  &captureInvitationTransport{},
	})
	sent, err = orphan.ProcessDueInvitationEmails(ctx, 1)
	if err != nil || sent != 0 {
		t.Fatalf("orphan sent=%d err=%v", sent, err)
	}
}

func TestInvitationEmailSmallHelpers(t *testing.T) {
	if sanitizeEmailHeader(" Subject\r\nBcc: victim@example.test ") != "SubjectBcc: victim@example.test" {
		t.Fatal("sanitizeEmailHeader did not remove CRLF")
	}
	if invitationEmailTemplate(ports.EmailDeliveryKindOrganizationInvitation) != "organization_invitation_v1" ||
		invitationEmailTemplate(ports.EmailDeliveryKindProjectAccess) != "project_access_v1" {
		t.Fatal("unexpected invitation email template")
	}
	if invitationEmailRetryDelay(time.Second, 0) != time.Second ||
		invitationEmailRetryDelay(time.Hour, 3) != time.Hour {
		t.Fatal("unexpected invitation email retry delay bounds")
	}
}
