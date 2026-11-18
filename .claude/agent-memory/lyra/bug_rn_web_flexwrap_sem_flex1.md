---
name: bug_rn_web_flexwrap_sem_flex1
description: Em React Native Web, um flex item com flexWrap:'wrap' mas sem flex:1 (ou largura definida) não quebra linha — ele cresce e é cortado pelo ScrollView, sem gerar overflow visível no scrollWidth do documento.
metadata:
  type: feedback
---

**Causa raiz:** dentro de um flex row (`flexDirection:'row'`), um filho sem
`flex`/`width` explícito não estica nem é limitado pelo espaço restante — ele só
assume a largura natural do próprio conteúdo. Se esse filho também tem
`flexWrap:'wrap'` esperando quebrar os NETOS dele, a quebra nunca é acionada porque
não há uma largura máxima para comparar: ele simplesmente cresce além do pai. O
`ScrollView` (que no React Native Web vira uma `div` com `overflow-x: hidden`,
`overflow-y: auto`) absorve esse excesso cortando visualmente, **sem** isso aparecer
como `document.documentElement.scrollWidth > clientWidth` — então um check de
"overflow horizontal" no nível do documento não pega o bug; só aparece no
screenshot real ou medindo `getBoundingClientRect().right` de cada elemento contra
`clientWidth`.

**Onde apareceu:** `apps/passenger/src/components/catalog/CatalogRow.tsx` — a
`View` de `label` (largura fixa 110) ficava ao lado da `View` de `content`
(`flexDirection:'row', flexWrap:'wrap'`, sem `flex`). Com 3 `BrandLogo` grandes
lado a lado, o terceiro ficava cortado pela borda da tela, mas
`HORIZONTAL_OVERFLOW` (medido via `scrollWidth`) dava `false`.

**Correção:** adicionar `flex: 1` ao container que deveria quebrar linha
(`content: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', ... }`). Regra geral:
**`flexWrap:'wrap'` só funciona se o próprio container tiver uma largura limitada**
(via `flex:1` num row-pai, ou `width` explícito/`%`) — nunca assuma que
`flexWrap` sozinho basta.

**Como detectar da próxima vez (barato, fazer sempre que houver `flexWrap` num
catálogo/tela de print):**
```js
await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return Array.from(document.querySelectorAll('*'))
    .filter(el => el.getBoundingClientRect().right > vw + 1)
    .map(el => el.textContent?.slice(0, 30));
});
```
Isso pega qualquer elemento cujo retângulo realmente ultrapassa a viewport, mesmo
quando o documento não registra scroll. Ver também
[[feedback_medir_expo_web_playwright]].
