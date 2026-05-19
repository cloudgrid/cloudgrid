module github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance

go 1.23

require github.com/cloudgrid-dev/cloudgrid/core/go-contracts v1.0.0

require github.com/cloudgrid-dev/cloudgrid/core/go-runtime v1.0.0

require (
	github.com/nats-io/nats.go v1.52.0
	github.com/surrealdb/surrealdb.go v1.4.0
)

require (
	github.com/fxamacker/cbor/v2 v2.7.0 // indirect
	github.com/gofrs/uuid v4.4.0+incompatible // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/klauspost/compress v1.18.5 // indirect
	github.com/nats-io/nkeys v0.4.15 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	golang.org/x/crypto v0.49.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
)

replace github.com/cloudgrid-dev/cloudgrid/core/go-contracts => ../go-contracts

replace github.com/cloudgrid-dev/cloudgrid/core/go-runtime => ../go-runtime
