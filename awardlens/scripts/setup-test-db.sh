#!/usr/bin/env bash
# Creates (or recreates) a Postgres database with the AwardLens schema applied.
#
#   ./scripts/setup-test-db.sh awardlens_test
#
# Prints the connection string on stdout so it can be captured:
#   export DATABASE_URL="$(./scripts/setup-test-db.sh awardlens_test)"
#
# Expects a running cluster reachable on PGHOST/PGPORT (defaults below match the
# local development cluster). The `auth`, `storage` and `extensions` schemas are
# stubbed because the migrations target Supabase, which provides them; the stubs
# are only what the migrations reference, nothing more.
set -euo pipefail

DB_NAME="${1:-awardlens_test}"
PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q -c "drop database if exists $DB_NAME;" >/dev/null
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q -c "create database $DB_NAME;" >/dev/null

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase provides these. The migrations reference them, so stub the minimum.
create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default extensions.gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
SQL

for migration in "$MIGRATIONS_DIR"/*.sql; do
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

echo "postgres://${PGUSER}@${PGTCPHOST:-127.0.0.1}:${PGPORT}/${DB_NAME}"
