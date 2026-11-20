---
name: bug_pino_nao_centralizado_na_coluna_desalinha_linha
description: Num "stepper"/linha do tempo com grid de N colunas, posicionar o pino em `left:0` da própria coluna (em vez de centralizado) desalinha qualquer marcador calculado por porcentagem (ex. um marcador "HOJE" no meio do trilho) — ele cai em cima do pino errado. Achado na linha do tempo ONDE ESTAMOS do site, 20/11/2026.
metadata:
  type: feedback
---

Construí uma linha do tempo horizontal com `grid-template-columns:
repeat(4,1fr)` e um pino por estação. Coloquei cada pino em `left:0` da
própria `li` (fazia sentido "ler" como início do texto da estação). Um
marcador extra ("HOJE") ficava posicionado por porcentagem (`left:50%`) num
elemento irmão que cobre a largura inteira da grade.

**Bug:** com pino em `left:0`, as 4 colunas colocam os pinos em 0%, 25%, 50%,
75% da grade — não nos CENTROS das colunas (12,5%, 37,5%, 62,5%, 87,5%).
"HOJE" a 50% caiu exatamente em cima do pino da 3ª estação (apagado, "em
construção"), ilegível, medido no navegador a 1440px.

**Correção:** `left:50%; transform:translateX(-50%)` no pino — centraliza na
própria coluna. Com isso os 4 pinos caem em 12,5/37,5/62,5/87,5%, e um
marcador no meio exato do traço SVG (`viewBox` com extremos nos centros do
1º e do 4º pino) cai sozinho entre a 2ª e a 3ª estação, sem colidir.

**Regra geral:** em qualquer "pino numa grade de N colunas + traço/marcador
calculado por porcentagem", SEMPRE centralizar o pino na coluna antes de
calcular qualquer posição relativa ao conjunto — "início da coluna" e "centro
da coluna" são matematicamente diferentes e só aparecem divergentes quando se
olha a tela, nunca lendo o CSS.
