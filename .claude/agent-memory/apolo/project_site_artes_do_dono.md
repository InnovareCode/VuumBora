---
name: site-artes-do-dono
description: Por que o site de pre-lancamento foi reprovado 4x — artes do dono desmontadas em cartoes escuros; regras de veu, escala de titulo e recorte
metadata:
  type: project
---

O site (apps/site) foi reprovado 4 vezes até 19/11/2026 ("muito FEIO"). A auditoria completa está em docs/auditoria-arte-site.md.

Causa raiz: as artes em Imagens_Site/ são composições prontas (foto dourada e clara, título com ~30% da largura, logo com ~18%). O site as cortou em 6 PhotoCards iguais, com véu duplo copiado do ModaShop, e títulos de 28px. Medido: as fotos perdem cerca de 62% da luz (rosto cai para 26-33/255) e o H1 fica abaixo da dobra em 1440x900.

**Why:** a receita do ModaShop (docs/padrao-visual-site.md) serve para foto decorativa. Aqui a foto é o produto (gente local com a camisa da marca).
**How to apply:** o ponto de partida é sempre comparar com a arte original do dono, lado a lado. Use véu só na faixa do texto (até ~42% da altura). O H1 fica entre 64 e 72px no desktop e nunca abaixo de 40px no mobile. Use `object-position` por arte. As bases têm só ~870px de largura, então peça ao dono as fotos sem texto em alta resolução. Ver [[copy-site]] e [[paleta-vuumbora]].
