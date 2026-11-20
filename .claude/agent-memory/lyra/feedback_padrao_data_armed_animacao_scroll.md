---
name: feedback_padrao_data_armed_animacao_scroll
description: Como generalizar o padrão do `.reveal` (estado final é o CSS padrão, JS arma e desarma) para várias animações de entrada diferentes na mesma página, com um helper único — usado na direção de arte do site de 20/11/2026 (QUEM SOMOS, ONDE ESTAMOS, cartões de motivo).
metadata:
  type: feedback
---

Quando uma direção de arte pede VÁRIAS animações de entrada diferentes (texto
sobe, linhas da ficha entram escalonadas, pino acende, trilho se desenha),
sem usar uma lib de animação, o padrão que escala é um ÚNICO helper JS
reaproveitado várias vezes, não uma função por seção.

**How to apply:**
- Helper genérico: recebe uma lista de elementos + opções do
  `IntersectionObserver`; se `prefers-reduced-motion` ou não houver
  `IntersectionObserver`, **não faz nada** (nem seta o atributo) — isso é o
  que garante "sem JS ou com movimento reduzido, aparece o estado final
  direto", sem precisar de uma regra `@media (prefers-reduced-motion)`
  redundante em cada componente.
- O atributo (`data-armed="true"`) é setado pelo JS ANTES de observar, e
  removido (não trocado para `"false"` — `removeAttribute`) quando o
  `IntersectionObserver` dispara. CSS só define a REGRA do estado "armado"
  (escondido/deslocado); o estado sem o atributo é sempre o layout normal já
  escrito no resto do arquivo — zero duplicação de "estado final".
- Quando o MESMO efeito precisa de dois gatilhos diferentes por breakpoint
  (ex.: "acima de 1100px todos os cartões entram juntos, abaixo cada um entra
  sozinho"), escreva a regra CSS cobrindo os DOIS casos ao mesmo tempo:
  `[data-armed="true"] .item, .item[data-armed="true"] { ... }` — a primeira
  parte cobre "armei o contêiner pai", a segunda cobre "armei o item direto".
  Só precisa de uma função JS que decide, por `matchMedia`, QUAL elemento vai
  receber o atributo (o wrapper ou cada item).
- Delays por item: resolvidos em CSS puro com `:nth-child()`, não calculados
  em JS — mais simples e a direção de arte já vem com os números fixos (0,
  90, 180, 270ms etc.), não precisa ser dinâmico.

**Por quê:** economiza reescrever a mesma lógica de IntersectionObserver +
guarda de `prefers-reduced-motion` 3-4 vezes, e qualquer novo componente de
"entrada ao rolar" no projeto só chama o helper existente.
