# Backup e restauração do Postgres

Escrito em 21/11/2026 (Vulcano). Estado: **scripts prontos e restauração provada
em Postgres local; nada foi ligado em produção ainda.** A ativação é a seção 5
e depende do painel do Easypanel (ação do dono).

## Por que existe

O banco `vuumbora` guarda candidaturas de motoristas e a lista de espera: dado
pessoal (LGPD) que não se recupera pedindo de novo. O volume do Postgres no
mesmo servidor **não é backup**: o mesmo disco, o mesmo provedor, a mesma conta.
A cópia tem de sair do servidor, todo dia, cifrada.

## O que foi feito

| Peça | Arquivo | Função |
|---|---|---|
| Backup | `scripts/backup/backup-postgres.sh` | `pg_dump` -> confere que o dump lê de volta -> cifra (AES-256) -> envia para fora -> apaga o que passou da retenção -> avisa o monitor |
| Restauração | `scripts/backup/restore-postgres.sh` | decifra e restaura num banco **vazio**; recusa banco com tabelas, a menos que `FORCE=1` |
| Ensaio | `scripts/backup/drill-restore.sh` | migrações reais + dados sintéticos -> backup -> restauração -> **compara contagem de linhas de todas as tabelas** |
| Agendamento | `scripts/backup/Dockerfile` + `entrypoint.sh` | serviço `vuumbora-backup`: cron interno, diário às 06:00 UTC (03:00 em Natal) |
| CI | job `backup-drill` em `.github/workflows/ci.yml` | repete o ensaio em todo PR e **toda segunda-feira**, para o procedimento não apodrecer em silêncio |

## Prova (medida em 21/11/2026, PostgreSQL 18.1 local, porta isolada)

Comando: `ADMIN_URL=postgres://postgres:***@localhost:<porta>/postgres sh scripts/backup/drill-restore.sh`

Contagem de linhas, idêntica antes (origem) e depois (restaurado), em **todas**
as 17 tabelas de `public` das migrações 0001 a 0013 (inclui `schema_migrations`,
com 13 linhas, o que garante que o backend restaurado não reaplica migração):

| Tabela | Antes | Depois |
|---|---|---|
| waitlist_signups | 20000 | 20000 |
| driver_applications | 5000 | 5000 |
| schema_migrations | 13 | 13 |
| as outras 14 (admin_*, accounts, account_*, access_log, devices, login_attempts, refresh_token*) | 0 | 0 |

Tempos: dump + verificação + cifra e restauração levaram **cerca de 1 s cada**;
o ensaio completo (criar bancos, aplicar as 13 migrações, semear 25 mil linhas,
backup, restauração, comparação) levou **10 s**. Na primeira rodada, 25 mil
linhas viraram um arquivo cifrado de 714 KB.

Atenção: as migrações 0010 a 0013 ainda não estavam commitadas quando o ensaio
rodou; a prova vale para o conjunto que estava no disco. O CI repete a prova em
cada commit.

Também provado, de propósito (caminhos de falha):

- restaurar por cima de banco com tabela: **recusado**, código 1;
- senha de cifra errada: falha na decifragem e **o destino fica intocado** (0 tabelas);
- banco de origem inexistente: backup **falha**, não deixa arquivo parcial.

O que **não** está provado, e não finjo que está: o envio ao destino externo
(`rclone`, não há destino configurado nesta máquina), o contêiner
(`scripts/backup/Dockerfile` nunca foi construído, sem Docker aqui; o job do CI
exercita os scripts, não a imagem) e o ping do monitor. O primeiro backup real
é o teste dessas três peças, por isso o passo 5.4 existe.

**Tempo real em produção será maior** que 1 s: o ensaio tem 25 mil linhas e o
tempo cresce com o banco. Meça de novo no primeiro backup real e anote aqui.

## Comandos

Backup manual (precisa de `pg_dump` 18 ou mais novo; a imagem do serviço já traz):

```sh
DATABASE_URL='postgres://usuario:senha@host:5432/vuumbora' \
BACKUP_DIR=./backups BACKUP_PASSPHRASE='a-frase-guardada-no-cofre' \
sh scripts/backup/backup-postgres.sh
```

Restaurar num banco novo (o destino **tem de existir e estar vazio**):

```sh
psql "$ADMIN_URL" -c 'create database vuumbora_restaurado'
TARGET_DATABASE_URL='postgres://usuario:senha@host:5432/vuumbora_restaurado' \
BACKUP_PASSPHRASE='a-frase-guardada-no-cofre' \
sh scripts/backup/restore-postgres.sh backups/vuumbora-AAAAMMDDTHHMMSSZ.dump.enc
```

