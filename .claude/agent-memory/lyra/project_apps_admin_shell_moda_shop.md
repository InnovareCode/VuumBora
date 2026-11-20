---
name: project_apps_admin_shell_moda_shop
description: apps/admin ganhou a casca (sidebar/gaveta/paleta de comandos/PageHeader) portada do padrão do painel ModaShop, 20/11/2026 — Tailwind v4 CSS-first, layout route com Outlet. Onde cada peça mora e o que ficou de fora de propósito.
metadata:
  type: project
---

**O que mudou:** a casca ao redor da tela de pré-cadastro (que continua
intocada — `DriverApplicationsListPage`/`DriverApplicationDetailPage` seguem
CSS Modules, sem mudança de contrato/lógica — `LoginPage` SAIU dessa lista em
20/11/2026, ver atualização no fim deste arquivo), seguindo
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

**Atualização 20/11/2026 — navegação por papel + armadilha de foco real:**
- `NavItem.roles?: readonly AdminRole[]` (`src/nav/types.ts`; ausente = todos
  os papéis autenticados veem). `isItemVisibleForRole`/`filterNavForRole`
  (mesmo arquivo) filtram grupos pelo papel e DESCARTAM grupo que ficou
  vazio — consumidos pelos três lugares que leem `ADMIN_NAV`: sidebar,
  gaveta e `CommandPalette`. `AdminRole` mora em `src/api/types.ts`, espelho
  manual do union real em `apps/api/src/domain/admin.ts` (admin é SPA
  separado, não importa código da API — se a API mudar o union, aqui muda
  junto, só manualmente).
- "Pré-cadastro" ganhou `roles: ['dono', 'operacao']` em `adminNav.ts`,
  casando com `requireDriverApplicationAccess` em
  `admin-driver-application-route.ts` — comentário no código avisando que os
  dois andam juntos. **Isto NÃO é a segurança** (quem sabe a URL digita
  direto; o 403 do backend é quem protege) — é só o menu não oferecer algo
  que o próprio papel não abre.
- Quem digita a URL de uma área que o papel não alcança cai em
  `src/pages/NoAccessPage.tsx` (renderizada pelo `AppShell` no lugar do
  `<Outlet/>`, calculada comparando `matchAdminNavItem` — SEM filtro, mapa
  completo — contra o papel logado), com o nome da área, o papel atual e um
  botão "Voltar" (`navigate(-1)`). Título do cabeçalho também muda para
  "Acesso restrito" nesse caso.
- Mock (`createMockAuthAdapter`) tinha `role: 'owner'` (inglês) enquanto o
  union real é em português (`'dono'`, etc.) — corrigido para `'dono'`,
  senão o filtro por papel quebrava o demo padrão (ninguém veria nada).
- Gaveta mobile e `CommandPalette` ganharam armadilha de foco de verdade via
  hook `src/nav/useFocusTrap.ts` — ver
  [[bug_overlay_sem_focus_trap_escapa_para_fundo]] pela causa raiz e o
  padrão a repetir em qualquer overlay novo.

**Atualização 20/11/2026 — login reformado no mesmo padrão, Tailwind:**
`LoginPage.tsx` deixou de usar `LoginPage.module.css` (removido) e virou
split-screen (hero escuro + cartão do formulário), anatomia portada do login
do ModaShop mas adaptada à paleta só-escura do VuumBora — ver
[[feedback_painel_dark_only_sem_tom_claro_geral]] pela causa raiz dessa
adaptação. Peças novas: `src/components/auth/AuthSplitLayout.tsx` (casca de
duas colunas, reutilizável para futura tela de auth) e
`src/components/auth/LabeledIconInput.tsx` (campo rotulado com ícone à
esquerda). `AuthContext.login()` agora distingue DOIS tipos de falha no
retorno (`kind: 'credentials' | 'blocked'`): `credentials` é a mensagem
genérica de sempre ("E-mail ou senha incorretos.", igual para e-mail
inexistente/senha errada/usuário desativado — não mudar isso); `blocked`
cobre 429 (limite de tentativas) e falhas de rede/indisponibilidade, com a
mensagem de `errorMessage()` (`src/api/result.ts`) e visual de AVISO (âmbar),
não de erro (vermelho) — são estados de infraestrutura, não "senha errada".

**Atualização 20/11/2026 — logomarca de verdade no lugar do texto "VuumBora
Admin":** `src/components/BrandLogo.tsx` (novo) renderiza a imagem oficial
(`src/assets/brand/logo-vuumbora.png`, copiada de
`apps/site/public/assets/img/logo-vuumbora.png` — ver
[[feedback_logomarca_copiada_para_dentro_do_workspace]] pelo porquê de ter
que ser cópia física e não import cruzando workspace). Substituiu o texto nos
TRÊS lugares onde ele existia: hero escuro e cabeçalho compacto mobile de
`AuthSplitLayout.tsx`, e sidebar desktop de `AppShell.tsx`. O cabeçalho
compacto mobile da própria `AppShell` (o `header` com `lg:hidden`) nunca teve
o texto — só um `●` decorativo — então não mudou. O PNG tem "Vuum" em branco
sem fundo opaco: funciona em qualquer tom da escala só-escura do design
system, nunca sobre um fundo claro (que este app não tem, ver
[[feedback_painel_dark_only_sem_tom_claro_geral]]).
