// Sonda de contraste (§14.3, G-20): cor do texto contra o fundo efetivo composto.
// Limitação sabida: quando o fundo é imagem/gradiente (não uma cor sólida), a sonda
// marca "fundo não sólido" em vez de calcular — medir contraste sobre gradiente
// pede amostrar o pixel renderizado (um trabalho de screenshot, não de CSS
// computado), que fica para uma rodada futura (ver docs/qualidade-tela.md).

export async function sondaContraste(page) {
  return page.evaluate(() => {
    function cssPath(el) {
      if (!el || el === document.body) return 'body';
      const partes = [];
      let node = el;
      while (node && node !== document.body && partes.length < 6) {
        let seletor = node.tagName.toLowerCase();
        if (node.id) seletor += `#${node.id}`;
        partes.unshift(seletor);
        node = node.parentElement;
      }
      return partes.join(' > ');
    }

    function parseRgb(css) {
      const m = css && css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
    }

    function luminanciaRelativa({ r, g, b }) {
      const canal = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    }

    function contraste(a, b) {
      const la = luminanciaRelativa(a);
      const lb = luminanciaRelativa(b);
      const [maior, menor] = la > lb ? [la, lb] : [lb, la];
      return (maior + 0.05) / (menor + 0.05);
    }

    function fundoEfetivo(el) {
      let node = el;
      while (node) {
        const cs = getComputedStyle(node);
        const bg = parseRgb(cs.backgroundColor);
        const temImagem = cs.backgroundImage && cs.backgroundImage !== 'none';
        if (temImagem) return { tipo: 'imagem-ou-gradiente' };
        if (bg && bg.a > 0) return { tipo: 'solido', cor: bg };
        node = node.parentElement;
      }
      return { tipo: 'desconhecido' };
    }

    const resultados = [];
    const elementos = Array.from(document.querySelectorAll('body *'));
    for (const el of elementos) {
      const temTextoDireto = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0,
      );
      if (!temTextoDireto) continue;
      const cs = getComputedStyle(el);
      const cor = parseRgb(cs.color);
      if (!cor) continue;
      const fundo = fundoEfetivo(el);
      const fontSize = parseFloat(cs.fontSize);
      const negrito = Number(cs.fontWeight) >= 700 || cs.fontWeight === 'bold';
      const textoGrande = fontSize >= 24 || (negrito && fontSize >= 18.66);
      const limiar = textoGrande ? 3 : 4.5;

      if (fundo.tipo !== 'solido') {
        resultados.push({ seletor: cssPath(el), fundo: fundo.tipo, medido: false });
        continue;
      }
      const razao = contraste(cor, fundo.cor);
      resultados.push({
        seletor: cssPath(el),
        texto: el.textContent.trim().slice(0, 60),
        razao: Math.round(razao * 100) / 100,
        limiar,
        passa: razao >= limiar,
        medido: true,
      });
    }

    return {
      reprovados: resultados.filter((r) => r.medido && !r.passa),
      naoMedidos: resultados.filter((r) => !r.medido),
      total: resultados.length,
    };
  });
}
