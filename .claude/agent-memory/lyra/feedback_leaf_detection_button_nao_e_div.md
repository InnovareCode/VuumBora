---
name: feedback_leaf_detection_button_nao_e_div
description: Ao escrever um script de medição que procura o "nó-folha de texto" filtrando por filhos DIV, um Pressable renderizado como <button> no React Native Web engana o filtro — a div ao redor do botão vira um falso positivo.
metadata:
  type: feedback
---

**O padrão que já usei** pra achar o elemento onde um texto "nasce" (não herdado
de descendente) é: pegar todo `div` cujo `textContent` bate com o alvo e cujo
NENHUM filho `div` tem o mesmo `textContent`. Funciona bem pra `<Text>` puro
(sempre vira `<div dir="auto">` no RN Web).

**Onde quebrou:** `Pressable`/botão no React Native Web renderiza como
`<div><button>...texto...</button></div>` — o filho que carrega o texto de
verdade é um `<button>`, não um `<div>`. O filtro "nenhum filho DIV repete o
texto" não enxerga o `<button>`, então a `div` externa (que não tem nenhum
estilo de fonte próprio) passa como se fosse a folha — e a leitura de
`getComputedStyle` nela cai no default do navegador (`Times New Roman`, no
Chromium), parecendo que a fonte da marca não foi aplicada quando na verdade
ela está certa no `<button>` de dentro.

**Correção do filtro:** checar filhos de QUALQUER tag que preserve o mesmo
texto, não só `DIV`:
```js
!Array.from(el.children).some((c) => c.textContent === el.textContent)
```
(sem o `&& c.tagName === 'DIV'`). Ou, mais direto: ao investigar fonte/estilo de
um botão especificamente, pegue o `<button>` por seletor (`el.querySelector
('button')` ou `getByRole('button')`) em vez de reconstruir a heurística de
folha.
