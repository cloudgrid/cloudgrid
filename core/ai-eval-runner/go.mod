module github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner

go 1.23

require (
	github.com/cloudgrid-dev/cloudgrid/core/go-contracts v0.0.0
	github.com/cloudgrid-dev/cloudgrid/core/go-runtime v0.0.0
	github.com/nats-io/nats.go v1.52.0
)

require (
	github.com/klauspost/compress v1.18.5 // indirect
	github.com/nats-io/nkeys v0.4.15 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	golang.org/x/crypto v0.49.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
)

replace github.com/cloudgrid-dev/cloudgrid/core/go-contracts => ../go-contracts

replace github.com/cloudgrid-dev/cloudgrid/core/go-runtime => ../go-runtime
