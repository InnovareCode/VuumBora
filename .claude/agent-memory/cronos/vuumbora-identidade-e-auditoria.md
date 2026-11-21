---
name: vuumbora-identidade-e-auditoria
description: Migracoes 0010-0012, 0014 e 0019 (contas por tipo, tokens, codigos de e-mail, audit_log inviolavel, idade 18+ e aceite de documentos), armadilhas de papel/credencial, numeracao e teste local
metadata:
  type: project
---

Migracoes 0010 (accounts com account_type, account_credentials, devices), 0011 (refresh_token_families,
refresh_tokens, rotate_refresh_token(), login_attempts com scope, login_failures_in_window(), access_log),
0012 (triggers append-only em admin_audit_log + papel `vuumbora_api`), 0014 (account_email_codes +
issue_email_code/consume_email_code/reset_password_with_code), 0019 (accounts.birth_date + account_consents).
0013, 0016, 0017 (privilegio minimo do papel) e 0018 (teto cumulativo do codigo de redefinicao) sao da Vega.
Rollback em docs/sql/rollback/00NN_down.sql (fora de migrations/ porque o runner aplica todo .sql).
Ordem de rollback: inversa (0019, 0018, 0017, 0016, 0014, 0012, 0011, 0010). Producao esta na 0009.

**Decisao do dono 21/11/2026:** contas SEPARADAS (account_roles removida), e-mail unico por
(account_type, email) [hipotese a confirmar], public_id unico global, e-mail verificado obrigatorio
(trigger recusa familia de token e rotate trata como account_inactive), recuperacao so por e-mail.
Idade minima 18 anos (passageiro e motorista); versoes dos Termos/Privacidade AINDA nao existem.

**0019 (idade e aceite) — decisoes:**
- birth_date e NULLABLE de proposito; "obrigatoria" mora no trigger accounts_enforce_birth_date (INSERT sem data
  recusado 23502, exceto status 'deleted'; conta anterior sem data segue atualizavel). 18 anos = trigger, nao CHECK com
  now(); corte no fuso America/Fortaleza (nao o da sessao: servidor em UTC erraria 3h/dia). Erros trazem
  err.constraint: accounts_birth_date_min_age / _not_future / _plausible (CHECK >= 1900). Mensagem nunca ecoa a data.
- account_consents: trigger append-only (vale ate para o dono) + REVOKE UPDATE/DELETE/TRUNCATE do vuumbora_api.
  accepted_at SEMPRE now() do banco (valor enviado e descartado). Unica mutacao: ip_hash -> NULL (minimizacao).
  DELETE so em cascata da exclusao da conta (pg_trigger_depth()>1 e conta ja ausente). SEM trigger de TRUNCATE:
  os testes usam `TRUNCATE accounts CASCADE`, que passaria por ele.
- Backup: restore COMPLETO preserva accepted_at (gatilhos so nascem depois dos dados). Restore data-only COM gatilhos
  reescreve accepted_at para now() — medido; usar --disable-triggers / session_replication_role=replica.

**Armadilhas que valem reusar:**
- Numeracao de migracao colide quando duas frentes criam em paralelo (0018 nasceu duplicada: Vega e eu). Antes de salvar
  `ls migrations` E `ls rollback`; quem chegou depois renomeia. O rollback tem o MESMO nome da migracao: eu sobrescrevi
  o 0018_down.sql da Vega com `cat >` sem checar. Sempre `[ -e arquivo ]` antes de criar arquivo de rollback.
- Inviolabilidade em 2 camadas: trigger (vale ate para o dono) + papel sem UPDATE/DELETE (so fecha
  quando a API conecta com `vuumbora_api`). Mesmo codigo 42501 nas duas: a matriz has_table_privilege e que isola a camada 2.
- Tabela nova: default privileges da 0012 dao DML completo ao papel -> a migracao faz o proprio REVOKE e entra na matriz
  de test/runtime-role.test.ts (WRITES), que reprova tabela fora dela.
- Papel restrito NAO migra: por isso `MIGRATION_DATABASE_URL` (migrate.ts). Medido.
- Papel e do cluster, nao do banco; migracao nao pode ter senha. LOGIN via docs/sql/ativar-papel-api.sql.
- Hash de IP/identificador = HMAC com pepper (hex 64, CHECK length = 64). Codigo de 6 digitos idem (sha256 puro se
  desfaz em ms); a defesa real e o limite de tentativas, contado DENTRO da funcao (excecao desfaria a contagem).
- Identificador do limite de login deve incluir o TIPO da conta ('passenger:email'), senao errar senha de
  um tipo bloqueia o outro.
- Erro de banco nao tratado vira 503 'unavailable' na API: coluna NOT NULL nova derruba o cadastro ate o codigo enviar o dado.
- Testes exigem banco terminado em `_test` e truncam tabelas.
- Teste local: PG 18 em C:/Program Files/PostgreSQL/18/bin; initdb em scratchpad (-A trust, --locale=C), porta 54392
  (a 5432 e de outro: nao usar). `pg_ctl start -w` dentro do Bash TRAVA (herda o pipe): subir em background e checar com
  pg_isready. Role de teste com `ALTER ROLE vuumbora_api LOGIN` (trust) para provar privilegio por conexao REAL, nao so
  SET ROLE. psql aplica cada .sql e schema_migrations precisa existir antes (0012 faz REVOKE nela).
  Runner: `DATABASE_URL=... node --import tsx test/helpers/run-migrate.ts` (cria o banco e migra, via prepararBanco).
