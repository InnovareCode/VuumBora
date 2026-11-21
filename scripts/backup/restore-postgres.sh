#!/bin/sh
# Restaura um backup do VuumBora num banco de DESTINO.
#
#   TARGET_DATABASE_URL=postgres://.../vuumbora_restaurado \
#   [BACKUP_PASSPHRASE=...] sh scripts/backup/restore-postgres.sh <arquivo.dump|.dump.enc>
#
# O destino tem de existir e estar VAZIO. O script recusa restaurar por cima de um
# banco que ja tem tabelas, a menos que FORCE=1: o erro mais caro desta operacao e
# restaurar no banco de producao achando que era o de teste.
set -eu

ARQ="${1:?uso: restore-postgres.sh <arquivo.dump|.dump.enc>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL nao definida}"
[ -f "$ARQ" ] || { echo "arquivo nao existe: $ARQ" >&2; exit 1; }

EXISTENTES=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")
if [ "$EXISTENTES" != "0" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "destino ja tem $EXISTENTES tabela(s) em public. Recusado. Use FORCE=1 se tiver certeza." >&2
  exit 1
fi

TMP=""
cleanup() { if [ -n "$TMP" ]; then rm -f "$TMP"; fi; }
trap cleanup EXIT

case "$ARQ" in
  *.enc)
    : "${BACKUP_PASSPHRASE:?arquivo cifrado: defina BACKUP_PASSPHRASE}"
    TMP="$(mktemp)"
    PASS="$BACKUP_PASSPHRASE" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
      -pass env:PASS -in "$ARQ" -out "$TMP"
    ARQ="$TMP"
    ;;
esac

START=$(date +%s)
if [ "${FORCE:-0}" = "1" ]; then
  pg_restore --no-owner --no-privileges --clean --if-exists --single-transaction \
    --dbname="$TARGET_DATABASE_URL" "$ARQ"
else
  pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
    --dbname="$TARGET_DATABASE_URL" "$ARQ"
fi
echo "[restore] ok em $(( $(date +%s) - START ))s"
