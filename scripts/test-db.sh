#!/usr/bin/env bash
# Starts a throwaway PostgreSQL 16 cluster, applies the Supabase auth stub and
# all migrations, runs the database (RLS) test suite, then stops the cluster.
#
# Requires either local PostgreSQL binaries (initdb/pg_ctl) or Docker.
# Usage: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${TEST_DB_PORT:-54329}"
export TEST_DATABASE_URL="postgres://postgres@127.0.0.1:${PORT}/pi_test"

apply_schema() {
  psql -v ON_ERROR_STOP=1 -q "postgres://postgres@127.0.0.1:${PORT}/postgres" -c "drop database if exists pi_test" -c "create database pi_test"
  psql -v ON_ERROR_STOP=1 -q "$TEST_DATABASE_URL" -f supabase/tests/auth-stub.sql
  for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q "$TEST_DATABASE_URL" -f "$f"; done
}

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$PGBIN" ] && [ -x "$PGBIN/initdb" ]; then
  DATA="$(mktemp -d)"
  RUN_AS=()
  if [ "$(id -u)" = "0" ]; then chown postgres "$DATA"; chmod 755 "$DATA"; RUN_AS=(su postgres -c); fi
  run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
  run "$PGBIN/initdb -D $DATA/data -A trust -U postgres >/dev/null"
  run "$PGBIN/pg_ctl -D $DATA/data -o '-p $PORT -k $DATA -c listen_addresses=127.0.0.1' -l $DATA/log -w start >/dev/null"
  trap 'run "$PGBIN/pg_ctl -D $DATA/data -m fast stop >/dev/null"; rm -rf "$DATA"' EXIT
elif command -v docker >/dev/null 2>&1; then
  CID="$(docker run -d --rm -e POSTGRES_HOST_AUTH_METHOD=trust -p "${PORT}:5432" postgres:16)"
  trap 'docker stop "$CID" >/dev/null' EXIT
  for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break; sleep 1; done
else
  echo "PostgreSQL binaries or Docker are required for database tests." >&2
  exit 1
fi

apply_schema
npx vitest run tests/db
