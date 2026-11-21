---
name: project-admin-hardening-s1
description: Endurecimento do admin pós-revisão S1 (migração 0016) — contador por conta, token de enrolamento fora de banda, reautenticação por senha, TRUST_PROXY por saltos; armadilhas de teste que apareceram
metadata:
  type: project
---

Feito em 21/11/2026 (A-1, M-2, M-3, Cache-Control). M-4 (bloqueio 15 min) ficou como decisão do dono; procedimento em `docs/break-glass-admin.md`.
Contrato novo: `docs/contrato-admin-2fa.md` (quebra o anterior: `enrollmentToken` no enroll obrigatório, `password` em start/regenerate/disable).

- **TRUST_PROXY** vira função de saltos (`lib/trust-proxy.ts`); `true`/ausente = 1 salto, nunca "confie em tudo". O tipo do Fastify não aceita `number`
  (o runtime aceita), então devolvemos `(addr, hop) => hop < n` — evita mexer em `app.ts`.
- **Contador por conta** (`admin_login_failures`, chave sha256 do e-mail, e-mail inexistente conta igual = sem oráculo): a tentativa é
  RESERVADA sob `pg_advisory_xact_lock` antes do bcrypt e devolvida se a senha confere. Limite 10/15 min fixo no código
  (`DEFAULT_ACCOUNT_GUARD`) porque a ordem foi não tocar em `env.ts`. A reautenticação por senha (M-3) usa o MESMO contador.
- **Segredo pendente** (`admin_totp.pending_expires_at`, 15 min): `getOrCreatePendingSecret` devolve o mesmo segredo em vez de trocar (início idempotente);
  `pendingExpired` também barra confirmar QR vencido.
- **Token de ativação** (`admin_enrollment_tokens`): só sha256 no banco; scripts `.mjs` repetem a regra do TS (`scripts/lib/enrollment-token.mjs`) e um teste
  roda os scripts contra a API real, então divergência quebra.

**Armadilhas que custaram tempo (como evitar):**
- Teste de concorrência com `Promise.all` NÃO provou o advisory lock: sem o lock, 60 e até 200 reservas paralelas ainda davam exatamente 10 (Postgres local,
  pool de 5). Prova real = teste determinístico: segurar o lock numa transação do teste e checar que a reserva espera. Sempre rodar a mutação antes de confiar.
- Banco de teste persiste entre execuções: valores fixos em coluna UNIQUE (token de sessão) quebram na 2ª rodada — usar aleatório.
- pg: o mesmo `$1` usado como `uuid` e `text` na mesma query dá "tipos inconsistentes"; passar um parâmetro separado.
- `node -e "..."` com backticks/`${}` dentro de bash com aspas duplas é frágil; para trechos grandes, gravar o arquivo com Write e splice.
- Suíte de identidade (`identity.test.ts`) estava quebrada por trabalho paralelo de outra frente na mesma hora — não é regressão daqui.
