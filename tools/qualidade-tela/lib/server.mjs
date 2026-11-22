// Servidor estático mínimo para o `expo export --platform web`. Sem dependências:
// só `node:http` + `node:fs`. Faz fallback de SPA (qualquer rota que não seja um
// arquivo real devolve index.html) porque o export do expo-router é client-side
// routing — só existe um index.html, e a rota de verdade (`/login`, `/entrar`...) é
// lida pelo próprio React Router dentro do navegador a partir de `window.location`.

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

/** Sobe um servidor estático em `distDir` numa porta livre. Devolve { url, close() }. */
export function iniciarServidorEstatico(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(
      `Pasta de export não existe: ${distDir}\n` +
        `Rode "node cli.mjs exportar" primeiro (ou "npx expo export --platform web" dentro do app).`,
    );
  }

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(distDir, urlPath);

    let servePath = filePath;
    if (!existsSync(servePath) || statSync(servePath).isDirectory()) {
      servePath = path.join(distDir, 'index.html'); // fallback de SPA
    }

    const ext = path.extname(servePath).toLowerCase();
    res.setHeader('Content-Type', TIPOS[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); // nunca cachear durante captura: o bundle tem que ser o mesmo a cada rodada, não o cache antigo do navegador
    const stream = createReadStream(servePath);
    stream.on('error', () => {
      res.statusCode = 404;
      res.end('not found');
    });
    stream.pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
