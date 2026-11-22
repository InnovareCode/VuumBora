// Sonda de geometria (§14.3): retângulo de cada elemento contra a viewport e
// contra os irmãos; alvo de toque. Cobre G-09, G-12, G-21 por completo; G-11 e
// G-13 ficam como indício (ver `ctaInicial`), não veredito — exigem saber qual
// elemento É o CTA principal da tela, que é uma regra por ficha, não genérica.

export async function sondaGeometria(page) {
  return page.evaluate(() => {
    function cssPath(el) {
      if (!el || el === document.body) return 'body';
      const partes = [];
      let node = el;
      while (node && node !== document.body && partes.length < 6) {
        let seletor = node.tagName.toLowerCase();
        if (node.id) seletor += `#${node.id}`;
        else if (typeof node.className === 'string' && node.className.trim()) {
          seletor += '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.');
        }
        partes.unshift(seletor);
        node = node.parentElement;
      }
      return partes.join(' > ');
    }

    function rectOf(r) {
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }

    function visivel(el) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const todos = Array.from(document.querySelectorAll('body *')).filter(visivel);

    // G-09: nada ultrapassa a viewport horizontalmente (vertical é normal: RN Web rola).
    const ultrapassaViewport = [];
    for (const el of todos) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        ultrapassaViewport.push({ seletor: cssPath(el), rect: rectOf(r) });
      }
    }

    // G-21: alvo tocável >= 44x44.
    const tocaveis = todos.filter((el) => {
      const role = el.getAttribute('role');
      return role === 'button' || role === 'link' || el.tagName === 'BUTTON' || el.tagName === 'A' || el.hasAttribute('tabindex');
    });
    const alvosPequenos = [];
    for (const el of tocaveis) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) alvosPequenos.push({ seletor: cssPath(el), rect: rectOf(r) });
    }

    // G-12: interseção entre irmãos tocáveis (mesmo pai) — overlap não intencional.
    const porPai = new Map();
    for (const el of tocaveis) {
      const pai = el.parentElement;
      if (!pai) continue;
      if (!porPai.has(pai)) porPai.set(pai, []);
      porPai.get(pai).push(el);
    }
    const sobreposicoes = [];
    for (const filhos of porPai.values()) {
      for (let i = 0; i < filhos.length; i++) {
        for (let j = i + 1; j < filhos.length; j++) {
          const a = filhos[i].getBoundingClientRect();
          const b = filhos[j].getBoundingClientRect();
          const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (ix > 1 && iy > 1) {
            sobreposicoes.push({ a: cssPath(filhos[i]), b: cssPath(filhos[j]), area: Math.round(ix * iy) });
          }
        }
      }
    }

    // G-11 (indício): o botão/link mais "principal" (primeiro <button> ou role=button
    // visível, maior área) está dentro da viewport sem rolar?
    let ctaInicial = null;
    const botoes = todos.filter((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button');
    if (botoes.length > 0) {
      const maior = botoes.reduce((acc, el) => {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        return area > acc.area ? { el, area } : acc;
      }, { el: botoes[0], area: 0 });
      const r = maior.el.getBoundingClientRect();
      ctaInicial = { seletor: cssPath(maior.el), rect: rectOf(r), visivelSemRolar: r.top >= 0 && r.bottom <= vh };
    }

    return { viewport: { width: vw, height: vh }, ultrapassaViewport, alvosPequenos, sobreposicoes, ctaInicial };
  });
}
