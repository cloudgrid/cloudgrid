package internal

import (
	"fmt"
	"log/slog"

	"github.com/nats-io/nats.go"
)

func ConnectNATS(url string) (*nats.Conn, error) {
	conn, err := nats.Connect(url, nats.Name("cloudgrid-control-plane"))
	if err != nil {
		return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS connection failed")
	}
	return conn, nil
}

type ControlHandlerOptions struct {
	SelfObservability SelfObservabilityRecorder
}

func SubscribeControlHandlers(nc *nats.Conn, service *Service, logger *slog.Logger) ([]*nats.Subscription, error) {
	return SubscribeControlHandlersWithOptions(nc, service, logger, ControlHandlerOptions{})
}

func SubscribeControlHandlersWithOptions(nc *nats.Conn, service *Service, logger *slog.Logger, options ControlHandlerOptions) ([]*nats.Subscription, error) {
	publisher := natsMessagePublisher{nc: nc}
	handlers := map[string]bridgeMessageHandler{
		SubjectViewerGet:                handleViewerGet(service, logger),
		SubjectOrganizationsList:        handleOrganizationsList(service, logger),
		SubjectOrganizationsGet:         handleOrganizationsGet(service, logger),
		SubjectProjectsList:             handleProjectsList(service, logger),
		SubjectProjectsGet:              handleProjectsGet(service, logger),
		SubjectProjectsCreate:           handleProjectsCreate(service, logger),
		SubjectProjectsUpdate:           handleProjectsUpdate(service, publisher, logger),
		SubjectProjectsSelect:           handleProjectsSelect(service, logger),
		SubjectMembersList:              handleMembersList(service, logger),
		SubjectMembersUpdate:            handleMembersUpdate(service, logger),
		SubjectMembersRemove:            handleMembersRemove(service, logger),
		SubjectInvitationsList:          handleInvitationsList(service, logger),
		SubjectInvitationsCreate:        handleInvitationsCreate(service, logger),
		SubjectInvitationsResend:        handleInvitationsResend(service, logger),
		SubjectInvitationsRevoke:        handleInvitationsRevoke(service, logger),
		SubjectProjectInvitationsCreate: handleProjectInvitationsCreate(service, logger),
		SubjectIngestCredentialsList:    handleIngestCredentialsList(service, logger),
		SubjectIngestCredentialsCreate:  handleIngestCredentialsCreate(service, logger),
		SubjectIngestCredentialsRevoke:  handleIngestCredentialsRevoke(service, logger),
		SubjectProjectStatusSnapshot:    handleProjectStatusSnapshot(service, logger),
		SubjectDashboardsList:           handleDashboardsList(service, logger),
		SubjectDashboardsSave:           handleDashboardsSave(service, logger),
		SubjectDashboardsDelete:         handleDashboardsDelete(service, logger),
		SubjectDashboardPinsSet:         handleDashboardPinsSet(service, logger),
		SubjectDashboardPinsReorder:     handleDashboardPinsReorder(service, logger),
		SubjectProjectAiSettingsGet:     handleProjectAiSettingsGet(service, logger),
		SubjectProjectAiSettingsUpdate:  handleProjectAiSettingsUpdate(service, logger),
		SubjectProjectMembersList:       handleProjectMembersList(service, logger),
		SubjectProjectMembersUpdate:     handleProjectMembersUpdate(service, logger),
		SubjectProjectMembersRemove:     handleProjectMembersRemove(service, logger),
		SubjectRetentionGet:             handleRetentionGet(service, logger),
		SubjectRetentionUpdate:          handleRetentionUpdate(service, logger),
		SubjectAlertRulesList:           handleAlertRulesList(service, logger),
		SubjectAlertRulesCreate:         handleAlertRulesCreate(service, logger),
		SubjectAlertRulesUpdate:         handleAlertRulesUpdate(service, logger),
		SubjectAlertRulesDelete:         handleAlertRulesDelete(service, logger),
		SubjectAlertSilencesList:        handleAlertSilencesList(service, logger),
		SubjectAlertSilencesCreate:      handleAlertSilencesCreate(service, logger),
		SubjectAlertSilencesDelete:      handleAlertSilencesDelete(service, logger),
		SubjectAlertHistoryList:         handleAlertHistoryList(service, logger),
		SubjectAlertHistoryRecord:       handleAlertHistoryRecord(service, logger),
	}
	subscriptions := make([]*nats.Subscription, 0, len(handlers))
	for subject, handler := range handlers {
		subscription, err := nc.Subscribe(subject, adaptNATSHandler(adaptBridgeHandlerWithSelfObservability(subject, handler, options.SelfObservability)))
		if err != nil {
			return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS subscribe failed")
		}
		subscriptions = append(subscriptions, subscription)
	}
	if err := nc.Flush(); err != nil {
		return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS subscription flush failed")
	}
	return subscriptions, nil
}

type natsBridgeMessage struct {
	msg *nats.Msg
}

func (message natsBridgeMessage) Data() []byte {
	return message.msg.Data
}

func (message natsBridgeMessage) Respond(response []byte) error {
	return message.msg.Respond(response)
}

func (message natsBridgeMessage) Header(name string) string {
	return message.msg.Header.Get(name)
}

type natsMessagePublisher struct {
	nc *nats.Conn
}

func (publisher natsMessagePublisher) Publish(subject string, data []byte) error {
	return publisher.nc.Publish(subject, data)
}

func adaptNATSHandler(handler bridgeMessageHandler) nats.MsgHandler {
	return func(msg *nats.Msg) {
		handler(natsBridgeMessage{msg: msg})
	}
}
