---
name: bug_componente_reaproveitado_numberoflines_fixo
description: Reaproveitar um componente de outra tela que tem numberOfLines hardcoded (sem prop pra mudar) pode truncar texto bem mais longo do que o caso original previa — achado real reaproveitando RouteSummaryRow (P06, numberOfLines={2}) na P11 (endereço completo de destino, 3 linhas necessárias).
metadata:
  type: feedback
---

**Causa raiz:** `RouteSummaryRow` (`apps/passenger/src/components/confirmation/
RouteSummaryRow.tsx`) foi feito pra P06 (Confirmação), onde origem/destino são
endereços curtos vindos do autocomplete. O `value` tem `numberOfLines={2}` escrito
direto no JSX do componente, sem prop pra configurar. Ao reaproveitar o MESMO
componente na P11 (comprovante do histórico) pra um endereço completo de verdade
("Shopping Central, Av. Senador Salgado Filho, 2234 - Candelária, Natal - RN"), o
texto cortou com reticências na 2ª linha — truncamento real, achado só na screenshot
(Playwright), não ao ler o JSX (o componente "parecia" genérico o suficiente).

**Por que não editei o componente original:** `RouteSummaryRow` também é consumido
por `confirmacao.tsx`, uma das telas marcadas como "em uso" (Atlas pediu pra não
editar). Mudar `numberOfLines` ali por causa de um caso de uso novo arriscava
regressão num fluxo que não é meu de testar nesta tarefa.

**Correção:** criar um componente IRMÃO (`TripDetailRow`, mesma pasta por feature —
`apps/passenger/src/components/history/`) com o mesmo visual mas SEM limite de
linhas no valor, em vez de generalizar o componente existente. Pequena duplicação de
~15 linhas, mas zero risco pra tela que não é minha.

**Como aplicar:** antes de importar um componente de OUTRA feature/tela só porque o
shape (ícone+rótulo+valor) parece igual, checar se ele tem `numberOfLines` (ou
qualquer limite de conteúdo) fixo no código — se sim, e o dado novo pode ser mais
longo que o caso original, não reaproveitar: duplicar o componente pequeno é mais
barato que o risco de truncar silenciosamente ou de mexer numa tela "em uso" alheia.
Ver também [[bug_screenheader_title_fixo_trunca_320]] (mesma classe de problema,
componente transversal com limite de texto fixo).
