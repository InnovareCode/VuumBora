---
name: feedback_checar_overflow_por_elemento
description: document.scrollWidth/scrollHeight não enxerga overflow que já foi absorvido por um contêiner intermediário (ScrollView) com seu próprio overflow — tem que medir cada elemento candidato, não o documento.
metadata:
  type: feedback
---

**Regra confirmada pelo Atlas (reprovação real):** medir
`document.documentElement.scrollWidth > clientWidth` para detectar corte horizontal
é o MESMO ponto cego que medir `scrollHeight` do documento pra detectar corte
vertical (já registrado em [[feedback_medir_expo_web_playwright]]) — um
`ScrollView` do React Native Web é uma `div` com `overflow` próprio; qualquer
conteúdo que vaza DENTRO dele é absorvido ali, nunca sobe pro `document`.

**Teste certo — por elemento, nas duas direções:**
```js
await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return Array.from(document.querySelectorAll('*')).filter((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const bleedsOutOfViewport = r.right > vw + 1;              // vaza da viewport
    const clippedInsideItself = el.scrollWidth > el.clientWidth + 1 && s.overflow.includes('hidden'); // cortado por si mesmo (ex.: numberOfLines)
    return bleedsOutOfViewport || clippedInsideItself;
  });
});
```
Isso pega os dois mecanismos de corte: (1) elemento que cresce além do pai e é
cortado por um ancestral com overflow escondido (ex.: o bug de `flexWrap` sem
`flex:1`, ver [[bug_rn_web_flexwrap_sem_flex1]]); (2) elemento que corta o PRÓPRIO
conteúdo (ex.: `numberOfLines`/`ellipsizeMode`, que é esperado em título de header,
não é bug).

**Cuidado ao escolher o "elemento certo" pra inspecionar:** uma `div` qualquer tem
`textContent` igual à concatenação de TODOS os descendentes — pegar "a menor
largura entre os que contêm o texto" não é confiável. Pra achar a folha de verdade,
filtre por "nenhum filho `DIV` tem o mesmo `textContent`" (texto nasce ali, não é
herdado).

**Antes de aceitar um relato de corte como reproduzido:** rodar de novo com
contexto novo do navegador + URL com cache-busting (`?bust=timestamp`), porque um
bundle Metro desatualizado em cache do navegador pode mostrar um bug que já foi
corrigido no código — e isso é indistinguível de "a correção não pegou" sem
reconferir. Reportar número exato de elementos checados (não só "zero problemas").
