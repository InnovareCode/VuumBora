---
name: bug_form_row_city_perdeu_para_hero_card_form_row
description: Modificador de 1 classe (.form-row--city) perdeu silenciosamente para um seletor descendente de 2 classes (.hero-card .form-row) em QUALQUER largura, não só no breakpoint testado primeiro — a UF virava metade do cartão (185px) ou a linha inteira (308px no mobile) em vez dos 136px fixos. Use ao escrever um modificador de classe que precisa vencer uma regra de componente pai+filho já existente, especialmente dentro de media query.
metadata:
  type: feedback
---

**O bug:** `site-cine/public/assets/css/style.css` (reforma do formulário,
19/11/2026). A especificação pedia `.form-row--city { grid-template-columns:
1fr 136px; }`, "vale também abaixo de 480px". Escrevi essa regra com 1 classe
de especificidade (0,1,0). Só que já existia, mais abaixo no arquivo, uma
regra do card (`.hero-card .form-row { grid-template-columns: 1fr 1fr; }`
dentro de `@media (min-width:480px)`, e `grid-template-columns: 1fr` fora
dela) com 2 classes de especificidade (0,2,0) — **ela vence `.form-row--city`
em QUALQUER largura**, porque especificidade não depende de media query.

**Por que não vi lendo o CSS:** as duas regras pareciam resolver problemas
diferentes (uma é "a UF é estreita", a outra é "telefone e e-mail empilham no
celular") e estavam em seções separadas do arquivo. Só a medição real
(`getBoundingClientRect` da UF) expôs que a coluna da UF tinha 185px no
desktop e 308px no mobile — nunca os 136px pedidos, em NENHUMA largura.

**A correção:** reforçar a especificidade do modificador para empatar ou
vencer a regra do componente pai, combinando as duas classes no mesmo
seletor:
```css
.hero-card .form-row.form-row--city,
.form-row.form-row--city {
  grid-template-columns: 1fr 136px;
}
```
`.hero-card .form-row.form-row--city` tem 3 classes (0,3,0), vence a
`.hero-card .form-row` de 2 classes (0,2,0) em qualquer largura.

**Lição geral:** um modificador BEM (`.bloco--variante`) escrito com 1 classe
só vence outro seletor do mesmo bloco se esse outro seletor também tiver 1
classe (ou empate de especificidade com ordem a favor). Se o componente pai
já tem uma regra descendente de 2+ classes mexendo na mesma propriedade,
confira a especificidade ANTES de assumir que o modificador "mais específico
pela intenção" vence — e prove com medição em pelo menos 2 breakpoints
(dentro e fora da media query do pai), não só um.
