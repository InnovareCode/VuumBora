/**
 * Segredos obrigatórios ausentes não podem ser um 503 calado: o boot AVISA ALTO (com nomes, nunca valores) e, com
 * `REQUIRE_SECRETS=true`, RECUSA SUBIR. O padrão segue "sobe e avisa": o CI sobe a API sem AUTH_PEPPER/AUTH_JWT_SECRET para
 * conferir /healthz, e ligar a recusa por padrão derrubaria o formulário público e o painel que já estão no ar.
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { authConfigProblems, loadAuthConfig, PRODUCTION_BCRYPT_COST_FLOOR } from '../src/lib/auth-config.js';
import { bootSecretProblems } from '../src/lib/boot-secrets.js';

const strong = () => randomBytes(48).toString('base64');
const SERVER = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const baseUrl = process.env['DATABASE_URL']!;

describe('diagnóstico (só nomes e motivos, nunca valores)', () => {
  test('o que falta, o que é fraco e o que é igual', () => {
    assert.deepEqual(authConfigProblems({}), ['AUTH_PEPPER:missing_or_invalid', 'AUTH_JWT_SECRET:missing_or_invalid']);
    assert.deepEqual(authConfigProblems({ AUTH_PEPPER: '', AUTH_JWT_SECRET: '' }), ['AUTH_PEPPER:too_small', 'AUTH_JWT_SECRET:too_small']);
    assert.deepEqual(authConfigProblems({ AUTH_PEPPER: 'a'.repeat(40), AUTH_JWT_SECRET: strong() }), ['AUTH_PEPPER:weak']);
    const same = strong();
    assert.deepEqual(authConfigProblems({ AUTH_PEPPER: same, AUTH_JWT_SECRET: same }), ['AUTH_PEPPER:equals_AUTH_JWT_SECRET']);
    assert.deepEqual(authConfigProblems({ AUTH_PEPPER: strong(), AUTH_JWT_SECRET: strong(), AUTH_BCRYPT_COST: '99' }), ['AUTH_BCRYPT_COST:too_big']);
    assert.deepEqual(authConfigProblems({ AUTH_PEPPER: strong(), AUTH_JWT_SECRET: strong() }), []);
  });

  test('B-5 (rodada 3b): em produção o custo do bcrypt tem piso 10; abaixo dele a identidade dos apps falha FECHADA e o boot avisa (só o nome)', () => {
    const secrets = { AUTH_PEPPER: strong(), AUTH_JWT_SECRET: strong() };
    for (const NODE_ENV of ['production', undefined]) {
      const env = (cost?: string): NodeJS.ProcessEnv => ({ ...secrets, ...(NODE_ENV ? { NODE_ENV } : {}), ...(cost ? { AUTH_BCRYPT_COST: cost } : {}) });
      const label = NODE_ENV ?? 'NODE_ENV ausente (o env.ts o trata como production)';
      assert.deepEqual(authConfigProblems(env('4')), ['AUTH_BCRYPT_COST:below_production_floor'], label);
      assert.deepEqual(authConfigProblems(env('9')), ['AUTH_BCRYPT_COST:below_production_floor'], label);
      assert.equal(loadAuthConfig(env('9')), null, `${label}: custo 9 não sobe a identidade`);
      assert.deepEqual(authConfigProblems(env('10')), [], label);
      assert.equal(loadAuthConfig(env('10'))?.bcryptCost, 10, `${label}: o piso em si é aceito`);
      assert.equal(loadAuthConfig(env())?.bcryptCost, 12, `${label}: o padrão (12) segue valendo`);
      assert.equal(loadAuthConfig(env('15'))?.bcryptCost, 15);
    }
    // O custo baixo continua permitido onde ele existe de propósito (a suíte usa 4 para ser rápida).
    for (const NODE_ENV of ['test', 'development']) {
      assert.deepEqual(authConfigProblems({ ...secrets, NODE_ENV, AUTH_BCRYPT_COST: '4' }), [], NODE_ENV);
      assert.equal(loadAuthConfig({ ...secrets, NODE_ENV, AUTH_BCRYPT_COST: '4' })?.bcryptCost, 4, NODE_ENV);
    }
    assert.equal(PRODUCTION_BCRYPT_COST_FLOOR, 10);
    // O valor configurado nunca vai para o diagnóstico, e o boot (bootSecretProblems) herda o aviso.
    assert.deepEqual(bootSecretProblems({ ...secrets, NODE_ENV: 'production', AUTH_BCRYPT_COST: '4', ADMIN_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64') }), ['AUTH_BCRYPT_COST:below_production_floor']);
  });

  test('nenhum valor de segredo aparece no diagnóstico', () => {
    const weak = 'senha-secretissima-' + 'x'.repeat(30);
    const out = JSON.stringify(authConfigProblems({ AUTH_PEPPER: weak, AUTH_JWT_SECRET: weak }));
    assert.ok(!out.includes('secretissima'));
  });

  test('a chave do 2FA do admin entra na lista de segredos obrigatórios', () => {
    const ok = { AUTH_PEPPER: strong(), AUTH_JWT_SECRET: strong() };
    assert.deepEqual(bootSecretProblems({ ...ok }), ['ADMIN_TOTP_ENCRYPTION_KEY:missing']);
    assert.deepEqual(bootSecretProblems({ ...ok, ADMIN_TOTP_ENCRYPTION_KEY: '   ' }), ['ADMIN_TOTP_ENCRYPTION_KEY:missing']);
    assert.deepEqual(bootSecretProblems({ ...ok, ADMIN_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64') }), []);
  });
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

interface BootResult {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly healthy: boolean;
}

/** Sobe o servidor de verdade (processo filho, diretório de trabalho vazio: sem `.env`) e espera subir OU morrer. */
async function boot(extraEnv: Record<string, string>): Promise<BootResult> {
  const cwd = mkdtempSync(join(tmpdir(), 'vuumbora-boot-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), SERVER], {
    cwd,
    env: {
      PATH: process.env['PATH'] ?? '',
      SystemRoot: process.env['SystemRoot'] ?? '',
      NODE_ENV: 'test',
      DATABASE_URL: baseUrl,
      ALLOWED_ORIGINS: 'http://localhost:3000',
      ADMIN_ALLOWED_ORIGINS: 'http://localhost:4310',
      RUN_MIGRATIONS_ON_BOOT: 'false',
      LOG_LEVEL: 'fatal',
      PORT: String(port),
      ...extraEnv,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));

  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const raced = await Promise.race([exited, new Promise<'tick'>((resolve) => setTimeout(() => resolve('tick'), 250))]);
      if (raced !== 'tick') return { exitCode: raced, stderr, healthy: false };
      const healthy = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok, () => false);
      if (healthy) return { exitCode: null, stderr, healthy: true };
    }
    return { exitCode: null, stderr, healthy: false };
  } finally {
    child.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('boot de verdade (processo filho)', () => {
  test('REQUIRE_SECRETS=true sem os segredos: o processo MORRE (exit 1) e diz quais faltam, sem valores', async () => {
    const result = await boot({ REQUIRE_SECRETS: 'true' });
    assert.equal(result.exitCode, 1, result.stderr);
    assert.match(result.stderr, /REQUIRE_SECRETS=true: recusando subir/);
    assert.match(result.stderr, /AUTH_PEPPER:missing_or_invalid/);
    assert.match(result.stderr, /AUTH_JWT_SECRET:missing_or_invalid/);
    assert.match(result.stderr, /ADMIN_TOTP_ENCRYPTION_KEY:missing/);
  });

  test('sem a flag (padrão, é o que o CI faz): SOBE, mas avisa ALTO — não é mais um 503 calado', async () => {
    const result = await boot({});
    assert.equal(result.healthy, true, result.stderr);
    assert.match(result.stderr, /ATENÇÃO: segredo\(s\) obrigatório\(s\) ausente\(s\) ou fraco\(s\)/);
    assert.match(result.stderr, /AUTH_PEPPER:missing_or_invalid/);
  });

  test('REQUIRE_SECRETS=true com os segredos válidos: sobe e não avisa nada', async () => {
    const result = await boot({
      REQUIRE_SECRETS: 'true',
      AUTH_PEPPER: strong(),
      AUTH_JWT_SECRET: strong(),
      ADMIN_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    assert.equal(result.healthy, true, result.stderr);
    assert.ok(!result.stderr.includes('ATENÇÃO'), result.stderr);
  });

  test('segredo FRACO também é recusado com REQUIRE_SECRETS=true, e o valor nunca vai para o log', async () => {
    const weak = 'zzzzzzzz'.repeat(6);
    const result = await boot({ REQUIRE_SECRETS: 'true', AUTH_PEPPER: weak, AUTH_JWT_SECRET: strong(), ADMIN_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
    assert.equal(result.exitCode, 1, result.stderr);
    assert.match(result.stderr, /AUTH_PEPPER:weak/);
    assert.ok(!result.stderr.includes(weak));
  });
});
