---
name: project_apps_admin_vite_react_spa
description: apps/admin — primeiro SPA React+Vite do monorepo (login + pré-cadastro de motorista, fase S2). Estrutura, convenções e onde cada coisa mora.
metadata:
  type: project
---

Criado em 20/11/2026 (fase S2 de `docs/plano-sistema.md`). Primeira peça do
painel administrativo: login (cookie httpOnly, SPA não guarda token) e
pré-cadastro de motorista (lista + detalhe), consumindo o contrato fixo
`/v1/admin/*` que a Vega implementa em paralelo.

**Por que é diferente dos outros apps do monorepo:** React Native/Expo em
todo lugar, admin é o único SPA web puro. Por isso:
- **Não usa `packages/ui`** (componentes RN) nem o `theme` de `@vuumbora/tokens`
  (formato RN: `BoxShadowValue`, fontFamily = nome de asset RN tipo
  `PlusJakartaSans_400Regular`). Em vez disso, `apps/admin/scripts/generate-tokens-css.mjs`
  lê `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` direto e gera
  `src/styles/tokens.css` (custom properties `--color-*`/`--space-*`/etc.) —
  roda antes de `dev`/`build` (`npm run tokens:css`). Arquivo gerado,
  git-ignorado, igual a um `dist`.
- Fonte real da web é "Plus Jakarta Sans" via Google Fonts `@import` em
  `global.css` (peso pela variável `--font-weight-*`) — a família RN do JSON
  não serve aqui. Ver [[licoes-tipografia-plus-jakarta-sans]].
- API: NÃO usa `@vuumbora/api-client` (é a porta dos apps RN passageiro/
  motorista). `apps/admin/src/api/` reimplementa o mesmo padrão portas &
  adaptadores da casa (`Result<T>`, `ApiError.kind`, `mode: 'mock'|'http'`
  explícito, nunca fallback silencioso) de forma self-contained, porque admin
  é um consumidor novo fora daquele perfil.
- Modo mock escolhido por `VITE_API_MODE` (padrão `mock` enquanto
  `/v1/admin/*` não existe) — nunca cai em mock por falha de rede.
  `DemoModeBanner` (mesma linguagem visual do `MockBadge` RN: chip tracejado,
  glifo "!", nunca amarelo) fica fixo no topo sempre que `api.mode === 'mock'`.

**Estrutura:** `src/api/` (portas+adaptadores+types), `src/context/`
(`ApiContext`, `AuthContext` — only os dois estados realmente globais),
`src/hooks/` (estado local por tela: lista/detalhe/summary/debounce),
`src/components/` (AppShell, DemoModeBanner, RequestState, StatusPill,
CopyButton), `src/pages/` (Login, List, Detail — Detail com `React.lazy`
por rota).

Ver também [[feedback_vite_css_modules_no_property_access_index_signature]]
e [[feedback_mock_adapter_sessao_sobrevive_reload]].
