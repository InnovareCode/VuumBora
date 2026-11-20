---
name: project_apps_admin_shell_moda_shop
description: apps/admin ganhou a casca (sidebar/gaveta/paleta de comandos/PageHeader) portada do padrão do painel ModaShop, 20/11/2026 — Tailwind v4 CSS-first, layout route com Outlet. Onde cada peça mora e o que ficou de fora de propósito.
metadata:
  type: project
---

**O que mudou:** a casca ao redor da tela de pré-cadastro (que continua
intocada — `DriverApplicationsListPage`/`DriverApplicationDetailPage`/
`LoginPage` seguem CSS Modules, sem mudança de contrato/lógica), seguindo
anatomia pedida pelo dono a partir do painel do ModaShop (`C:/Projetos/Web/Moda
Shop/frontend/src/components/painel/*`): sidebar escura com grupos
recolhíveis, gaveta no celular, paleta de comandos (Ctrl+K), cabeçalho de
página com selo+ícone igual ao do menu, casamento de rota "mais específico
vence". Paleta/tipografia são as do VuumBora (navy/yellow, Plus Jakarta
Sans) — decisão do dono, não reabrir.

**Onde mora:**
- `src/nav/types.ts` — `NavItem`/`NavGroup`, `matchNavItem` (specificity sort).
- `src/nav/adminNav.ts` — mapa único do admin (hoje: 1 grupo "Motoristas", 1
  item "Pré-cadastro" com `badge: 'pendingDriverApplications'`).
- `src/nav/useCollapsibleNavGroups.ts` — estado de grupo recolhido, localStorage.
- `src/components/nav/{NavGroupCollapsible,NavLink,CommandPalette}.tsx`.
- `src/components/PageHeader.tsx` — ícone igual ao do item de menu correspondente.
- `src/components/AppShell.tsx` — reescrito como rota de LAYOUT (`<Outlet/>`),
  não mais wrapper repetido por página (`App.tsx` usa
  `<Route element={<RequireAuth/>}><Route .../></Route>` aninhado) — monta
  UMA vez por sessão autenticada, não a cada navegação (estado do menu e
  `useDriverApplicationsSummary()` não resetam a cada troca de tela).
- `vite.config.ts` — plugin `fail-build-on-mock-api`: `vite build` falha
  (`this.error`) se `VITE_API_MODE` resolver para mock (ausente ou != 'http').
  Só olha `command === 'build'`; `vite`/`vite preview` continuam livres.

**Deliberadamente fora de escopo** (pedido era a anatomia, não réplica
1:1 do ModaShop): sem "ver loja"/link externo, sem selo de rodapé tipo
InnovareCodeBadge, sem fundo decorativo com padrão de pontos na sidebar —
nada disso está nos arquivos de referência citados como "anatomia", e inventar
elemento visual novo sem o dono pedir é risco, não ganho.

Ver [[feedback_tailwind_v4_theme_alias_mesmo_nome_do_token]] (setup do tema) e
[[project_apps_admin_vite_react_spa]] (estrutura geral do app).
