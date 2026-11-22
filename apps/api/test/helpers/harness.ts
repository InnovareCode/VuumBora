/** Banco real + app real para os testes. Importar `./setup.js` ANTES deste arquivo. */
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { closePool, pool } from '../../src/db.js';
import { env } from '../../src/env.js';
import { prepararBanco } from '../../src/migrate.js';
import type { AdminRole } from '../../src/domain/admin.js';
import type { MailPort } from '../../src/lib/mail-port.js';
import { ensureBaseline } from './legal-kit.js';

export const PASSWORD = 'Senha-de-teste-123';
export { pool };

export async function prepareDatabase(): Promise<void> {
  // Banco de teste do zero até a 0013: prova que a cadeia de migrações aplica.
  await prepararBanco({ databaseUrl: env.DATABASE_URL, pool, log: () => undefined });
  // O cadastro exige versão publicada (0021, fail-closed): garante o catálogo baseline para os testes de identidade.
  await ensureBaseline(pool);
}


export async function shutdown(): Promise<void> {
  await closePool();
}

export async function createAdmin(role: AdminRole, label: string = role): Promise<{ id: string; email: string }> {
  const email = `${label}-${Math.random().toString(36).slice(2, 8)}@teste.vuumbora.dev`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`Admin ${label}`, email, hash, role],
  );
  return { id: result.rows[0]!.id, email };
}

export interface TestApp {
  readonly app: FastifyInstance;
  /** Tudo que o app logou até agora, como texto. */
  logs(): string;
}

export async function startApp(beforeReady?: (app: FastifyInstance) => void, options: { mail?: MailPort } = {}): Promise<TestApp> {
  let buffer = '';
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });
  const app = await buildApp({ logStream, ...(options.mail ? { mail: options.mail } : {}) });
  beforeReady?.(app);
  await app.ready();
  return { app, logs: () => buffer };
}

export interface Reply {
  readonly status: number;
  readonly body: any;
  readonly headers: Record<string, unknown>;
  /** Valor do cookie de sessão emitido, ou `null`. */
  readonly sessionCookie: string | null;
}

export async function send(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  options: { body?: unknown; cookie?: string; csrf?: string; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const response = await app.inject({
    method,
    url: `/v1/admin${url}`,
    headers: {
      ...(options.headers ?? {}),
      ...(options.cookie ? { cookie: `vb_admin_session=${options.cookie}` } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
    },
    ...(options.body !== undefined ? { payload: options.body as object } : {}),
  });
  const cookie = response.cookies.find((c) => c.name === 'vb_admin_session');
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null,
    headers: response.headers,
    sessionCookie: cookie && cookie.value ? cookie.value : null,
  };
}
