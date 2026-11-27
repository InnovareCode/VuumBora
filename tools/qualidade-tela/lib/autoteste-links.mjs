// Controle negativo da sonda de ativação de links (probes/ativacao-links.mjs), no mesmo
// espírito do autoteste do comparador: prova que a sonda REPROVA o que tem que reprovar,
// em vez de só ficar verde. Não precisa do Metro nem dos apps — serve uma página falsa
// por `page.route` com três links:
//   1. "replace": ativa por Enter/clique e some do histórico (como `router.replace`, o
//      caso da P07b/P10, achado da Íris na onda 4) -> tem que sair VÁLIDO e sem falha,
//      com as teclas depois do Enter rodando em página reaberta;
//   2. "ativa com espaço": ativa por Enter E por Espaço/Alt+Enter -> tem que sair em `falhas`;
//   3. "morto": nada o ativa -> tem que sair em `controleInvalido`.
// E, sem `reabrir`, o link "replace" não pode ser aprovado por omissão: tem que sair em
// `controleInvalido` com as teclas restantes `null`.

import { getChromium } from './browsers.mjs';
import { sondaAtivacaoDeLinks } from './probes/ativacao-links.mjs';

const ORIGEM = 'http://autoteste-links.local';

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app">
<h1>Tela de controle</h1>
<a role="link" id="replace" href="/inicio">Voltar ao inicio</a>
<div role="link" id="ruim" tabindex="0">Ativa com espaco</div>
<span role="link" id="morto" tabindex="0">Link morto</span>
</div><script>
document.getElementById('replace').addEventListener('click', (e) => {
  e.preventDefault();
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  history.replaceState({}, '', '/inicio');
  document.getElementById('app').innerHTML = '<h1>Inicio (estado zerado)</h1>';
});
const ruim = document.getElementById('ruim');
const ativa = () => { ruim.textContent += ' *'; };
ruim.addEventListener('click', ativa);
ruim.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ativa(); } });
</script></body></html>`;

export async function autotesteLinks() {
  const browser = await getChromium().launch({ headless: true });
  const abrir = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route(`${ORIGEM}/**`, (r) =>
      r.fulfill({ body: r.request().url().includes('/tela') ? HTML : 'outra pagina', contentType: 'text/html; charset=utf-8' }),
    );
    await page.goto(`${ORIGEM}/tela?devPhase=failed`);
    return { page, fechar: () => context.close() };
  };

  const erros = [];
  try {
    const comReabrir = await abrir();
    const r = await sondaAtivacaoDeLinks(comReabrir.page, { reabrir: abrir });
    await comReabrir.fechar();
    const porTexto = (t) => r.links.find((l) => l.texto === t);
    const replace = porTexto('Voltar ao inicio');
    if (!replace?.controleValido || r.falhas.some((l) => l.texto === replace.texto)) {
      erros.push(`link "replace" deveria sair válido e sem falha: ${JSON.stringify(replace)}`);
    }
    if (!replace?.passosEmPaginaNova?.length) erros.push('link "replace" deveria ter usado página reaberta depois do Enter');
    if (!r.falhas.some((l) => l.texto === 'Ativa com espaco')) erros.push('link que ativa por Espaço deveria estar em "falhas"');
    if (!r.controleInvalido.some((l) => l.texto === 'Link morto')) erros.push('link morto deveria estar em "controleInvalido"');

    const semReabrir = await abrir();
    const r2 = await sondaAtivacaoDeLinks(semReabrir.page);
    await semReabrir.fechar();
    const replace2 = r2.links.find((l) => l.texto === 'Voltar ao inicio');
    if (replace2?.controleValido !== false || replace2?.espacoNaoAtiva !== null) {
      erros.push(`sem reabrir, o link "replace" não pode ser aprovado por omissão: ${JSON.stringify(replace2)}`);
    }
    console.log(
      `[autoteste-links] com reabrir: ${r.reaberturas} reaberturas, falhas=[${r.falhas.map((l) => l.texto)}], ` +
        `controleInvalido=[${r.controleInvalido.map((l) => l.texto)}]; sem reabrir: controleInvalido=[${r2.controleInvalido.map((l) => l.texto)}]`,
    );
  } finally {
    await browser.close();
  }

  if (erros.length) {
    for (const e of erros) console.error(`[autoteste-links] FALHOU: ${e}`);
    return false;
  }
  console.log('[autoteste-links] OK: a sonda de links aprova o link com router.replace e reprova o que ativa por Espaço e o link morto.');
  return true;
}
