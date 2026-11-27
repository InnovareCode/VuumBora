/**
 * Importar ANTES de `./setup.js` (que carrega `src/env.ts`): limites das rotas do motorista para o teste delas.
 * Teto por conta de pedidos de URL BAIXO (o teste do 429 o atinge em poucas chamadas) e cota por rota ALTA (a suíte
 * chama a mesma rota dezenas de vezes do mesmo processo). Cada arquivo de teste roda no próprio processo: isto não vaza.
 */
process.env['DRIVER_UPLOAD_URLS_PER_HOUR'] = '12';
process.env['DRIVER_ROUTES_RATE_LIMIT_MAX'] = '100000';
