/**
 * Os PADRÕES de produção do admin (os que valem quando a variável não é definida) ficam fixados aqui.
 * `setup.ts` sobrescreve alguns deles para os outros testes, então sem este teste um padrão poderia
 * mudar sem nenhum teste notar (a Íris trocou o padrão de tentativas do TOTP de 5 para 8: tudo verde).
 *
 * Roda `src/env.ts` num processo-filho com ambiente MÍNIMO e diretório de trabalho vazio (sem `.env`),
 * que é o que um deploy sem essas variáveis enxerga.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('padrões de produção do admin: 5 erros de TOTP, bloqueio 15 min, login 5 por IP em 15 min, sessão 12 h / teto 7 dias, desafio 10 min', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'vuumbora-env-'));
  try {
    const envModule = pathToFileURL(fileURLToPath(new URL('../src/env.ts', import.meta.url))).href;
    const script = `import(${JSON.stringify(envModule)}).then(({ env }) => console.log(JSON.stringify({
      totpMax: env.ADMIN_TOTP_MAX_ATTEMPTS, totpLock: env.ADMIN_TOTP_LOCK_MINUTES,
      loginMax: env.ADMIN_LOGIN_RATE_LIMIT_MAX, loginWindow: env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES,
      ttl: env.ADMIN_SESSION_TTL_HOURS, absolute: env.ADMIN_SESSION_ABSOLUTE_TTL_HOURS,
      challenge: env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES,
    })))`;
    const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'] ?? '',
        SystemRoot: process.env['SystemRoot'] ?? '',
        DATABASE_URL: 'postgres://x@localhost:1/vuumbora_test',
        ALLOWED_ORIGINS: 'http://localhost:3000',
        ADMIN_ALLOWED_ORIGINS: 'http://localhost:4310',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const got = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
    assert.equal(got.totpMax, 5);
    assert.equal(got.totpLock, 15);
    assert.equal(got.loginMax, 5);
    assert.equal(got.loginWindow, 15);
    assert.equal(got.ttl, 12);
    assert.equal(got.absolute, 168);
    assert.equal(got.challenge, 10);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
