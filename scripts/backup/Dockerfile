# syntax=docker/dockerfile:1
#
# Servico `vuumbora-backup`: roda scripts/backup/backup-postgres.sh todo dia, sozinho.
# Contexto de build = raiz do repositorio (mesmo padrao dos outros Dockerfiles).
# No Easypanel: novo servico "App", fonte Github, Dockerfile Path = scripts/backup/Dockerfile.
# Variaveis de ambiente do servico: ver docs/backup-e-restauracao.md (nunca no repositorio).
#
# Base postgres:18-alpine so para ter pg_dump/pg_restore/psql na versao 18: cliente mais novo
# le servidor mais antigo, o contrario falha. O servidor em si NUNCA sobe aqui.
FROM postgres:18-alpine

RUN apk add --no-cache rclone curl openssl tzdata

WORKDIR /opt/backup
COPY scripts/backup/backup-postgres.sh scripts/backup/restore-postgres.sh scripts/backup/entrypoint.sh ./
RUN chmod +x ./*.sh

# 06:00 UTC = 03:00 em Natal (UTC-3), horario de menor uso.
ENV BACKUP_CRON="0 6 * * *" \
    BACKUP_DIR=/backups \
    RETENTION_DAYS=14

VOLUME ["/backups"]
# crond precisa de root; o container nao expoe nenhuma porta.
ENTRYPOINT ["/opt/backup/entrypoint.sh"]
