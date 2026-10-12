# Build from the repository root. Use --platform linux/amd64 for Cloud Run.
ARG NODE_IMAGE=node:22.23.2-trixie-slim@sha256:c5849ff9c9ebcd66615412f0b548ca5b8ecaef84003dc9ac2e077ebe46aaa3f6
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

FROM manifests AS build
RUN npm ci --include=dev --workspace=@copilot/api --workspace=@copilot/contracts --include-workspace-root=false --registry=https://registry.npmjs.org
COPY apps/api/src apps/api/src
COPY packages/contracts/src packages/contracts/src
RUN npm run build --workspace @copilot/api

FROM manifests AS production-dependencies
RUN npm ci --omit=dev --workspace=@copilot/api --workspace=@copilot/contracts --include-workspace-root=false --registry=https://registry.npmjs.org \
    && mkdir -p apps/api/node_modules packages/contracts/node_modules

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
      /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=production-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies --chown=node:node /app/packages/contracts ./packages/contracts
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node fixtures/manifest.json ./fixtures/manifest.json
COPY --chown=node:node fixtures/audio ./fixtures/audio
COPY --chown=node:node fixtures/conversations ./fixtures/conversations
COPY --chown=node:node fixtures/expected ./fixtures/expected
ENV NODE_ENV=production ANALYSIS_MODE=live FIXTURE_DIR=/app/fixtures PORT=8080
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "apps/api/dist/server.js"]