Sem cifra (arquivo `.dump`), omita `BACKUP_PASSPHRASE`. Baixar do destino externo:
`rclone copy r2:vuumbora-backups/postgres/<arquivo> .`

Ensaio completo, quando quiser reconferir:

```sh
ADMIN_URL='postgres://postgres:senha@localhost:5432/postgres' sh scripts/backup/drill-restore.sh
```

## Desastre: banco de produção perdido

1. Pare o `vuumbora-backend` (ele criaria um banco vazio no boot e esconderia o problema).
2. Recrie o serviço `vuumbora-banco` se preciso e crie o banco `vuumbora` vazio.
3. Baixe o backup mais recente do destino externo e rode a restauração acima, com
   `TARGET_DATABASE_URL` apontando para o banco novo.
4. Suba o backend: ele vê `schema_migrations` restaurada e aplica só o que faltar.
5. Confira `GET /healthz` e a contagem de candidaturas
   (`npm run driver-applications:export --workspace @vuumbora/api`, ou `select count(*)`).

Perda máxima: até 24 h de candidaturas (frequência diária). Se isso passar a doer,
o passo seguinte é arquivamento contínuo (WAL), não só aumentar a frequência do dump.

## O que guardar fora do servidor, além do dump

Sem estes dois itens um backup perfeito não restaura o sistema:

- **`BACKUP_PASSPHRASE`**: sem ela os arquivos cifrados são lixo. Guarde num
  gerenciador de senhas do dono, **fora** do Easypanel.
- **`ADMIN_TOTP_ENCRYPTION_KEY`**: cifra os segredos 2FA dentro do banco. Perder
  ou trocar a chave invalida o 2FA de todos os admins (o código da API avisa).
  Guarde junto da frase acima.

## 5. Ativar em produção (ações do dono, no painel do Easypanel)

**Ação do dono**, projeto `vuumbora`:

1. **Destino externo.** Crie um bucket em um provedor **diferente** do servidor
   (Cloudflare R2 ou Backblaze B2 têm plano gratuito/barato; qualquer S3). Crie
   uma chave de API só com permissão naquele bucket. Anote endpoint, chave e segredo.
2. **Monitor do backup.** Em healthchecks.io (gratuito) crie um check com período
   de 1 dia e tolerância de 3 h; copie a URL de ping.
3. **Novo serviço do tipo App**, nome `vuumbora-backup`:
   - Fonte: Github, `InnovareCode/VuumBora`, `main`; Dockerfile `scripts/backup/Dockerfile`;
     contexto de build = raiz do repositório.
   - Aba Ambiente (nunca no repositório):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a mesma string **interna** do `vuumbora-backend` |
   | `BACKUP_PASSPHRASE` | frase longa gerada por você (`openssl rand -base64 32`) |
   | `RCLONE_REMOTE` | `destino:nome-do-bucket/postgres` |
   | `RCLONE_CONFIG_DESTINO_TYPE` | `s3` |
   | `RCLONE_CONFIG_DESTINO_PROVIDER` | `Cloudflare` (R2) ou o do seu provedor |
   | `RCLONE_CONFIG_DESTINO_ENDPOINT` | endpoint do bucket |
   | `RCLONE_CONFIG_DESTINO_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | a chave do passo 1 |
   | `HEALTHCHECK_URL` | a URL do passo 2 |
   | `BACKUP_ON_START` | `1` só no primeiro dia |

   - Aba Volumes: monte um volume em `/backups` (cópia local de 14 dias).
   - Sem domínio e sem porta: este serviço não recebe tráfego.
4. **Prove o primeiro backup:** ao subir, `BACKUP_ON_START=1` roda um backup na
   hora. Nos logs do serviço deve aparecer `[backup] ok: vuumbora-....dump.enc`;
   o arquivo deve estar no bucket; o healthchecks.io deve marcar verde.
   Depois **troque `BACKUP_ON_START` para `0`**.
5. **Primeira restauração de verdade**, num Postgres que não seja o de produção
   (a sua máquina serve): baixe o arquivo do bucket e rode o passo "Restaurar num
   banco novo". Backup que nunca foi restaurado é esperança, não backup.

Rotina daqui para frente: o monitor avisa se um dia o backup não chegar; **a cada
trimestre** repita o passo 5 para provar que a cadeia ainda funciona.
