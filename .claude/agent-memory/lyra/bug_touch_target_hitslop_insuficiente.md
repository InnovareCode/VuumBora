---
name: bug_touch_target_hitslop_insuficiente
description: hitSlop isolado numa Pressable pequena não garante o alvo de toque mínimo de 44px exigido pelo design system — em React Native Web o hitSlop não aumenta o retângulo medido por getBoundingClientRect, então o elemento real continua pequeno.
metadata:
  type: feedback
---

**Causa raiz:** `hitSlop` expande a área de toque *lógica* (hit-testing) em alguns
ambientes, mas em React Native Web o botão de toggle "Mostrar/Ocultar senha" e o
botão "Limpar busca" (`PasswordInput`/`SearchInput`) mediam **19px** e **21px** de
altura mesmo com `hitSlop={8}` — bem abaixo do mínimo de 44×44 exigido em
`docs/identidade-visual.md`/`DESIGN_SYSTEM_MESTRE.md §5`. `hitSlop` não aparece no
`getBoundingClientRect()` do elemento, então qualquer medição real (ou teste de
acessibilidade) continua reprovando mesmo com `hitSlop` presente.

**Onde apareceu:** `packages/ui/src/PasswordInput.tsx` e
`packages/ui/src/SearchInput.tsx`, nos acessórios internos de `InputCore`.

**Correção:** dar `minHeight`/`minWidth: theme.layout.touchTarget` (44) + `alignItems`/
`justifyContent: 'center'` na própria `Pressable`, em vez de confiar em `hitSlop`
para "tapar o buraco" visualmente. `hitSlop` ainda ajuda como reforço, mas não
substitui o tamanho real do elemento.

**Como detectar da próxima vez:** medir toda `[role="button"]`/`Pressable`
interativa pequena contra 44px, direto no navegador:
```js
await page.evaluate(() =>
  Array.from(document.querySelectorAll('[role="button"]')).map(el => {
    const r = el.getBoundingClientRect();
    return { label: el.getAttribute('aria-label'), width: r.width, height: r.height };
  })
);
```
Qualquer `width`/`height` < 44 numa Pressable real (não decorativa) é reprovação,
mesmo que o `hitSlop` esteja lá. Ver [[feedback_medir_expo_web_playwright]].

**Segundo caso real, causa raiz diferente (18/11/2026, `HomeMapPreview` dos botões de
zoom +/- do passageiro):** a `Pressable` (`zoomButton`) NÃO tinha `width` próprio —
herdava a largura do pai (`zoomGroup`, `width: 44`) por `alignItems: 'stretch'`
(padrão). Só que `zoomGroup` também tinha `borderWidth: 1` nos dois lados: a borda
consome 2px da CAIXA DE CONTEÚDO em que o filho esticado se encaixa, então o filho
media **42px**, não 44, mesmo com o pai "certo" no papel. Medição por elemento
(`getBoundingClientRect` do `[role="button"]`) pegou os 42px reais; só de ler o
código (pai com `width: theme.layout.touchTarget`) pareceria correto.
**Correção:** dar `width`/`height: theme.layout.touchTarget` explícito na própria
`Pressable` que é o alvo de toque, nunca confiar em herdar de um pai com borda —
mesma lição de sempre, variante nova: "o pai tem o valor certo" não é prova de que o
FILHO (o que de fato recebe o toque) mede o mesmo.
