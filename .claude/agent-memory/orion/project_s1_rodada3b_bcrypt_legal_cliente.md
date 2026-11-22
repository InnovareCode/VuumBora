---
name: project-s1-rodada3b-bcrypt-legal-cliente
description: Auditoria S1 rodada 3b (2026-11-22, HEAD d75b9b9) — A-1 PARCIAL (pista de bcrypt ainda sufocável), B-1 RESOLVIDO, M-3 PARCIAL (servidor ok, cliente real não envia versões); build do Metro abre telas de dev por omissão
metadata:
  type: project
---

Relatório entregue ao Atlas pelo handback (o arquivo `docs/revisao-seguranca-s1-rodada3b.md` NÃO foi gravado por mim: a regra do harness proíbe relatório em .md; Atlas persiste). Resultado: 0 crítico / 0 alto / 4 médios / 9 baixos.

**Reclassificação:** A-1 PARCIAL (CPU e `/healthz` resolvidos; a pista `app` de 2 threads + fila 8 continua sufocável por poucas dezenas de IPs; MEDIDO: com atacante a 2x a capacidade o titular foi recusado 60% — 12 de 20). B-1 RESOLVIDO (trilha sem `user`, só `userConfigured`/`userChanged`; teste cobre). M-3 PARCIAL (0021 + API sólidas; `packages/api-client/src/identity/http-adapter.ts:143-155` ainda não manda `termsVersion/privacyVersion` → cadastro real daria 400 `consent_required`; `requireCurrentConsent` só existe em teste).

**Padrões novos deste projeto:**
1. Teto + fila FIFO sem justiça por origem: protege o processo, mas não o titular — o atacante mantém a fila cheia. Sempre medir a taxa de aceitação de um usuário legítimo sob saturação, não só o `/healthz`.
2. Reserva de limite ANTES do recurso escasso (bcrypt) + recusa do recurso DEPOIS = tentativa/atraso consumido sem uso (identity-service.ts:262-282, account-recovery-service.ts:163-185, admin-auth-service.ts:132-137). Perguntar: se o passo seguinte falhar, o contador é devolvido?
3. Padrão de build inseguro por omissão: `metro.config.js` cai em `development` sem variável (medido: NODE_ENV=production sem variável, EAS_BUILD_PROFILE com outro nome e `preview` deixam as telas de dev no bundle); o admin tem guarda no build (vite.config.ts aborta se mock), o mobile não. Nem `eas.json` nem CI de mobile existem.
4. Cliente que apaga a sessão por STATUS HTTP (400/401/403) sem olhar o `code` do envelope: qualquer proxy/WAF na frente da API vira logout em massa (`session-manager.ts:85-87`, comentário promete `invalid_refresh_token`).
5. Gate de consentimento opt-in por rota = fail-open por omissão; precisa de teste que lista rotas autenticadas e exige o gate ou uma exceção declarada.
6. Contrato novo no servidor sem o cliente real acompanhar (mock passa, http quebra).

**How to apply:** nas próximas rodadas conferir (a) se a pista de bcrypt ganhou justiça por origem e balde /48 para IPv6; (b) se `metro.config.js` passou a derivar o perfil de NODE_ENV e abortar sem perfil; (c) se o http-adapter manda as versões exibidas e tem `legal/current`, `consents` e `me.consent`; (d) se `isDefinitiveRefreshRejection` olha o `code`; (e) se existe teste de rotas × `requireCurrentConsent`; (f) B-2 da rodada 3 (`ip_hash` do aceite nunca zerado: `identity-retention.ts` não tem o passo) segue aberto.

**Método que funcionou:** sondas descartáveis no scratchpad que importam o módulo REAL (`node --import tsx script.mts` com cwd em `apps/api` e import por `file:///C:/...`; para `metro.config.js` basta `require` com as variáveis de ambiente trocadas e detectar o regex do blockList por `String(r).includes('catalogo')`, com controle positivo e controle de valor inválido).
