---
name: bug_overlay_sem_focus_trap_escapa_para_fundo
description: Gaveta mobile e paleta de comandos do admin deixavam o Tab/Shift+Tab escapar para controles da página de fundo (cobertos só visualmente pelo backdrop) — causa raiz e o hook compartilhado que corrigiu as duas. Achado da Íris, 20/11/2026.
metadata:
  type: feedback
---

**Sintoma (Íris, 20/11/2026):** no admin (`apps/admin`), abrindo a gaveta
mobile com Enter no botão "Abrir menu" (375px) e dando Tab, o foco ia para os
chips de filtro/busca/links da página por trás — visualmente cobertos pelo
backdrop (`bg-black/50`), mas ainda focáveis e na ordem de tabulação.
Escape também não fechava a gaveta (sem handler nenhum).

**Causa raiz:** um overlay (`position: fixed` + backdrop) não ganha
armadilha de foco de graça só por estar visualmente por cima — a ORDEM DO
DOCUMENTO é o que manda no Tab, não o `z-index`/posição visual. Dois
problemas distintos, mesma raiz:
1. **Gaveta:** renderizada ANTES de `header`+`main` no JSX, mas o botão que a
   abre ("Abrir menu") mora DENTRO do `header` — ou seja, vem DEPOIS dela na
   ordem do documento. Tab a partir de um elemento da gaveta ia para o que
   vem depois dela no DOM: o conteúdo da página.
2. **Paleta de comandos** (`CommandPalette`): estava posicionada como a
   ÚLTIMA coisa no DOM (depois de `header`+`main`), então Tab *para a frente*
   não escapava (ia para fora da página) — mas Shift+Tab a partir do campo
   de busca ia para o ÚLTIMO elemento focável do conteúdo por baixo (ex. um
   link de candidato), que também está só visualmente coberto. Achado ao
   checar "de brinde" se a CommandPalette tinha o mesmo problema — tinha,
   só que pelo lado oposto do Tab.

**Correção:** hook único `useFocusTrap(containerRef, active, onEscape)` em
`apps/admin/src/nav/useFocusTrap.ts`, usado pelas duas superfícies
(`AppShell.tsx` para a gaveta, `CommandPalette.tsx` para a paleta):
- Ao ativar: guarda `document.activeElement` (quem abriu) e foca o primeiro
  elemento focável do contêiner.
- Enquanto ativo: `keydown` em fase de CAPTURA no `document` — Tab no último
  elemento focável volta pro primeiro (e vice-versa com Shift+Tab); Escape
  chama `onEscape`.
- Ao desativar/desmontar: devolve o foco a quem tinha antes (o botão que
  abriu) — sem isso o foco cai no `<body>` ao fechar, que também é ruim.
- A gaveta também precisou SER MOVIDA no JSX (ficou depois de `header`+
  `main`, antes do fechamento do componente) — o hook sozinho não resolve
  ordem de documento, só comportamento de Tab DENTRO do contêiner já restrito
  pelo `querySelectorAll` daquele contêiner. Como o elemento é `fixed`, mudar
  a posição no JSX não mudou nada visual.

**Padrão a aplicar sempre que a squad criar um novo overlay/modal/drawer:**
1. Não confiar na posição visual — checar a ordem do DOM de verdade.
2. Qualquer superfície com backdrop (modal, gaveta, paleta de comandos,
   dropdown complexo) precisa de armadilha de foco de verdade, não só
   `role="dialog"` + `aria-modal`. Reusar `useFocusTrap` em vez de reescrever.
3. Ao revisar um overlay já existente "com Escape resolvido", testar os DOIS
   sentidos de Tab, não só o de abrir e fechar — o escape pode acontecer só
   no Shift+Tab, como aconteceu aqui com a paleta.

**Como medir isso de verdade (não só ler o código):** Playwright com
`page.keyboard.press('Tab')`/`'Shift+Tab'` repetido várias vezes (ex. 10x) e,
a cada passo, `document.activeElement` precisa estar DENTRO do contêiner do
overlay (`container.contains(document.activeElement)`) — ler o JSX não prova
isso, porque a armadilha depende de comportamento de runtime do navegador.
