// Ativação de link por teclado (§14.1 G-22, parte "Enter e Espaço ativam" — refinada
// aqui para `role="link"`: um link nativo (`<a>`) ativa por Enter e NÃO por Espaço;
// só botões ativam pelos dois. Adaptação do `q4.mjs` que a Íris deixou na passada 6
// (ver docs/qualidade-tela.md). Cobre todo `[role="link"]` visível na tela: Enter
// ativa; Espaço e Alt+Enter não ativam; segurar Enter (auto-repeat) não empilha
// mais de uma entrada no histórico; e o controle — o mesmo link por CLIQUE de
// mouse tem que ativar, senão "Espaço não ativa" não prova nada (podia ser um link
// morto).
//
// Como cada tecla começa do mesmo ponto de partida:
//   1. Barato primeiro: roda a tecla na página recebida e desfaz com `page.goBack()`.
//   2. Se depois disso a página NÃO voltou ao ponto de partida (outra URL, ou o link
//      sumiu), ela está gasta: a tecla seguinte roda numa página NOVA, aberta pelo
//      `reabrir()` que o chamador passa (mesma tela, mesmo estado, mesmo tamanho, mesmo
//      corte de rede); essa página nova segue como base enquanto voltar ao ponto de
//      partida, e é trocada por outra sempre que uma tecla a gastar.
//      Achado da Íris, onda 4: em P07b ("Voltar ao início") e P10 ("Agora não") o link
//      faz `router.replace` — o goBack não volta à tela, as teclas seguintes rodavam
//      sobre a tela de destino e TODOS os links saíam como `controleInvalido`, falso.
//   Sem `reabrir`, as teclas que sobrarem ficam `null` (não medidas) e o link vai para
//   `controleInvalido` — nunca contam como aprovadas por omissão.

async function estadoDaPagina(page) {
  return page.evaluate(() => ({
    path: location.pathname,
    href: location.pathname + location.search,
    hist: history.length,
    textoLen: document.body.innerText.length,
  }));
}

function mudou(a, b) {
  return a.href !== b.href || a.hist !== b.hist || a.textoLen !== b.textoLen;
}

/** Links visíveis, identificados por texto + ocorrência (a n-ésima com o mesmo texto) —
 * não por índice, que muda se a página reaberta tiver um link a mais ou a menos. */
async function listarLinks(page) {
  return page.evaluate(() => {
    function cssPath(el) {
      const partes = [];
      let n = el;
      while (n && n !== document.body && partes.length < 6) {
        let s = n.tagName.toLowerCase();
        if (n.id) s += `#${n.id}`;
        partes.unshift(s);
        n = n.parentElement;
      }
      return partes.join(' > ');
    }
    const vistos = new Map();
    return Array.from(document.querySelectorAll('[role="link"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      })
      .map((el) => {
        const texto = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        const ocorrencia = vistos.get(texto) ?? 0;
        vistos.set(texto, ocorrencia + 1);
        return { seletor: cssPath(el), texto, ocorrencia };
      });
  });
}

/** ElementHandle do link `{texto, ocorrencia}` na página, ou null se ele não está lá. */
async function acharLink(page, alvo) {
  const handle = await page.evaluateHandle(({ texto, ocorrencia }) => {
    const mesmos = Array.from(document.querySelectorAll('[role="link"]')).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== 'hidden' &&
        (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) === texto
      );
    });
    return mesmos[ocorrencia] ?? null;
  }, alvo);
  const el = handle.asElement();
  if (!el) await handle.dispose();
  return el;
}

/** Foca o link. `null` = o link não está na página (não dá para medir); `false` = está,
 * mas não aceita foco (falha real de teclado); `true` = focado. */
async function focar(page, alvo) {
  const el = await acharLink(page, alvo);
  if (!el) return null;
  try {
    return await el.evaluate((e) => {
      e.scrollIntoView({ block: 'center' });
      e.focus();
      return document.activeElement === e;
    });
  } finally {
    await el.dispose();
  }
}

