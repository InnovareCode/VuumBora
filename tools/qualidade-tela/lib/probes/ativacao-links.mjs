// Ativação de link por teclado (§14.1 G-22, parte "Enter e Espaço ativam" — refinada
// aqui para `role="link"`: um link nativo (`<a>`) ativa por Enter e NÃO por Espaço;
// só botões ativam pelos dois. Adaptação do `q4.mjs` que a Íris deixou na passada 6
// (ver docs/qualidade-tela.md). Cobre todo `[role="link"]` visível na tela: Enter
// ativa; Espaço e Alt+Enter não ativam; segurar Enter (auto-repeat) não empilha
// mais de uma entrada no histórico; e o controle — o mesmo link por CLIQUE de
// mouse tem que ativar, senão "Espaço não ativa" não prova nada (podia ser um link
// morto).
//
// Diferença para o original: sem fluxo de identidade nem testid por app — descobre
// os links pelo DOM (`[role="link"]` visível) e usa `page.goBack()` para desfazer
// a navegação entre uma tecla e outra, em vez de abrir uma página nova por tecla.

async function estadoDaPagina(page) {
  return page.evaluate(() => ({
    path: location.pathname,
    hist: history.length,
    textoLen: document.body.innerText.length,
  }));
}

function mudou(a, b) {
  return a.path !== b.path || a.hist !== b.hist || a.textoLen !== b.textoLen;
}

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
    return Array.from(document.querySelectorAll('[role="link"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      })
      .map((el, i) => ({
        indice: i,
        seletor: cssPath(el),
        texto: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      }));
  });
}

async function focarPorIndice(page, indice) {
  return page.evaluate((i) => {
    const el = Array.from(document.querySelectorAll('[role="link"]')).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })[i];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    return document.activeElement === el;
  }, indice);
}

async function centroPorIndice(page, indice) {
  return page.evaluate((i) => {
    const el = Array.from(document.querySelectorAll('[role="link"]')).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, indice);
}

async function desfazerSeNavegou(page, antes) {
  const depois = await estadoDaPagina(page);
  if (depois.path !== antes.path) {
    await page.goBack({ waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

export async function sondaAtivacaoDeLinks(page) {
  const links = await listarLinks(page);
  const resultados = [];

  for (const link of links) {
    // 1) Enter ativa
    const focadoEnter = await focarPorIndice(page, link.indice);
    const antesEnter = await estadoDaPagina(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    const depoisEnter = await estadoDaPagina(page);
    const enterAtiva = focadoEnter && mudou(antesEnter, depoisEnter);
    await desfazerSeNavegou(page, antesEnter);

    // 2) Espaço NÃO ativa
    await focarPorIndice(page, link.indice);
    const antesEspaco = await estadoDaPagina(page);
    await page.keyboard.press(' ');
    await page.waitForTimeout(250);
    const depoisEspaco = await estadoDaPagina(page);
    const espacoNaoAtiva = !mudou(antesEspaco, depoisEspaco);
    await desfazerSeNavegou(page, antesEspaco);

    // 3) Alt+Enter NÃO ativa (atalho do navegador, não do link)
    await focarPorIndice(page, link.indice);
    const antesAlt = await estadoDaPagina(page);
    await page.keyboard.press('Alt+Enter');
    await page.waitForTimeout(250);
    const depoisAlt = await estadoDaPagina(page);
    const altEnterNaoAtiva = !mudou(antesAlt, depoisAlt);
    await desfazerSeNavegou(page, antesAlt);

    // 4) segurar Enter não empilha mais de 1 entrada de histórico
    await focarPorIndice(page, link.indice);
    const antesRepeticao = await estadoDaPagina(page);
    await page.keyboard.down('Enter');
    for (let k = 0; k < 5; k++) {
      await page.keyboard.down('Enter');
      await page.waitForTimeout(30);
    }
    await page.keyboard.up('Enter');
    await page.waitForTimeout(350);
    const depoisRepeticao = await estadoDaPagina(page);
    const autoRepeatOk = depoisRepeticao.hist - antesRepeticao.hist <= 1;
    await desfazerSeNavegou(page, antesRepeticao);

    // 5) controle: o clique de mouse tem que ativar (senão os testes acima não provam nada)
    const centro = await centroPorIndice(page, link.indice);
    let cliqueAtiva = null;
    if (centro) {
      const antesClique = await estadoDaPagina(page);
      await page.mouse.click(centro.x, centro.y);
      await page.waitForTimeout(350);
      const depoisClique = await estadoDaPagina(page);
      cliqueAtiva = mudou(antesClique, depoisClique);
      await desfazerSeNavegou(page, antesClique);
    }

    resultados.push({
      seletor: link.seletor,
      texto: link.texto,
      enterAtiva,
      espacoNaoAtiva,
      altEnterNaoAtiva,
      autoRepeatOk,
      cliqueAtiva,
      // se o clique não ativa (ou o link sumiu da tela entre um passo e outro), o
      // controle não é válido e os resultados acima não provam nada sozinhos.
      controleValido: cliqueAtiva === true,
    });
  }

  return {
    links: resultados,
    falhas: resultados.filter(
      (r) => r.controleValido && (!r.enterAtiva || !r.espacoNaoAtiva || !r.altEnterNaoAtiva || !r.autoRepeatOk),
    ),
    controleInvalido: resultados.filter((r) => !r.controleValido),
  };
}
