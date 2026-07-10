module github.com/cloudgrid-dev/cloudgrid/core/otlp-collector

go 1.25.0

require (
	github.com/cloudgrid-dev/cloudgrid/core/go-contracts v1.0.0
	github.com/cloudgrid-dev/cloudgrid/core/go-runtime v1.0.0
	github.com/nats-io/nats.go v1.52.0
	go.opentelemetry.io/proto/otlp v1.10.0
	google.golang.org/grpc v1.82.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/grpc-ecosystem/grpc-gateway/v2 v2.29.0 // indirect
	github.com/klauspost/compress v1.18.6 // indirect
	github.com/nats-io/nkeys v0.4.15 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	golang.org/x/crypto v0.52.0 // indirect
	golang.org/x/net v0.55.0 // indirect
	golang.org/x/sys v0.45.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20260511170946-3700d4141b60 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260511170946-3700d4141b60 // indirect
)

replace github.com/cloudgrid-dev/cloudgrid/core/go-contracts => ../go-contracts

replace github.com/cloudgrid-dev/cloudgrid/core/go-runtime => ../go-runtime
