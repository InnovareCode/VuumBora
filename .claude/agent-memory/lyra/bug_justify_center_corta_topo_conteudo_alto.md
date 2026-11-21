---
name: bug_justify_center_corta_topo_conteudo_alto
description: `justify-center` em coluna flex com overflow-y-auto corta o topo de conteúdo mais alto que a tela, sem como rolar até ele — AuthSplitLayout, painel de códigos de recuperação (21/11/2026).
metadata:
  type: project
---

Sintoma: no desktop 1280x800 o cartão dos 10 códigos de recuperação saía com o
título cortado no topo e nenhuma rolagem alcançava. Causa raiz: o contêiner
`flex flex-col justify-center overflow-y-auto` centraliza o filho; quando o
filho é mais alto que o contêiner, o excesso vai igual pra cima e pra baixo, e
a parte de cima fica em coordenada negativa (não rolável). O login antigo
nunca disparava porque o cartão era baixo.

Correção: tirar `justify-center` do pai e pôr `my-auto` no filho — centraliza
quando sobra espaço, e quando falta o topo volta a ser alcançável.
Vale para qualquer tela/modal centralizado com conteúdo de altura variável.
Medir com viewport CURTO (560–800 px de altura), não só o confortável.
