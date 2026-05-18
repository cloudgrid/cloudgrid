ARG CLOUDGRID_BUN_BUILDER_IMAGE=oven/bun:1.3.13-debian
ARG CLOUDGRID_BUN_RUNTIME_IMAGE=oven/bun:1.3.13-slim

FROM ${CLOUDGRID_BUN_BUILDER_IMAGE} AS builder
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/packages apps/packages
RUN bun install --frozen-lockfile
COPY apps/backend apps/backend
COPY apps/frontend apps/frontend
RUN bun run --cwd apps/packages/definition build \
  && bun run --cwd apps/packages/runtime build \
  && bun run --cwd apps/packages/ui-contracts build \
  && bun run --cwd apps/frontend build \
  && rm -rf apps/backend/public \
  && mkdir -p apps/backend/public \
  && cp -R apps/frontend/dist/. apps/backend/public/ \
  && bun run --cwd apps/backend build

FROM ${CLOUDGRID_BUN_RUNTIME_IMAGE} AS runtime
ARG CLOUDGRID_IMAGE_UID=10001
ARG CLOUDGRID_IMAGE_GID=10001
WORKDIR /app
ENV NODE_ENV=production \
  CLOUDGRID_FRONTEND_SERVE_STATIC=true \
  CLOUDGRID_FRONTEND_STATIC_DIR=/app/apps/backend/public
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/package.json /app/package.json
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/bun.lock /app/bun.lock
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/node_modules /app/node_modules
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/apps/backend/package.json /app/apps/backend/package.json
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/apps/backend/dist /app/apps/backend/dist
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/apps/backend/public /app/apps/backend/public
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/apps/packages/runtime /app/apps/packages/runtime
COPY --from=builder --chown=${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID} /workspace/apps/packages/ui-contracts /app/apps/packages/ui-contracts
USER ${CLOUDGRID_IMAGE_UID}:${CLOUDGRID_IMAGE_GID}
EXPOSE 3000
ENTRYPOINT ["bun", "run", "apps/backend/dist/index.js"]
