---
name: project-admin-2fa-totp
description: 2FA TOTP do admin (migracao 0013) — decisoes, armadilhas e como testar contra Postgres real nesta maquina. Contrato em docs/contrato-admin-2fa.md.
metadata:
  type: project
---

Feito em 21/11/2026. Contrato HTTP: `docs/contrato-admin-2fa.md`. Dono e financeiro obrigam 2FA.

- **Sem sessao parcial:** senha certa + 2FA gera so um *desafio* (`admin_login_challenges`, hash do
  token, 10 min, uso unico); sessao so sai de `startAdminSession` apos o codigo. Enrolamento
  obrigatorio tambem por desafio (`/auth/2fa/enroll/*`) e ja conclui o login.
- **Concorrencia:** toda checagem de codigo roda em transacao com `SELECT ... FOR UPDATE` em
  `admin_totp` (`checkSecondFactor`). Sem o lock, o mesmo TOTP certo passa em 2 desafios paralelos
  (so o teste de replay concorrente pega; o contador de falhas e UPDATE atomico e passa sem lock).
  Falha faz COMMIT (contador sobe); `onSuccess` lanca => ROLLBACK (codigo nao e gasto).
- **Replay:** `last_used_step` — so aceita passo maior. Logo apos enrolar, o codigo do passo atual esta
  gasto; testes usam `resetReplayGuard` ou o codigo do passo +1.
- **Cifra:** AES-256-GCM, `v1.iv.tag.ct`, AAD = admin id (ciphertext copiado p/ outra linha nao
  decifra). Chave `ADMIN_TOTP_ENCRYPTION_KEY` opcional no boot, mas ausente = 503 p/ dono/financeiro
  (falha fechada) — Vulcano precisa setar antes do deploy.
- 0013 apaga sessoes abertas de dono/financeiro (cookie antigo nunca passou por 2FA).
- `admin_audit_log` e append-only no banco (trigger da 0012 do Cronos): `TRUNCATE`/DELETE de admin
  com auditoria falham. Testes usam e-mails aleatorios e nunca limpam.

**Ambiente de teste:** sem Docker; `apps/api/.env` aponta p/ `localhost:5434/vuumbora_admin_test`.
Subir cluster descartavel: `initdb -A trust -U postgres` + `pg_ctl -o "-p 5434"` (binarios em
`C:/Program Files/PostgreSQL/18/bin`) + `createdb vuumbora_admin_test`. `pg_ctl start` sem `-w` e em
background (com `-w` o shell trava). `npm test -w @vuumbora/api` (concurrency=1; setup recusa banco
que nao termine em `_test`). Ver [[feedback-fastify-handlers-antes-do-register]].
