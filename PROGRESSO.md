# PROGRESSO — VuumBora

Estado do projeto entre sessões. Atualizar ao fim de cada marco.

## Estado atual (2026-11-18)

**Fase 0 — Fundação: scaffold criado, sem dependências instaladas.**

- Monorepo npm workspaces: `apps/passenger`, `apps/driver`, `packages/{tokens,ui,domain,api-client}`.
- Expo Router nos dois apps (entry `expo-router/entry`, `app/_layout.tsx` + marcador `app/index.tsx`).
- `@vuumbora/tokens` deriva o tema de `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` (fonte única).
- Guarda de arquitetura: `npm run check:boundaries` (HEX solto, import cruzado passageiro/motorista).
- Decisões e ambiguidades de produto: `docs/decisions.md`.

### O que foi provado e o que não foi
- Provado: `check:boundaries` passa no repo e falha numa violação de propósito; `tokens`, `domain` e `api-client` passam no `tsc --noEmit` estrito (TS 5.9); a conversão de tokens roda e devolve os valores do JSON.
- **Não provado** (falta `npm install`): typecheck de `ui` e dos apps; Metro resolvendo o JSON fora dos pacotes; `app.config.ts` importando o JSON; o app subindo em emulador.

## Plano em fases

| # | Fase | Dono | Depende de | Entrega |
|---|---|---|---|---|
| 0 | Fundação: arquitetura + scaffold | Nova | — | Feito (este marco) |
| 1 | Instalação e CI | Vulcano | 0 | SDK confirmado (D-07), `npm install`, `npx expo install --fix`, `expo config` e `expo start` nos dois apps, CI com `npm run check` |
| 2 | Paleta validada | Apolo | — (paralela) | JSON de tokens revisado; ícone/splash |
| 3 | Componentes transversais + catálogo | Lyra | 1 (2 desejável) | `@vuumbora/ui` (Etapa A), MockBadge, fontes |
| 4 | Adaptadores mock | Vega | 1 | Adaptadores `mock` das portas do `api-client` |
| 5 | Protótipo Passageiro P01–P14 | Lyra | 3, 4 | Etapa B |
| 6 | Protótipo Motorista M01–M14 | Lyra | 3, 4 | Etapa C (pode rodar em paralelo à 5) |
| 7 | Qualidade | Íris | 5, 6 | Etapa D: testes, a11y, telas pequenas |
| 8 | Contrato de backend | Nova + Cronos + Vega | respostas de produto | Etapa E: API HTTP, modelo de dados |

## Decisões em aberto (dependem do dono)

Lista completa em `docs/decisions.md` → "Ambiguidades de produto". As que mais pesam para o MVP:
- Login por código (celular) ou senha.
- Uma conta com dois papéis ou contas separadas.
- Métodos de pagamento e existência de carteira.
- Taxa da plataforma/repasse e regras de cancelamento.
- SDK de mapa (D-11) e cidade de lançamento.
- Identificadores de loja (provisório `com.vuumbora.passenger` / `com.vuumbora.driver`).
