// Sonda de texto (§14.3, G-10): truncamento horizontal e vertical de cada nó de
// texto (`scrollWidth > clientWidth` ou `scrollHeight > clientHeight`). Sem lista
// de exceção (endereço com 2 linhas): esta rodada cobre só telas de entrada/conta,
// que não têm esse caso — quem usar a sonda numa tela com exceção decide à mão.

export async function sondaTexto(page) {
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

    const truncados = [];
    const elementos = Array.from(document.querySelectorAll('body *'));
    for (const el of elementos) {
      const temTextoDireto = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0,
      );
      if (!temTextoDireto) continue;
      const horizontal = el.scrollWidth > el.clientWidth + 1;
      const vertical = el.scrollHeight > el.clientHeight + 1;
      if (horizontal || vertical) {
        truncados.push({
          seletor: cssPath(el),
          texto: el.textContent.trim().slice(0, 80),
          horizontal,
          vertical,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        });
      }
    }
    return { truncados };
  });
}
