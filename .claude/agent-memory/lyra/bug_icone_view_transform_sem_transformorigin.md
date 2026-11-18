---
name: bug_icone_view_transform_sem_transformorigin
description: Ao desenhar um ícone composto (ex. lupa) com Views posicionadas e rotate, a rotação por padrão pivota no CENTRO do próprio elemento — isso desconecta visualmente a peça girada da peça fixa, mesmo com as posições "certas" na matemática ingênua.
metadata:
  type: feedback
---

**Causa raiz:** `transform: [{ rotate: '45deg' }]` roda em torno do centro geométrico do
elemento por padrão (`transformOrigin` implícito = `50% 50% 0`). Ao desenhar o cabo da
lupa do `SearchInput` como uma barra fina ancorada perto do círculo (`position:
absolute, bottom:0, right:0`) e girar 45°, o CENTRO da barra é o que fica fixo — não a
ponta que deveria tocar o círculo. Resultado: um traço solto, visualmente flutuando
perto do círculo, não encostando nele (só aparece olhando o print ampliado; não dá pra
prever certo só de cabeça).

**Onde apareceu:** `packages/ui/src/SearchInput.tsx`, `MagnifierGlyph` (`styles.
magnifierHandle`).

**Correção:** usar `transformOrigin: ['50%', '0%', 0]` (suportado pelo RN deste
projeto, ver `node_modules/react-native/types_generated/.../_TransformStyle.d.ts`) pra
pivotar no TOPO da barra, e posicionar esse topo exatamente no ponto da borda do
círculo (`centro + raio·(cos45°, sin45°)` pra "bottom-right"). Assim a rotação gira a
barra a partir do ponto de contato, que fica fixo — looks right in every state.

**Regra geral:** qualquer ícone composto por peças com `rotate` tem que ancorar
explicitamente o `transformOrigin` no ponto de junção, nunca confiar no centro
padrão. E sempre conferir ampliando o print (recorte + resize 5-8x com PIL), porque no
tamanho real (16-18px) o desalinhamento é sutil demais pra notar sem ampliar.
