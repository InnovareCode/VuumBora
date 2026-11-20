---
name: feedback_painel_dark_only_sem_tom_claro_geral
description: A paleta do VuumBora não tem um tom claro de uso geral — ao portar uma anatomia de referência (ex. login split-screen do ModaShop) com "lado claro", traduzir isso para hierarquia DENTRO da escala de escuros (navy → surface → elevated), não inventar um tom claro novo.
metadata:
  type: feedback
---

**Contexto:** ao reformar a tela de login do `apps/admin` (20/11/2026) no padrão
"anatomia" pedido pelo dono a partir do login split-screen do ModaShop
(`C:/Projetos/Web/Moda Shop/frontend/.../Login.tsx` + `AuthLayout`/`AuthHero`),
o briefing pedia literalmente "lado escuro" + "lado claro com o cartão do
formulário" — herdado do visual do ModaShop (painel direito com fundo
`#F8F8F8`, quase branco).

**Por que isso NÃO se porta direto:** `VuumBora_Claude_Design_System/tokens/
vuumbora.tokens.json` é um sistema **só-escuro** por decisão de produto
(`:root { color-scheme: dark }` em `global.css`, confirmado também por TODA
tela já existente do admin ser escura — `AppShell`, listas, detalhe). O único
valor claro que existe no JSON é `gradient.searchLight`, e a própria
`$description` do token diz que é **"único elemento claro da tela"** — reservado
de propósito a UM elemento por tela (pílula de busca dos apps RN). Usá-lo numa
coluna inteira do login violaria essa regra de direção de arte.

**Correção aplicada:** traduzir a hierarquia "escuro/claro" da anatomia para
uma hierarquia DENTRO da escala de escuros que o design system já tem:
`bg-navy` (mais escuro, hero/marca) → `bg-surface` (meio, coluna do
formulário) → `bg-elevated` (mais claro dos três, o cartão em si — com
`border border-border` fazendo a separação, não sombra: a `$description` do
token `elevation.1` já avisa que sombra é "quase invisível sobre
background.base", quem separa cartão de fundo aqui é a borda). Resultado:
`apps/admin/src/components/auth/AuthSplitLayout.tsx` (comentário no código
explica a decisão para quem for mexer depois).

**Como aplicar de novo:** sempre que uma referência externa (outro projeto,
mockup, Figma de terceiro) descrever "fundo claro"/"card branco" e o projeto
atual for um design system majoritariamente escuro, checar primeiro se existe
mesmo um tom claro de USO GERAL nos tokens (não um valor reservado a um
elemento específico) antes de portar literalmente — a resposta normalmente é
"não", e a tradução certa é uma escada dentro da própria escala de escuro/claro
relativo que já existe (surface/elevated/input), não inventar uma cor nova.

Ver também [[project_apps_admin_shell_moda_shop]] (mesma fonte de anatomia,
primeira peça da casca) e [[feedback_tailwind_v4_theme_alias_mesmo_nome_do_token]]
(mesmo app, outra armadilha de tema).
