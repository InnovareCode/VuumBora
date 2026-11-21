---
name: project-identidade-apps
description: Identidade dos apps (/v1/auth/*) em apps/api — contas separadas, e-mail verificado, códigos, limites por chave e armadilhas (reserva sob lock, IP no log, banco de teste velho)
metadata:
  type: project
---

Contrato HTTP: `docs/contrato-identidade-apps.md`. Arquivos: routes/auth-route.ts (+ auth-recovery-route.ts, auth-http.ts), services/identity-service.ts (+ account-recovery-service.ts, code-delivery.ts), repositories/identity-repository.ts (+ email-code-repository.ts), hooks/require-account.ts, lib/{auth-config,token-crypto,email-code,mail-port,identity-mail,background-tasks,identity-retention}.ts, domain/auth.ts. Testes: test/identity.test.ts e identity-email.test.ts (helpers/identity-kit.ts com FakeMailbox; `auth-env.ts` ANTES de `setup`).

- Modelo (21/11): contas separadas por `account_type`; cadastro SEM sessão (código 6 dígitos, HMAC pepper|purpose|account_id|code); login 403 email_not_verified só com senha certa; reset revoga sessões e NÃO verifica e-mail. Regra mora nas funções do banco 0014 (issue/consume/reset) — a app só chama.
- Limite: `reserveAttempts` (escopos login/register/code_request) pega advisory lock por chave em ORDEM FIXA, conta, e só grava se todas as chaves têm espaço. Login = chave par (tipo+id+IP, 5) + teto global (tipo+id, 20) — M-1. A linha reservada fica como falha mesmo depois do sucesso (sucesso só zera a contagem): teste de "bloqueio não grava falha" compara antes/depois, não valor absoluto.
- Rotas que respondem igual exista a conta ou não (resend, forgot) enviam e-mail em `runInBackground` (tempo não vaza); testes chamam `drainBackgroundTasks()` antes de ler a caixa fake. Falha de e-mail nunca vira HTTP de erro (cadastro: `emailSent:false`); log só nome/código do erro.
- Armadilha: pino logava request.ip; /v1/auth/ omite remoteAddress. Código/e-mail/IP nunca em log (teste de privacidade varre tabelas e log com `containsCode`, que exige borda para não casar pedaço de hash).
- Armadilha de ambiente: migrações 0010/0011/0014 foram EDITADAS no lugar; banco de teste criado antes ficava com `account_roles` e o register dava 503 em tudo. Cura: `dropdb --force` + `createdb vuumbora_admin_test` (cluster descartável porta 5434) e deixar `prepararBanco` reaplicar. Se tudo der 503 após mexer em migração, suspeite disso primeiro.
- Config: B-3 = pepper != jwt, >=12 caracteres distintos e Shannon >= 3 bits/char, senão 503. Retenção: `npm run identity:retention` com MIGRATION_DATABASE_URL (dono), importa de `dist/`.
- Ferramenta: heredoc `python`/`node` grande no Bash falhou 2x com "unexpected EOF" (aspas); usar Write para arquivos e script .mjs pequeno em /tmp para edições.
