module github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner

go 1.25.0

require (
	github.com/cloudgrid-dev/cloudgrid/core/go-contracts v1.0.0
	github.com/cloudgrid-dev/cloudgrid/core/go-runtime v1.0.0
	github.com/nats-io/nats.go v1.52.0
)

require (
	github.com/grpc-ecosystem/grpc-gateway/v2 v2.28.0 // indirect
	github.com/klauspost/compress v1.18.6 // indirect
	github.com/nats-io/nkeys v0.4.15 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	go.opentelemetry.io/proto/otlp v1.10.0 // indirect
	golang.org/x/crypto v0.52.0 // indirect
	golang.org/x/net v0.55.0 // indirect
	golang.org/x/sys v0.45.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20260209200024-4cfbd4190f57 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260209200024-4cfbd4190f57 // indirect
	google.golang.org/grpc v1.79.3 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)

replace github.com/cloudgrid-dev/cloudgrid/core/go-contracts => ../go-contracts

replace github.com/cloudgrid-dev/cloudgrid/core/go-runtime => ../go-runtime
