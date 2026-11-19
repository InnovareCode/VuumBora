---
name: bug_veu_calibrado_para_posicao_antiga_do_texto
description: Véu/gradiente de contraste calibrado por pixel para texto ancorado numa posição (ex. embaixo da faixa, onde o gradiente é forte) falha silenciosamente quando um layout novo move esse MESMO texto para outra posição (ex. topo, onde o gradiente era fraco de propósito) — a calibração antiga não é transferível, precisa remedir. Use sempre que reposicionar texto dentro de um hero/faixa que já tinha véu calibrado.
metadata:
  type: bug
---

**Contexto:** `.faixa__veil` (site-cine) foi calibrado em 19/11/2026 pra
texto ANCORADO EMBAIXO da faixa (`align-items:flex-end`), com gradiente
fraco no topo (quase transparente, 0→0,1 nos primeiros 28%) e forte embaixo
(0,85-0,95 nos últimos 35%) — ver [[project_site_cine_pagina_estatica]].

**O que quebrou:** ao subir o formulário de candidatura pro hero (faixa 1),
o layout virou duas colunas lado a lado (`align-items:flex-start`), e o
texto (eyebrow/H1/parágrafo) passou a ficar perto do TOPO da faixa em telas
largas — exatamente a região onde o véu antigo era fraco de propósito.
Medido por pixel (cor computada do texto vs. pixel real de fundo, nunca a
cor computada do texto vs. ela mesma): o parágrafo (`--text-secondary`,
mais escuro que o H1) caía a **1,5-2:1** contra o céu claro do amanhecer —
bem abaixo do mínimo 4,5:1 — enquanto o H1 (branco, mais claro) ainda
passava por sorte.

**Correção:** a faixa que ganhou o novo layout recebeu um véu PRÓPRIO,
mais escuro e mais uniforme do topo ao fim (`.faixa[data-faixa="1"]
.faixa__veil`), calibrado de novo por pixel pros três elementos de texto
nas DUAS posições possíveis (topo, duas colunas ≥900px; e embaixo,
empilhado <900px) — não reaproveitou a curva antiga.

**Como detectar da próxima vez:** qualquer mudança que reposicione texto
dentro de uma faixa com véu/scrim já calibrado é motivo pra REMEDIR do
zero, não karma herdado — a calibração é por POSIÇÃO do texto dentro do
gradiente, não pelo elemento em si. "Já tinha sido calibrado" não vale se
o texto se moveu.
