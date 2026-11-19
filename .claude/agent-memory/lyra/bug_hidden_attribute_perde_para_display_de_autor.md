---
name: bug_hidden_attribute_perde_para_display_de_autor
description: O atributo HTML `hidden` só esconde via a regra [hidden]{display:none} da folha de estilo da UA — qualquer CSS de autor que define `display` no mesmo elemento (ex. `.card{display:flex}`), mesmo empatando em especificidade, vence, porque origem de autor sempre bate origem de UA na cascata. Use sempre que revelar um elemento "camada de cima, só depois do JS" via `hidden` + uma classe com display próprio.
metadata:
  type: bug
---

**Sintoma:** controles do carrossel (`.carousel__controls`,
`.carousel__dots`) tinham o atributo `hidden` no HTML por padrão (padrão
"revela só depois que o JS liga", ver [[feedback_carrossel_autoplay_acessivel]]).
Com JS DESLIGADO — testado de verdade, não assumido — as setas/pausa/
bolinhas apareciam do mesmo jeito, mesmo com `getAttribute('hidden')`
confirmando que o atributo estava lá.

**Causa raiz:** a cascata CSS resolve primeiro por ORIGEM (user-agent <
user < author, sem contar `!important`) e só DEPOIS por especificidade
dentro da mesma origem. `[hidden]{display:none}` mora na folha da UA.
`.carousel__controls{display:flex}` é CSS de autor. Não importa que as
duas tenham especificidade (0,0,1,0) — autor ganha da UA sempre, então o
`display:flex` autoral cancela o `display:none` do atributo, mesmo com o
atributo fisicamente presente no elemento.

**Correção:** quando uma classe sua define `display` num elemento que também
pode levar `hidden`, declare explicitamente a prioridade de volta pro
atributo, de autor pra autor:
```css
.carousel__controls[hidden],
.carousel__dots[hidden] { display: none; }
```
(Especificidade (0,0,2,0), maior que a classe sozinha (0,0,1,0) — não
depende nem de ordem no arquivo.)

**Como detectar:** nunca confiar só em `getAttribute('hidden')` pra provar
que algo está escondido — isso só prova que o ATRIBUTO está lá, não que o
CSS realmente obedece. Testar visualmente (screenshot) com
`javaScriptEnabled:false`, que foi exatamente o que achou este bug.
