---
name: bug_referencia_linha_unica_nao_cabe_breakpoint
description: Por que um arranjo "tudo numa linha" visto numa imagem de referência (mockup de marketing) pode não caber em NENHUM dos breakpoints reais do app, mesmo o mais largo — achado real tentando replicar o card "Status do motorista" da Home do motorista (18/11/2026).
metadata:
  type: feedback
---

**Causa raiz:** imagens de referência (`VuumBora_Claude_Design_System/referencias/...`)
costumam ser renderizadas numa moldura de celular grande/genérica para fins de
marketing, não necessariamente na menor largura real que o app precisa suportar.
Um arranjo que parece caber visualmente na imagem (ex.: rótulo + pílula de toggle +
divisor + ícone + texto de status, tudo numa linha só) pode exigir mais largura do
que QUALQUER um dos breakpoints pedidos pro teste (320/360/390/430).

**Como foi achado:** não foi visto comparando a imagem com o olho — foi medido
(Playwright, `getBoundingClientRect` de cada filho da linha) depois de já ter
implementado a versão "linha única" com um breakpoint (`>=390`) chutado por
estimativa de largura de texto. Mesmo a 430px (o mais largo pedido), sobravam só
~70-73px pro bloco de texto de status depois de rótulo (133px) + pílula (121px) +
divisor + 3 gaps (36px) — "Você está online e recebendo corridas." cortava com "…"
mesmo em 2 linhas. A linha única só caberia a partir de ~500px, fora do escopo.

**Correção:** `apps/driver/src/components/home/OnlineToggle.tsx` voltou a ficar
em DUAS linhas (rótulo+selo numa, toggle+divisor+status na outra) em TODOS os
breakpoints — abandonei o layout de linha única da referência depois de medir que
era inviável no range real, e documentei a medição no comentário do componente em
vez de só reportar "não dava". Ver também [[project_vuumbora_overview]].

**Como aplicar da próxima vez:** antes de implementar um arranjo "tudo numa linha"
copiado de uma imagem de referência, somar mentalmente (ou medir rápido) a largura
mínima de cada peça de texto fixo (rótulos, pílulas, botões) nos textos REAIS do
app (não nos da imagem, que podem ser mais curtos/diferentes) contra a largura do
breakpoint mais largo exigido. Se a soma já estourar, nem vale tentar um
breakpoint "esperto" — o arranjo em si não cabe, e a solução é um layout diferente
(empilhado), não um breakpoint maior.
