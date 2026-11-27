// `node --import ./test/helpers/register-css.mjs`: os componentes importam `*.module.css` (o Vite resolve no
// app). No `node --test` o import de CSS vira um objeto cujo `styles['x']` devolve `'x'` — basta para
// renderizar; aparência se mede no navegador.
import * as nodeModule from 'node:module';

const CSS_STUB = 'export default new Proxy({}, { get: (_, key) => (typeof key === "string" ? key : undefined) });';

if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    load(url, context, nextLoad) {
      if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: CSS_STUB };
      return nextLoad(url, context);
    },
  });
} else {
  // Node sem `registerHooks` (anterior a 22.15): a versão assíncrona.
  nodeModule.register(
    'data:text/javascript,' +
      encodeURIComponent(
        `export async function load(url, context, nextLoad) { if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: ${JSON.stringify(CSS_STUB)} }; return nextLoad(url, context); }`,
      ),
  );
}
