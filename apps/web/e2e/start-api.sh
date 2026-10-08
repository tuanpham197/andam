#!/usr/bin/env sh
# Starts an API for the Playwright suite on its own database (never the dev one). Nothing is
# reset: migrations and the catalog seed are idempotent and every test signs up a fresh account.
set -eu
cd "$(dirname "$0")/../../api"

export NODE_ENV=test
export PORT="${E2E_API_PORT:-3200}"
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://appandam:appandam@localhost:5433/appandam_e2e}"
export JWT_SECRET="${E2E_JWT_SECRET:-e2e-secret-e2e-secret-e2e-secret-e2e}"
export CORS_ORIGINS="http://localhost:${E2E_WEB_PORT:-4300}"
export WEB_BASE_URL="http://localhost:${E2E_WEB_PORT:-4300}"
export SMTP_URL=disabled
export LOG_LEVEL=warn
# Every test signs up from the same address.
export AUTH_RATE_LIMIT=100000
export API_RATE_LIMIT=1000000
export ACCOUNT_PURGE_INTERVAL_MINUTES=0

npx nest build
npx prisma migrate deploy
node dist/seed.js
exec node dist/main.js
