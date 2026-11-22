// Sonda de contraste (§14.3, G-20): cor do texto contra o fundo efetivo composto.
//
// Correção (22/11/2026, achado da Lyra): `fundoEfetivo` antes parava no PRIMEIRO
// ancestral com `backgroundColor` de alpha > 0 e usava o RGB dele puro, como se
// fosse sólido — falso positivo em qualquer elemento "tingido" do design system
// (`InlineAlert`, `StatusBadge`, que pintam `rgba(cor, 0.1)` por cima do fundo real
// da página). Agora soma os alphas subindo a árvore (Porter-Duff "over", camada mais
// perto do texto por cima das mais distantes) até achar um fundo OPACO ou até
// esgotar os ancestrais — nesse caso, assume branco (padrão do canvas do navegador)
// como última camada. Medido: o "i" do `InlineAlert` info (texto `rgb(110,168,255)`
// sobre `rgba(102,118,142,0.1)` por cima de `rgb(19,29,45)`) ia de 1,92:1 (RGB cru
// da camada translúcida, falso positivo de reprovação) para ~7:1 (composto, bate
// com o pixel real medido pela Lyra via screenshot+pngjs).
//
// Limitação que continua: quando uma camada antes de achar opacidade tem
// `background-image` (gradiente/imagem), a sonda marca "fundo não sólido" — medir
// contraste sobre gradiente de verdade pede amostrar o pixel renderizado (trabalho
// de screenshot, não de CSS computado), que fica para uma rodada futura (ver
// docs/qualidade-tela.md). Uma camada OPACA mais perto do texto resolve antes disso
// (o que está atrás dela, imagem ou não, não pinta mais nada).

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

    // Porter-Duff "over": `topo` pintado por cima de `fundo` (ambos podem ser
    // translúcidos — é por isso que dá pra empilhar várias camadas translúcidas
    // antes de chegar numa opaca).
    function compor(topo, fundo) {
      const alphaFinal = topo.a + fundo.a * (1 - topo.a);
      if (alphaFinal <= 0) return { r: 0, g: 0, b: 0, a: 0 };
      const canal = (t, f) => (t * topo.a + f * fundo.a * (1 - topo.a)) / alphaFinal;
      return { r: canal(topo.r, fundo.r), g: canal(topo.g, fundo.g), b: canal(topo.b, fundo.b), a: alphaFinal };
    }

    function fundoEfetivo(el) {
      let node = el;
      let acumulado = null; // composto das camadas já vistas (da mais perto do texto pra fora), null = nenhuma ainda
      while (node) {
        const cs = getComputedStyle(node);
        const temImagem = cs.backgroundImage && cs.backgroundImage !== 'none';
        if (temImagem) return { tipo: 'imagem-ou-gradiente' };
        const bg = parseRgb(cs.backgroundColor);
        if (bg && bg.a > 0) {
          acumulado = acumulado ? compor(acumulado, bg) : bg;
          if (acumulado.a >= 0.999) return { tipo: 'solido', cor: acumulado };
        }
        node = node.parentElement;
      }
      // Esgotou os ancestrais sem achar opacidade total: a última camada é o
      // canvas do navegador, branco por padrão. Compõe o que sobrou (se houver)
      // por cima disso.
      const branco = { r: 255, g: 255, b: 255, a: 1 };
      return { tipo: 'solido', cor: acumulado ? compor(acumulado, branco) : branco };
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
