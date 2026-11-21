#!/bin/sh
# Entrypoint do servico de backup: agenda o backup no cron e fica em primeiro plano.
#
# O crond nao repassa as variaveis do container aos jobs, entao gravamos o ambiente num
# arquivo (so leitura do root) e o job o carrega antes de rodar.
#
# BACKUP_ON_START=1 roda um backup imediato ao subir: e como o dono confere no primeiro
# dia, sem esperar as 06:00 UTC, que a cadeia inteira funciona (dump, cifra, envio, ping).
set -eu

: "${DATABASE_URL:?DATABASE_URL nao definida}"

export -p >/etc/backup.env
chmod 600 /etc/backup.env

echo "${BACKUP_CRON} . /etc/backup.env && /opt/backup/backup-postgres.sh >>/proc/1/fd/1 2>>/proc/1/fd/2" \
  >/etc/crontabs/root

if [ "${BACKUP_ON_START:-0}" = "1" ]; then
  /opt/backup/backup-postgres.sh || echo "[backup] backup inicial falhou, cron segue agendado" >&2
fi

echo "[backup] agendado: ${BACKUP_CRON} (UTC)"
exec crond -f -l 8
