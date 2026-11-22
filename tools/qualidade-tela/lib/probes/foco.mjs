// Sonda de foco (§14.3, G-22): ordem de tabulação + anel de foco visível de
// verdade. A parte do anel é a adaptação do `ring6.mjs`/`ring.mjs` que a Íris
// deixou na passada 6 (ver docs/qualidade-tela.md para o mapeamento completo):
// em vez de só checar `outline-style !== 'none'` no CSS computado (o que não
// prova que o anel É VISÍVEL — podia ter 1px de contraste quase nulo), mede o
// recorte do alvo FOCADO contra DESFOCADO (mesmo scroll) e exige contraste
// >= 3:1 em pelo menos 60% de cada um dos 4 lados — e confere que PRESSIONAR
// COM O MOUSE não desenha o mesmo anel (o anel é de teclado, não de toque).
//
// Diferença para o harness original da Íris: aqui não há testid por tela nem
// fluxo de identidade (login/cadastro reais) — o Tab anda sobre a página já
// carregada pela sonda (`run-sondas.mjs`), então os alvos achados são só os
// que aparecem na tela naquele estado. Isso cobre menos telas que o ring6.mjs
// original (que também varria telas logadas), mas é genérico: funciona em
// qualquer tela sem configurar seletor nenhum.

import { recortarElemento, coberturaPorLado, menorLado } from './anel-utils.mjs';

const MAX_PASSOS = 30;
const COBERTURA_MINIMA = 0.6; // §14.1 G-22 pede "anel visível"; 60% de cada lado com contraste >=3:1 é o limiar que a Íris mediu e calibrou na passada 6
const COBERTURA_MAXIMA_MOUSE = 0.5; // acima disto em algum lado = o mouse também acendeu o anel (não devia)

async function infoDoFoco(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const r = el.getBoundingClientRect();

    function cssPath(node) {
      const partes = [];
      let n = node;
      while (n && n !== document.body && partes.length < 6) {
        let s = n.tagName.toLowerCase();
        if (n.id) s += `#${n.id}`;
        partes.unshift(s);
        n = n.parentElement;
      }
      return partes.join(' > ');
    }

    // o anel às vezes é desenhado no "wrapper" com borda (campo de texto), não no
    // próprio <input> — sobe até 5 níveis procurando o primeiro ancestral com borda.
    let host = el;
    for (let i = 0; i < 5 && host; i += 1, host = host.parentElement) {
      if (parseFloat(getComputedStyle(host).borderTopWidth) > 0) break;
    }
    if (!host) host = el;
    const rh = host.getBoundingClientRect();

    return {
      seletor: cssPath(el),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      hostRect: { x: rh.x, y: rh.y, width: rh.width, height: rh.height },
    };
  });
}

export async function sondaFoco(page) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);

  const alvos = [];
  const vistos = new Set();

  for (let passo = 0; passo < MAX_PASSOS; passo++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(90);
    const info = await infoDoFoco(page);
    if (!info) break;

    const chave = `${info.seletor}@${Math.round(info.rect.x)},${Math.round(info.rect.y)}`;
    if (vistos.has(chave)) break; // deu a volta: parou de achar alvo novo
    vistos.add(chave);
    if (info.rect.width < 4 || info.rect.height < 4) continue;

    const host = info.hostRect;
    const focado = await recortarElemento(page, host);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForTimeout(200);
    const desfocado = await recortarElemento(page, host);

    // devolve o foco (por coordenada) para o próximo Tab continuar dali
    await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        (el?.closest?.('[tabindex],button,a,input,textarea,[role=button],[role=link],[role=checkbox],[role=tab]') ?? el)?.focus?.();
      },
      { x: info.rect.x + info.rect.width / 2, y: info.rect.y + info.rect.height / 2 },
    );
    await page.waitForTimeout(60);

    if (!focado || !desfocado) {
      alvos.push({ seletor: info.seletor, rect: info.rect, temIndicadorVisivel: null, erro: 'fora da área visível' });
      continue;
    }

    const cobertura = coberturaPorLado(desfocado, focado, host);
    const temIndicadorVisivel = menorLado(cobertura) >= COBERTURA_MINIMA;

    // controle de mouse: pressionar sem soltar não pode desenhar o mesmo anel.
    // Achado real (22/11/2026): em pelo menos um botão (RN Web `Pressable`), o
    // `mouse.down()` sozinho já disparou a ação (navegação), sem esperar o
    // `mouse.up()` — provavelmente a resposta ao toque do próprio app ouvindo
    // `pointerdown`, não `click`. Sem a guarda abaixo, isso trocava a tela por
    // baixo do Tab-walk e o restante da varredura virava lixo (achava só 1 alvo
    // em vez de 4+). A guarda detecta a navegação pela URL e volta para onde
    // estava antes de continuar — não investiga a causa, só garante que o loop
    // de Tab não continua sobre uma página diferente da que começou.
    const urlAntesDoMouse = page.url();
    let coberturaMouse = null;
    let mouseAcendeAnel = null;
    try {
      const cx = host.x + host.width / 2;
      const cy = host.y + host.height / 2;
      const vp = page.viewportSize();
      if (cx > 0 && cy > 0 && cx < vp.width && cy < vp.height) {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.waitForTimeout(200);
        if (page.url() === urlAntesDoMouse) {
          const comMouse = await recortarElemento(page, host);
          if (comMouse) {
            coberturaMouse = coberturaPorLado(desfocado, comMouse, host);
            mouseAcendeAnel = menorLado(coberturaMouse) >= COBERTURA_MAXIMA_MOUSE;
          }
        }
        await page.mouse.move(1, 1);
        await page.mouse.up();
        await page.waitForTimeout(100);
      }
    } catch {
      // alvo fora da janela ou não clicável no ponto central: ignora o controle de mouse para este alvo
    }

    if (page.url() !== urlAntesDoMouse) {
      // o próprio mousedown/mouseup ativou o alvo (navegou): volta para onde
      // estava e segue o Tab-walk dali, em vez de continuar numa tela diferente.
      await page.goto(urlAntesDoMouse, { waitUntil: 'load' }).catch(() => {});
      await page.waitForFunction(() => document.body.innerText.trim().length > 10, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(150);
    }

    alvos.push({
      seletor: info.seletor,
      rect: info.rect,
      cobertura,
      temIndicadorVisivel,
      mouseAcendeAnel,
    });
  }

  const semIndicador = alvos.filter((a) => a.temIndicadorVisivel === false);
  const aneisDeMouse = alvos.filter((a) => a.mouseAcendeAnel === true);

  // indício de ordem (não veredito — colunas lado a lado também "voltam" no y e são válidas)
  const avisoOrdem = [];
  for (let i = 1; i < alvos.length; i++) {
    if (alvos[i].rect.y < alvos[i - 1].rect.y - 8) {
      avisoOrdem.push({ de: alvos[i - 1].seletor, para: alvos[i].seletor });
    }
  }

  return { alvos, semIndicador, aneisDeMouse, avisoOrdem };
}
