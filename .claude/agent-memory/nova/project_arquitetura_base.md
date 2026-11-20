---
name: project-arquitetura-base
description: Decisões de arquitetura da fundação VuumBora (nov/2026) — Expo Router, npm workspaces, dois apps, tokens do JSON, portas mock/http
metadata:
  type: project
---
Fundação definida em 2026-11-18 (detalhe e alternativas em docs/decisions.md, D-01..D-11):
- Expo Router (não React Navigation puro); npm workspaces (não pnpm/yarn); sem Turborepo; pacotes só fonte TS sem build.
- Dois apps separados (apps/passenger, apps/driver), não um app com perfis — permissão de localização em 2º plano só no motorista.
- Separação de perfil por subcaminho (`@vuumbora/domain/passenger|driver`, idem api-client); componentes de um perfil ficam no app, não em packages/ui.
- Tokens: packages/tokens importa direto VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json; codigo/theme.ts do kit é legado divergente e proibido.
- api-client: portas com adaptador mock/http, `mode` obrigatório sem default, toda resposta com `origin`, idempotencyKey em ações críticas.
- SDK: hoje Expo SDK 58 (RN 0.88, React 19.3, TS 6) — a nota antiga de SDK 54 ficou superada.

**Why:** protótipo navegável (Fase 1), time pequeno, uma cidade; spec exige não misturar regras passageiro/motorista e nenhum HEX fora dos tokens.
**How to apply:** não reabrir estas escolhas sem motivo novo; ao propor features, respeitar a fronteira de perfil e `npm run check:boundaries`. Paleta muda só no JSON (Apolo tem docs/identidade-visual.md com proposta).
