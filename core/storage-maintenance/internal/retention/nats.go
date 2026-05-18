package retention

import (
	"fmt"

	"github.com/nats-io/nats.go"
)

func ConnectNATS(url string) (*nats.Conn, error) {
	conn, err := nats.Connect(url, nats.Name("cloudgrid-storage-maintenance"))
	if err != nil {
		return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS connection failed")
	}
	return conn, nil
}

func SubscribeHandlers(nc *nats.Conn, service *RuntimeService) ([]*nats.Subscription, error) {
	subscriptions := make([]*nats.Subscription, 0, len(service.SubjectHandlers()))
	for subject, handler := range service.SubjectHandlers() {
		subscription, err := nc.Subscribe(subject, func(msg *nats.Msg) {
			handler(natsBridgeMessage{msg: msg})
		})
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
