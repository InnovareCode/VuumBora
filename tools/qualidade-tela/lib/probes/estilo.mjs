// Sonda de estilo (§14.3, G-02 a G-06). Esta é a mais parcial das cinco: a
// classificação "assinatura premium × caixa legada" de verdade exige saber, para
// cada caixa, qual token ela DEVERIA usar — e isso é regra de ficha, não algo que
// se lê do CSS computado. O que esta sonda faz:
//   - inventaria toda caixa visível com fundo (cor, borda de cima/baixo, sombra,
//     fonte) para revisão humana (não substitui o olho, como o próprio §14.3 diz);
//   - aplica só os dois achados objetivos que não pedem contexto de ficha:
//     G-03 (cor fora do conjunto de tokens) e G-04 (contagem de amarelo).
//   - heurística de "possível legado" (G-02): fundo sólido + borda igual nos
//     quatro lados → candidato a "legado"; é indício para a Íris/Apolo olharem,
//     não reprovação automática.

export async function sondaEstilo(page, coresDosTokens) {
  return page.evaluate((coresToken) => {
    const tokenSet = new Set(coresToken);

    function cssPath(el) {
      if (!el || el === document.body) return 'body';
      const partes = [];
      let node = el;
      while (node && node !== document.body && partes.length < 6) {
        let s = node.tagName.toLowerCase();
        if (node.id) s += `#${node.id}`;
        partes.unshift(s);
        node = node.parentElement;
      }
      return partes.join(' > ');
    }

    function parseRgb(css) {
      const m = css && css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1, chave: `${m[1]},${m[2]},${m[3]}` };
    }

    function amarelo({ r, g, b }) {
      // amarelo da marca é alto R e G, baixo B — faixa generosa de propósito (indício, não lei).
      return r > 180 && g > 140 && b < 120;
    }

    const inventario = [];
    const foraDoConjunto = [];
    let blocosAmarelos = 0;
    const possivelLegado = [];

    const elementos = Array.from(document.querySelectorAll('body *'));
    for (const el of elementos) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      const bg = parseRgb(cs.backgroundColor);
      const temFundo = bg && bg.a > 0;
      const temGradiente = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (!temFundo && !temGradiente) continue;

      const borderTop = parseRgb(cs.borderTopColor);
      const borderBottom = parseRgb(cs.borderBottomColor);
      const borderLeft = parseRgb(cs.borderLeftColor);
      const borderRight = parseRgb(cs.borderRightColor);
      const larguraBorda = parseFloat(cs.borderTopWidth) > 0;

      const item = {
        seletor: cssPath(el),
        backgroundColor: cs.backgroundColor,
        temGradiente: Boolean(temGradiente),
        borderTopColor: cs.borderTopColor,
        borderBottomColor: cs.borderBottomColor,
        boxShadow: cs.boxShadow !== 'none' ? cs.boxShadow : null,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
      };
      inventario.push(item);

      if (temFundo && !temGradiente && !tokenSet.has(bg.chave)) {
        foraDoConjunto.push({ seletor: item.seletor, cor: cs.backgroundColor });
      }
      if (temFundo && amarelo(bg)) blocosAmarelos++;

      if (
        temFundo &&
        !temGradiente &&
        larguraBorda &&
        borderTop &&
        borderBottom &&
        borderLeft &&
        borderRight &&
        borderTop.chave === borderBottom.chave &&
        borderTop.chave === borderLeft.chave &&
        borderTop.chave === borderRight.chave
      ) {
        possivelLegado.push(item.seletor);
      }
    }

    return {
      totalCaixasComFundo: inventario.length,
      foraDoConjuntoDeTokens: foraDoConjunto,
      contagemAmarelo: blocosAmarelos,
      possivelLegado,
      inventario,
    };
  }, Array.from(coresDosTokens));
}
