ARG CLOUDGRID_GO_BUILDER_IMAGE=golang:1.25.0-alpine
ARG CLOUDGRID_GO_RUNTIME_IMAGE=gcr.io/distroless/static-debian12:nonroot

FROM ${CLOUDGRID_GO_BUILDER_IMAGE} AS builder
WORKDIR /workspace
COPY go.work ./
COPY core core
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/cloudgrid-otlp-collector ./core/otlp-collector/cmd/otlp-collector

FROM ${CLOUDGRID_GO_RUNTIME_IMAGE} AS runtime
ARG CLOUDGRID_IMAGE_UID=10001
ARG CLOUDGRID_IMAGE_GID=10001
WORKDIR /
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /out/cloudgrid-otlp-collector /cloudgrid-otlp-collector
USER ${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID}
EXPOSE 4318 4317
ENTRYPOINT ["/cloudgrid-otlp-collector"]
