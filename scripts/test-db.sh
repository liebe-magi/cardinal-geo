#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Refuse production-like targets and nonempty databases: the bootstrap is test-only.
[[ "${PGDATABASE:-}" == cardinal_geo_test* ]] || { echo 'PGDATABASE must start with cardinal_geo_test'; exit 1; }
[[ "$(psql -X -Atc "select count(*) from information_schema.tables where table_schema in ('public','auth')")" == 0 ]] || { echo 'Use a new, empty test database'; exit 1; }
files=(tests/db-bootstrap.sql supabase/schema.sql
  supabase/migrations/20261004_answer_presentation.sql
  supabase/migrations/20261004_game_catalog.sql
  supabase/migrations/20261004_game_sessions.sql
  supabase/migrations/20261004_server_scoring.sql
  supabase/migrations/20261004_share_snapshots.sql
  tests/server-scoring.sql tests/share-snapshots.sql tests/db-concurrency.sql)
for file in "${files[@]}"; do
  echo "Checking $file"
  psql -X -v ON_ERROR_STOP=1 -f "$file" > /dev/null
done
