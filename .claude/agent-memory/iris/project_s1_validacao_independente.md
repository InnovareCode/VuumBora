---
name: project-s1-validacao-independente
description: S1 (identidade, 2FA, SMTP no painel, hardening do admin) validada de forma independente em 21/11/2026 — o que reprovou, o que sobreviveu à mutação, flakes e como reproduzir
metadata:
  type: project
---

Relatório completo: `docs/veredito-iris-s1.md`. Aqui só o que economiza tempo na próxima rodada.

**Falhas "intermitentes" do admin-hardening: NÃO reproduzidas** (7 execuções completas, 24 de hardening+2FA com 3 em paralelo, bancos limpos e reaproveitados). Causas reais encontradas que PRODUZEM falha intermitente/ambiental:
- `two-factor.test.ts` "replay": se a virada do passo TOTP de 30 s cai entre o código gasto no enrolamento e o `codeAt(secret, 0)` do teste, o "replay" vira 200. Provado forçando a virada (200 !== 401). Conserto: calcular o replay a partir de `last_used_step` do banco, não do relógio.
- `test/helpers/setup.ts` usa `??=` DEPOIS de `dotenv/config`: um `.env` copiado do `.env.example` (`ADMIN_TOTP_ENCRYPTION_KEY=` vazio, `ADMIN_LOGIN_RATE_LIMIT_MAX=5`) derruba 42 de 135 testes. No CI não há `.env`, então passa lá e falha na máquina do dev.

**Mutação que sobreviveu à suíte da Vega (hoje mortas por testes novos meus):** `rotate_refresh_token` sem `FOR UPDATE`; `hashEmailCode` devolvendo o próprio código; gatilho do banco que barra sessão de conta não verificada; `consumeEnrollmentToken` sem `used_at IS NULL`; contador de TOTP que não zera ao travar; default de `ADMIN_TOTP_MAX_ATTEMPTS` (o setup do teste força 5, então o default de produção nunca era testado).
**Why:** teste de concorrência via `Promise.all`/`inject` passa mesmo sem o lock; teste que importa `hashEmailCode` do src é circular. **How to apply:** em área com SQL concorrente, exigir um teste DETERMINÍSTICO (A segura a transação, B tem de esperar em `pg_stat_activity`) e, para hash em repouso, recalcular o HMAC no teste de forma independente.

**Portas da validação (CI limpo):** `npm run check` falha em checkout limpo por (1) HEX solto em `apps/admin/.../QrCode.tsx:54` e (2) `expo-env.d.ts` está no .gitignore, então typecheck de passenger/driver quebra (`mapbox-gl/dist/mapbox-gl.css`). Só aparece com `npm ci` numa cópia sem `.env`/`expo-env.d.ts`.

**Armadilhas da 2ª passada (código mudando junto):** (1) a 0018 redefine `consume_email_code`/`reset_password_with_code`/`issue_email_code` com `DROP FUNCTION` + novo parâmetro — mutação na 0014 deixa de valer; sempre mutar a DEFINIÇÃO MAIS RECENTE da função. (2) Espera progressiva de login: depois de uma falha, a tentativa imediata devolve 429 `account_locked` mesmo com credencial certa — scripts precisam respeitar `retryAfterSeconds`. (3) Step-up do SMTP: o TOTP do mesmo passo do login é replay (401); logar com `totp(0)` e reautenticar com `totp(+1)` ou esperar 30 s. (4) O Atlas avisou que há agentes editando a API/UI em paralelo: esperar a manifest (`find ... | sha1sum`) ficar parada ~80 s antes da passada final e registrar o hash do que foi validado.

**Fora do que consegui provar:** SMTP real, VoiceOver/NVDA/TalkBack, Safari/iOS físico (o zoom do iOS em input <16px é inferido da fonte medida), tela de e-mail em Firefox/WebKit (só o login+2FA), Windows apenas.

Ver [[project-s1-ambiente-de-teste-e-ferramentas]] para montar o ambiente de novo.
