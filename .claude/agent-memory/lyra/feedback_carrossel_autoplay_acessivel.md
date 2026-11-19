---
name: feedback_carrossel_autoplay_acessivel
description: Receita testada para um carrossel que avança sozinho sem reprovar acessibilidade — pausa em hover/foco/aba oculta, respeita prefers-reduced-motion, funciona sem JavaScript. Use sempre que pedirem carrossel/slider automático.
metadata:
  type: feedback
---

**Contexto:** o dono pediu primeiro "sem autoplay" (acessibilidade), depois
no MESMO dia revogou e pediu "passa sozinho, fluido" — mas manteve toda a
acessibilidade. As duas coisas não se excluem: dá pra ter autoplay E não
reprovar nada, com esta receita (`apps/site/src/components/ArtCarousel.tsx`):

**Os quatro motivos de pausa, combinados (nunca um só booleano):**
```
playing = !reducedMotion && !manuallyPaused && !interactionPaused && !tabHidden
```
- `manuallyPaused`: botão visível de pausar/retomar — PERSISTE até a pessoa
  clicar de novo.
- `interactionPaused`: hover (`onPointerEnter`/`Leave`) OU foco por teclado
  dentro da área (`onFocusCapture`/`onBlurCapture` verificando
  `relatedTarget` contra o container) — é TRANSITÓRIO, volta a andar ao
  sair/perder o foco.
- `tabHidden`: `document.visibilitychange` — não gasta CPU/bateria com a aba
  em segundo plano.
- `reducedMotion`: nunca inicia o intervalo. Também esconde o BOTÃO de
  pausar (não faz sentido oferecer pausar o que nunca anda).

**Transição suave sem motor de animação próprio:** `track.scrollTo({left,
behavior:'smooth'})` em cima de uma `<ul>` que já é `overflow-x:auto` +
`scroll-snap-type:x mandatory` em CSS puro — o deslize suave É o scroll-snap
nativo do navegador. Trocar `behavior` pra `'auto'` quando `reducedMotion`.

**Funciona sem JavaScript, de verdade (não só na teoria):** teste com
`browser.newContext({ javaScriptEnabled: false })` e confirme que a seção e
todos os slides continuam no DOM, roláveis por gesto — os botões de
seta/pausa/bolinha e o avanço automático são tudo camada de CIMA, adicionada
só depois de hidratar.

**Armadilha de lint:** inicializar o estado de `prefers-reduced-motion` por
`setState` dentro do primeiro `useEffect` dispara
`react-hooks/set-state-in-effect` como ERRO (não warning) neste projeto —
use inicializador preguiçoso do `useState`:
```ts
const [reducedMotion, setReducedMotion] = useState(
  () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);
```
e deixe o `useEffect` só para ASSINAR mudanças (`mq.addEventListener('change', ...)`),
nunca para setar o valor inicial.

**Como provar que pausa/retoma de verdade (não assumir pelo código):**
Playwright, esperando o intervalo real (5,5s + folga) em cada cenário:
hover → não muda; sai do hover → muda depois de esperar de novo; foco por
teclado → não muda; perde o foco → muda; clica pausar → não muda mesmo
esperando; `reducedMotion:'reduce'` no contexto → nunca muda e o botão de
pausa não existe; `document.hidden=true` disparando `visibilitychange` →
não muda.

Ver [[project_site_nextjs_static_export]] (seção "4ª reescrita").
