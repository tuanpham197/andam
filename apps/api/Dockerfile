# API image, built from the repository root (npm workspaces + catalog/ live there):
#   docker build -f apps/api/Dockerfile -t appandam-api .
FROM node:24.11.1-slim AS base
# Prisma's schema engine (migrate deploy) needs OpenSSL; slim images ship without it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Workspace manifests first so the dependency layer is cached until they change.
# postinstall runs `prisma generate`, which needs the schema and its config.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/

FROM base AS build
RUN npm ci --workspace apps/api --include-workspace-root --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build --workspace apps/api

FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --workspace apps/api --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
# The seed reads catalog/ at the repository root.
COPY catalog catalog
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Migrations are backward compatible (docs §9), so they run before the new version starts.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
