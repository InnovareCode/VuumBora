#!/usr/bin/env node
/**
 * Cria um administrador do painel interno. ÚNICA forma de nascer um admin
 * — não existe (e não deve existir) endpoint HTTP de auto-cadastro, de
 * propósito: isto dá acesso a dado pessoal de gente real.
 *
 * Uso:
 *   node scripts/create-admin.mjs --email=admin@vuumbora.com.br --name="Nome Completo" [--role=dono|operacao|revisor_documentos|financeiro|suporte]
 *   npm run create-admin --workspace @vuumbora/api -- --email=... --name="..."
 *
 * Sem `--password`, pede a senha de forma OCULTA no terminal (não aparece
 * na tela, não fica no histórico do shell). Com `--password=...`, ela
 * fica visível no histórico do terminal — use só em automação/CI
 * controlado, nunca digitando à mão.
 *
 * Exige DATABASE_URL no ambiente. Roda dentro do contêiner do serviço
 * `vuumbora-backend` (terminal do Easypanel ou `docker exec`) em produção,
 * ou localmente lendo `apps/api/.env` (via `dotenv/config`, mesmo padrão
 * dos outros scripts).
 */
import 'dotenv/config';
import { createInterface } from 'node:readline';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const ROLES = ['dono', 'operacao', 'revisor_documentos', 'financeiro', 'suporte'];
const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = /^--([a-zA-Z-]+)=([\s\S]*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Lê a senha sem ecoar na tela. Cai para `ask()` normal se a entrada não for um TTY (ex.: pipe em teste automatizado). */
function askHidden(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return ask(question);
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    let buffer = '';

    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        if (char === '\n' || char === '\r') {
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          stdin.pause();
          process.stdout.write('\n');
          resolve(buffer);
          return;
        }
        if (char === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += char;
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[create-admin] DATABASE_URL não definido no ambiente.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  const emailInput = args.email ?? (await ask('E-mail: '));
  const email = emailInput.trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 254) {
    console.error('[create-admin] e-mail inválido.');
    process.exit(1);
  }

  const name = (args.name ?? (await ask('Nome completo: '))).trim();
  if (!name) {
    console.error('[create-admin] nome é obrigatório.');
    process.exit(1);
  }

  const role = (args.role ?? 'suporte').trim();
  if (!ROLES.includes(role)) {
    console.error(`[create-admin] role inválida — use uma de: ${ROLES.join(', ')}.`);
    process.exit(1);
  }

  const password = args.password ?? (await askHidden('Senha (mínimo 12 caracteres, não aparece no terminal): '));
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[create-admin] senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      `INSERT INTO admin_users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [name, email, passwordHash, role],
    );

    if (result.rowCount === 0) {
      console.error(`[create-admin] já existe um admin com o e-mail ${email}. Nada foi alterado.`);
      process.exit(1);
    }

    console.log(`[create-admin] admin criado: ${email} (id ${result.rows[0].id}, role "${role}").`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[create-admin] erro: ${err.message}`);
  process.exit(1);
});
