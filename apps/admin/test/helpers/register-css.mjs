// `node --import ./test/helpers/register-css.mjs`: os componentes importam `*.module.css` (o Vite resolve no
// app). No `node --test` o import de CSS vira um objeto cujo `styles['x']` devolve `'x'` — basta para
// renderizar; aparência se mede no navegador. Imagem (`import logo from './x.png'`, ex.: a logomarca) vira o
// nome do arquivo, no lugar da URL que o Vite devolveria.
import * as nodeModule from 'node:module';

const CSS_STUB = 'export default new Proxy({}, { get: (_, key) => (typeof key === "string" ? key : undefined) });';
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

function stubFor(url) {
  if (url.endsWith('.css')) return CSS_STUB;
  if (IMAGE_EXTENSIONS.some((ext) => url.endsWith(ext))) return `export default ${JSON.stringify(url.slice(url.lastIndexOf('/') + 1))};`;
  return null;
}

if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    load(url, context, nextLoad) {
      const source = stubFor(url);
      if (source !== null) return { format: 'module', shortCircuit: true, source };
      return nextLoad(url, context);
    },
  });
} else {
  // Node sem `registerHooks` (anterior a 22.15): a versão assíncrona, com o mesmo `stubFor` serializado.
  nodeModule.register(
    'data:text/javascript,' +
      encodeURIComponent(
        `const CSS_STUB = ${JSON.stringify(CSS_STUB)}; const IMAGE_EXTENSIONS = ${JSON.stringify(IMAGE_EXTENSIONS)}; ${stubFor.toString()}` +
          ' export async function load(url, context, nextLoad) { const source = stubFor(url); if (source !== null) return { format: "module", shortCircuit: true, source }; return nextLoad(url, context); }',
      ),
  );
}