async function centro(page, alvo) {
  const el = await acharLink(page, alvo);
  if (!el) return null;
  try {
    return await el.evaluate((e) => {
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  } finally {
    await el.dispose();
  }
}

// Cada passo recebe uma página no ponto de partida e devolve true/false, ou null quando
// não conseguiu medir (link ausente).
const PASSOS = [
  {
    // 1) Enter ativa. Link presente mas sem foco = Enter não alcança = falha (false).
    chave: 'enterAtiva',
    async rodar(page, alvo) {
      const focado = await focar(page, alvo);
      if (focado === null) return null;
      const antes = await estadoDaPagina(page);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(350);
      const depois = await estadoDaPagina(page);
      return focado && mudou(antes, depois);
    },
  },
  {
    // 2) Espaço NÃO ativa
    chave: 'espacoNaoAtiva',
    async rodar(page, alvo) {
      if ((await focar(page, alvo)) === null) return null;
      const antes = await estadoDaPagina(page);
      await page.keyboard.press(' ');
      await page.waitForTimeout(250);
      return !mudou(antes, await estadoDaPagina(page));
    },
  },
  {
    // 3) Alt+Enter NÃO ativa (atalho do navegador, não do link)
    chave: 'altEnterNaoAtiva',
    async rodar(page, alvo) {
      if ((await focar(page, alvo)) === null) return null;
      const antes = await estadoDaPagina(page);
      await page.keyboard.press('Alt+Enter');
      await page.waitForTimeout(250);
      return !mudou(antes, await estadoDaPagina(page));
    },
  },
  {
    // 4) segurar Enter não empilha mais de 1 entrada de histórico
    chave: 'autoRepeatOk',
    async rodar(page, alvo) {
      if ((await focar(page, alvo)) === null) return null;
      const antes = await estadoDaPagina(page);
      await page.keyboard.down('Enter');
      for (let k = 0; k < 5; k++) {
        await page.keyboard.down('Enter');
        await page.waitForTimeout(30);
      }
      await page.keyboard.up('Enter');
      await page.waitForTimeout(350);
      const depois = await estadoDaPagina(page);
      return depois.hist - antes.hist <= 1;
    },
  },
  {
    // 5) controle: o clique de mouse tem que ativar (senão os testes acima não provam nada)
    chave: 'cliqueAtiva',
    async rodar(page, alvo) {
      const c = await centro(page, alvo);
      if (!c) return null;
      const antes = await estadoDaPagina(page);
      await page.mouse.click(c.x, c.y);
      await page.waitForTimeout(350);
      return mudou(antes, await estadoDaPagina(page));
    },
  },
];

/** Desfaz a navegação (se houve) e diz se a página voltou MESMO ao ponto de partida:
 * mesma URL (caminho + query) e o link ainda lá. `router.replace` falha aqui. */
async function voltarAoPontoDePartida(page, partida, alvo) {
  let agora = await estadoDaPagina(page);
  if (agora.href !== partida.href) {
    await page.goBack({ waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(250);
    agora = await estadoDaPagina(page);
  }
  if (agora.href !== partida.href) return false;
  const el = await acharLink(page, alvo);
  if (!el) return false;
  await el.dispose();
  return true;
}

/**
 * @param {import('playwright').Page} page página já no ponto de partida
 * @param {{ reabrir?: () => Promise<{page: import('playwright').Page, fechar: () => Promise<void>}> }} [opts]
 */
export async function sondaAtivacaoDeLinks(page, { reabrir = null } = {}) {
  const links = await listarLinks(page);
  const partida = await estadoDaPagina(page);
  let reaberturas = 0;
  const resultados = [];

  // A "base" é a página onde o próximo passo roda: começa na recebida e continua nela
  // enquanto ela voltar ao ponto de partida. Quando um passo a gasta (navegação sem
  // volta), ela sai de cena e o passo SEGUINTE abre uma página nova, que vira a base —
  // tecla depois de navegação sem volta sempre roda em página nova, mas teclas que não
  // navegam (Espaço, Alt+Enter) dividem a mesma página nova, já conferida, em vez de
  // pagar uma reabertura cada (~5-8 s com bootstrap de sessão).
  let base = { page, fechar: null, nova: false };

  // Roda um passo e devolve { valor, emPaginaNova }.
  async function rodarPasso(passo, alvo) {
    if (!base) {
      if (!reabrir) return { valor: null, emPaginaNova: false };
      const nova = await reabrir();
      reaberturas++;
      // A página nova tem que abrir no MESMO ponto de partida; se não abrir, não mede.
      const estado = await estadoDaPagina(nova.page);
      if (estado.href !== partida.href) {
        await nova.fechar();
        return { valor: null, emPaginaNova: true };
      }
      base = { page: nova.page, fechar: nova.fechar, nova: true };
    }
    const atual = base;
    const valor = await passo.rodar(atual.page, alvo);
    if (!(await voltarAoPontoDePartida(atual.page, partida, alvo))) {
      if (atual.fechar) await atual.fechar(); // a recebida quem fecha é o chamador
      base = null;
    }
    return { valor, emPaginaNova: atual.nova };
  }

  try {
    for (const link of links) {
      const alvo = { texto: link.texto, ocorrencia: link.ocorrencia };
      const linha = { seletor: link.seletor, texto: link.texto };
      const passosEmPaginaNova = [];
      for (const passo of PASSOS) {
        const { valor, emPaginaNova } = await rodarPasso(passo, alvo);
        linha[passo.chave] = valor;
        if (emPaginaNova) passosEmPaginaNova.push(passo.chave);
      }
      const todosMedidos = PASSOS.every((p) => linha[p.chave] !== null);
      resultados.push({
        ...linha,
        // quais teclas rodaram em página reaberta (depois de uma navegação sem volta)
        passosEmPaginaNova,
        // se o clique não ativa, ou alguma tecla não pôde ser medida (link ausente, página
        // que não voltou e sem `reabrir`), o controle não vale e o resto não prova nada.
        controleValido: linha.cliqueAtiva === true && todosMedidos,
      });
    }
  } finally {
    // a página reaberta que ainda era base é desta sonda; a recebida é do chamador
    if (base?.fechar) await base.fechar();
  }

  return {
    links: resultados,
    reaberturas,
    falhas: resultados.filter(
      (r) => r.controleValido && (!r.enterAtiva || !r.espacoNaoAtiva || !r.altEnterNaoAtiva || !r.autoRepeatOk),
    ),
    controleInvalido: resultados.filter((r) => !r.controleValido),
  };
}
