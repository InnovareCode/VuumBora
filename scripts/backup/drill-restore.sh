#!/bin/sh
# Ensaio de restauracao: prova, com contagem de linhas, que backup -> restore devolve os dados.
#
#   ADMIN_URL=postgres://postgres:senha@localhost:5432/postgres sh scripts/backup/drill-restore.sh
#
# 1. cria banco de origem, aplica as migracoes reais e semeia linhas sinteticas
# 2. backup-postgres.sh (com cifra)  3. cria banco novo e restaura com restore-postgres.sh
# 4. compara a contagem de linhas de TODAS as tabelas de public, antes x depois
# Sai com codigo != 0 se qualquer contagem divergir. Apaga os dois bancos ao fim.
set -eu

: "${ADMIN_URL:?ADMIN_URL (conexao com permissao de CREATE DATABASE) nao definida}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
SUF="$$"
SRC="vuumbora_drill_origem_${SUF}"
DST="vuumbora_drill_destino_${SUF}"
WORK="$(mktemp -d)"
# troca so o nome do banco no final da URL
url_for() { printf '%s' "$ADMIN_URL" | sed -E "s#/[^/?]+(\?.*)?\$#/$1\1#"; }
SRC_URL="$(url_for "$SRC")"
DST_URL="$(url_for "$DST")"

cleanup() {
  psql "$ADMIN_URL" -qc "drop database if exists ${SRC} with (force)" >/dev/null 2>&1 || true
  psql "$ADMIN_URL" -qc "drop database if exists ${DST} with (force)" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

CONTAGEM_SQL="select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"

psql "$ADMIN_URL" -qc "create database ${SRC}"
# Imita o runner da API (apps/api/src/migrate.ts): tabela schema_migrations primeiro (migracoes
# recentes fazem GRANT/REVOKE nela) e cada arquivo na propria transacao, registrado ao fim.
# Se o runner mudar de forma, ajuste aqui; o ensaio do CI acusa na hora.
psql "$SRC_URL" -q -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
for f in "$RAIZ"/apps/api/migrations/*.sql; do
  if ! psql "$SRC_URL" -q -v ON_ERROR_STOP=1 --single-transaction -f "$f"       -c "INSERT INTO schema_migrations (id) VALUES ('$(basename "$f")')" >/dev/null 2>&1; then
    echo "migracao falhou: $f" >&2
    exit 1
  fi
done

# Semente sintetica (nada de dado real). Volume suficiente para o tempo significar algo.
psql "$SRC_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
insert into waitlist_signups (email, profile)
  select 'lista' || g || '@exemplo.invalid', case when g % 2 = 0 then 'driver' else 'passenger' end
  from generate_series(1, 20000) g;
insert into driver_applications (name, email, phone, city, state, status)
  select 'Candidato ' || g, 'cand' || g || '@exemplo.invalid', '+5584900' || lpad(g::text, 6, '0'),
         'Natal', 'RN', (array['pending','approved','rejected'])[1 + g % 3]
  from generate_series(1, 5000) g;
SQL

psql "$SRC_URL" -Atc "$CONTAGEM_SQL" >"$WORK/antes.txt"

BACKUP_DIR="$WORK/backups" BACKUP_PASSPHRASE="senha-de-ensaio" DATABASE_URL="$SRC_URL" \
  sh "$AQUI/backup-postgres.sh"

psql "$ADMIN_URL" -qc "create database ${DST}"
ARQ="$(ls "$WORK"/backups/vuumbora-*.dump.enc)"
TARGET_DATABASE_URL="$DST_URL" BACKUP_PASSPHRASE="senha-de-ensaio" sh "$AQUI/restore-postgres.sh" "$ARQ"

psql "$DST_URL" -Atc "$CONTAGEM_SQL" >"$WORK/depois.txt"

echo "---- linhas ANTES (origem) ----"; cat "$WORK/antes.txt"
echo "---- linhas DEPOIS (restaurado) ----"; cat "$WORK/depois.txt"
if diff -u "$WORK/antes.txt" "$WORK/depois.txt"; then
  echo "DRILL OK: contagens identicas em todas as tabelas"
else
  echo "DRILL FALHOU: contagens divergem" >&2
  exit 1
fi
