---
name: project-admin-v0-gaveta-mobile-sem-focus-trap
description: Bug encontrado em 20/11/2026 (gaveta mobile sem focus trap/Escape) — CORRIGIDO pela Lyra no mesmo dia com useFocusTrap; achei um segundo caso (CommandPalette, Shift+Tab) na mesma classe de bug
metadata:
  type: project
---

**STATUS: corrigido e revalidado em 20/11/2026.** A Lyra criou
`apps/admin/src/nav/useFocusTrap.ts` (prende Tab/Shift+Tab dentro do
contêiner, trata Escape, devolve o foco a quem abriu) e moveu a gaveta pra
depois de `header`+`main` no JSX — a causa raiz que eu tinha apontado.
Apliquei o mesmo hook na `CommandPalette`, que tinha o MESMO bug só que pelo
lado contrário: Shift+Tab a partir do campo de busca escapava pro último
link focável da página de fundo (eu não tinha testado esse sentido na
primeira rodada — fica registrado: ao achar um bug de focus trap, sempre
testar os DOIS sentidos, Tab E Shift+Tab, nas DUAS superfícies, não só a
onde achou primeiro).

Revalidei com Playwright headed, API real (porta 3101/5434), login real,
em 1280 e 375: Tab e Shift+Tab ciclam dentro da gaveta e da paleta sem
escapar pro fundo nos dois casos; Escape fecha as duas; foco volta pro
botão que abriu ("Abrir menu" / "Buscar área do painel") nas duas.

O relato original do bug (como referência) fica abaixo.

`apps/admin/src/components/AppShell.tsx` — a gaveta mobile (`drawerOpen`) é
um overlay (`fixed inset-0 z-50`, backdrop `bg-black/50`) mas é renderizada
no DOM como irmã ANTES do bloco `header`+`main` (que fica dentro da mesma
`<div className="flex flex-1">`). Isso quebra a ordem de tab de duas formas,
só visíveis testando com teclado de verdade (Playwright `page.keyboard`),
nunca clicando com mouse:

1. **Sem focus trap:** abrir a gaveta com Enter no botão "Abrir menu" e dar
   Tab leva para os controles da PÁGINA DE FUNDO (chips de filtro, busca,
   link do primeiro item da lista) — que estão visualmente cobertos pelo
   backdrop — antes de chegar nos itens de menu da própria gaveta. Só depois
   de esgotar o conteúdo de fundo e dar wraparound (volta pro topo do
   documento) o foco finalmente entra na gaveta (botão "Fechar menu", grupo,
   link).
2. **Escape não fecha:** não há `onKeyDown` nenhum no componente da gaveta —
   diferente da `CommandPalette` (`nav/CommandPalette.tsx`), que trata
   `Escape` explicitamente. Único jeito de fechar por teclado é dar Tab até
   achar o botão "Fechar menu" (depois de passar pelo conteúdo de fundo) e
   apertar Enter/Espaço.

**Por quê isto importa:** é exatamente o item que o Atlas pediu pra provar
("percorra tudo pelo teclado — a Lyra mediu só no modo mock") — clique de
mouse nunca exercita isso, porque o clique vai direto no elemento visível,
sem passar pela ordem de tab.

**Correção esperada (para quem for consertar, provavelmente Lyra):**
mover a gaveta pra depois do bloco `header`+`main` no JSX (ou renderizar via
portal), adicionar `onKeyDown` tratando `Escape` igual à `CommandPalette`, e
considerar um focus trap de verdade (ciclar Tab dentro do próprio overlay
enquanto aberto) — padrão que a `CommandPalette` também não tem
100% (Tab dentro dela não foi testado a fundo, só Escape/setas/Enter).

Reproduzido com Playwright headed, login real via teclado, viewport 375x700,
contra API http real (não mock). Ver
[[project-admin-v0-ambiente-de-teste]] e
[[feedback-tsx-watch-eaddrinuse-restart-falho]].
