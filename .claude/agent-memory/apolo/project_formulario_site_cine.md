---
name: formulario-site-cine
description: 5a reprovacao (19/11/2026) do site-cine foi o formulario e as secoes sem foto; armadilhas medidas do palco sticky, peso 700 inexistente, foco quadrando pilula
metadata:
  type: project
---

Em 19/11/2026 o dono aprovou as imagens e a jornada de scroll do site-cine, mas reprovou "o resto" e chamou o formulario de amador. A especificacao completa esta em docs/especificacao-formulario-e-secoes.md.

**Why:** o formulario mora dentro do palco da jornada (sticky, 100svh, overflow hidden, conteudo ancorado embaixo). Tudo que cresce sobe e some: em 1280x720 o cartao ja nascia com topo em -43px, e ao errar ele ia de 731 para 974px, com o topo em -106px e inalcancavel.

**How to apply:**
- Qualquer coisa dentro do palco fixo precisa de orcamento de altura medido em 1280x720, em repouso e com erro. Use uma rede de seguranca que desliga o modo cinematografico quando o cartao nao cabe.
- O site carrega so Poppins 500 e 800. Pedir 700 renderiza 800 (medido com largura identica).
- Poppins nao tem algarismos tabulares. O zero da JetBrains Mono tem ponto e "20%" se le "28%". Numero grande vai em Poppins com largura minima fixa.
- A regra global de foco com border-radius:4px quadrava as pilulas e os circulos.
- legend com float dentro de fieldset flex NAO funcionou no Chromium. Use a legend visually-hidden e um invólucro div.

Ver [[site-artes-do-dono]] e [[copy-site]].
