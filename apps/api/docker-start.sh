#!/bin/sh
# Container entry point: migrate, then start the API. Fails fast with a readable hint instead of
# hanging until the platform's port scan gives up.
set -e

case "$DATABASE_URL" in
  *:6543/* | *pgbouncer=true*)
    echo "DATABASE_URL points to a transaction pooler (port 6543 / pgbouncer=true)." >&2
    echo "prisma migrate deploy hangs there: use Supabase's session pooler (port 5432)." >&2
    exit 1
    ;;
esac

if ! timeout 120 npx prisma migrate deploy; then
  echo "prisma migrate deploy failed or did not finish within 120 s — check DATABASE_URL." >&2
  exit 1
fi

exec node dist/main.js
