FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --include=dev --registry=https://registry.npmjs.org
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace @copilot/api && npm prune --omit=dev

FROM node:22.23.2-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node fixtures ./fixtures
ENV NODE_ENV=production FIXTURE_DIR=/app/fixtures PORT=8080
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
