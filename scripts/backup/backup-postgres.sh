#!/bin/sh
# Backup do Postgres do VuumBora: dump -> verificacao -> (cifra) -> envio externo -> retencao.
#
# Rodar:  DATABASE_URL=postgres://... sh scripts/backup/backup-postgres.sh
# Em producao roda sozinho, 1x por dia, no servico `vuumbora-backup` (ver
# scripts/backup/Dockerfile e docs/backup-e-restauracao.md).
#
# Variaveis:
#   DATABASE_URL         obrigatoria. String de conexao do banco a copiar.
#   BACKUP_DIR           onde guardar a copia local (padrao: ./backups)
#   BACKUP_PASSPHRASE    opcional mas RECOMENDADA: cifra o arquivo (AES-256) antes de
#                        sair do servidor. O banco tem dado pessoal (LGPD).
#   RCLONE_REMOTE        opcional. Destino externo, ex.: r2:vuumbora-backups/postgres
#                        (o remote e configurado por RCLONE_CONFIG_* no ambiente).
#   RETENTION_DAYS       dias de copias mantidas, local e remoto (padrao: 14)
#   HEALTHCHECK_URL      opcional. URL de monitor externo tipo "dead-man switch"
#                        (healthchecks.io): pingamos no fim; se um dia o ping nao
#                        chegar, o servico avisa o dono.
#
# Falha alto: qualquer etapa que der errado encerra com codigo != 0 e NAO pinga o
# healthcheck de sucesso (pinga /fail se a URL existir).
set -eu

: "${DATABASE_URL:?DATABASE_URL nao definida}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="vuumbora-${STAMP}"
DUMP="${BACKUP_DIR}/${BASE}.dump"

mkdir -p "$BACKUP_DIR"

ping_fail() {
  if [ -n "${HEALTHCHECK_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL%/}/fail" >/dev/null 2>&1 || true
  fi
}
# shellcheck disable=SC2154
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "[backup] FALHOU (codigo $rc)" >&2; rm -f "$DUMP" "$DUMP.enc"; ping_fail; fi' EXIT

echo "[backup] $(date -u +%H:%M:%SZ) pg_dump -> ${DUMP}"
START=$(date +%s)
# custom format: comprimido, permite restaurar tabela a tabela. Sem dono/privilegios:
# a restauracao nao pode depender de o usuario de producao existir no destino.
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"

# Um dump que nao le de volta nao e backup. pg_restore --list percorre o arquivo todo.
pg_restore --list "$DUMP" >/dev/null
SIZE=$(wc -c <"$DUMP" | tr -d ' ')
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup] dump suspeito de pequeno (${SIZE} bytes)" >&2
  exit 1
fi

OUT="$DUMP"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  OUT="${DUMP}.enc"
  PASS="$BACKUP_PASSPHRASE" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -pass env:PASS -in "$DUMP" -out "$OUT"
  rm -f "$DUMP"
else
  echo "[backup] AVISO: BACKUP_PASSPHRASE vazia, copia sem cifra" >&2
fi

if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "[backup] enviando para ${RCLONE_REMOTE}"
  rclone copyto "$OUT" "${RCLONE_REMOTE%/}/$(basename "$OUT")"
  # Confere que chegou do outro lado, nao so que o comando saiu com 0.
  rclone lsl "${RCLONE_REMOTE%/}/$(basename "$OUT")" >/dev/null
  rclone delete "${RCLONE_REMOTE%/}" --min-age "${RETENTION_DAYS}d" --include "vuumbora-*.dump*"
else
  echo "[backup] AVISO: RCLONE_REMOTE vazio, a copia ficou so neste servidor" >&2
fi

# Retencao local
find "$BACKUP_DIR" -maxdepth 1 -name 'vuumbora-*.dump*' -mtime "+${RETENTION_DAYS}" -exec rm -f {} \;

ELAPSED=$(( $(date +%s) - START ))
echo "[backup] ok: $(basename "$OUT") $(wc -c <"$OUT" | tr -d ' ') bytes em ${ELAPSED}s"

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null
fi
