/**
 * Renovação serializada (docs/plano-apps-execucao.md §4). Aqui o `SessionManager` roda com uma API de refresh falsa
 * e um "recurso protegido" falso — sem rede. A prova por HTTP de verdade está em `identity-http.test.ts`.
 *
 * Teste que passaria com o código errado não prova nada: onde o cenário depende de uma corrida (401 tardio),
 * o próprio teste afirma que a corrida aconteceu.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ApiError, Result } from '../src/index';
import { parsePendingRevocations, serializePendingRevocations, serializeSession } from '../src/identity/session-storage';
import type { SessionTokens } from '../src/identity/types';
import {
  createKit,
  deferred,
  err,
  ok,
  PENDING_KEY,
  protectedResource,
  REFRESH_REJECTED,
  SESSION_KEY,
  sleep,
  spyStorage,
  tokens,
  UNAUTHORIZED,
  waitFor,
} from './helpers/session-kit';

const CONCURRENT = 20;

/** Refresh que demora `delayMs` e entrega o sucessor `r1 → n`. */
function refreshTo(next: SessionTokens, delayMs = 20): (refreshToken: string) => Promise<Result<SessionTokens>> {
  return async () => {
    await sleep(delayMs);
    return ok(next);
  };
}

describe('SessionManager — renovação em voo único', () => {
  test('20 chamadas concorrentes com 401 geram exatamente 1 refresh e todas terminam bem', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2)) });
    const resource = protectedResource(() => 'a2');

    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => kit.manager.run(resource.call)));

    assert.ok(results.every((r) => r.ok), 'todas repetiram com o token novo e passaram');
    assert.deepEqual(kit.refreshCalls, ['r1'], 'UM refresh, com o refresh que estava guardado');
    assert.equal(resource.used.filter((t) => t === 'a1').length, CONCURRENT, 'cada uma tentou uma vez com o token velho');
    assert.equal(resource.used.filter((t) => t === 'a2').length, CONCURRENT, 'e repetiu UMA vez com o novo');
    assert.equal((await kit.stored())?.refreshToken, 'r2', 'o sucessor ficou gravado');
  });

  test('o novo refresh é gravado ANTES de liberar as chamadas em espera (regra 3 do plano)', async () => {
    const events: string[] = [];
    const kit = createKit({ refresh: refreshTo(tokens(2), 10), events });
    kit.storage.setDelayMs = 40; // a gravação demora: se alguém fosse liberado antes, apareceria na frente de `persist:end`
    const resource = protectedResource(() => 'a2', () => 0, events);

    await Promise.all(Array.from({ length: 5 }, () => kit.manager.run(resource.call)));

    const persistEnd = events.indexOf(`persist:end:${SESSION_KEY}`);
    const firstRetry = events.indexOf('call:start:a2');
    assert.ok(persistEnd >= 0 && firstRetry >= 0);
    assert.ok(persistEnd < firstRetry, `nenhuma repetição antes da gravação terminar: ${events.join(' > ')}`);
  });

  test('401 que chega TARDE (depois de outra chamada já ter renovado) repete com o token novo, sem 2º refresh', async () => {
    const events: string[] = [];
    const kit = createKit({ refresh: refreshTo(tokens(2), 15), events });
    // Chamada i responde em 4*i ms: as primeiras entram no voo; as últimas só recebem o 401 depois que ele acabou.
    const resource = protectedResource(() => 'a2', (i) => (i < CONCURRENT ? i * 4 : 0), events);

    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => kit.manager.run(resource.call)));

    const refreshEnd = events.indexOf('refresh:end:r1');
    const lateRejections = events.slice(refreshEnd).filter((e) => e === 'call:end:a1').length;
    assert.ok(lateRejections > 0, 'pré-condição: houve 401 depois do fim da renovação (senão o teste não prova o caso)');
    assert.ok(results.every((r) => r.ok));
    assert.deepEqual(kit.refreshCalls, ['r1'], 'um 401 tardio NÃO pode causar outro /refresh (o 2º uso do r1 mataria a família)');
  });

  test('um segundo 401 depois da renovação volta como unauthorized, sem laço', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 1) });
    const resource = protectedResource(() => 'nunca');

    const result = await kit.manager.run(resource.call);

    assert.equal(!result.ok && result.error.kind, 'unauthorized');
    assert.equal(resource.calls, 2, 'uma tentativa + UMA repetição');
    assert.equal(kit.refreshCalls.length, 1);
    assert.equal(kit.manager.getState().status, 'signed_in', 'o refresh funcionou: a sessão não cai por isso');
  });

  test('erro que não é 401 volta como está, sem renovar', async () => {
    const kit = createKit();
    const network: ApiError = { kind: 'network', retryable: true };

    const result = await kit.manager.run(async () => err(network));

    assert.deepEqual(!result.ok && result.error, network);
    assert.equal(kit.refreshCalls.length, 0);
  });
});

describe('SessionManager — falha do refresh', () => {
  test('recusa definitiva (401): UM logout local e as 20 pendentes recebem unauthorized', async () => {
    const kit = createKit({
      refresh: async () => {
        await sleep(20);
        return err(REFRESH_REJECTED);
      },
    });
    await kit.manager.restore();
    const resource = protectedResource(() => 'a2');

    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => kit.manager.run(resource.call)));

    assert.equal(results.length, CONCURRENT);
    for (const result of results) {
      assert.ok(!result.ok && result.error.kind === 'unauthorized', 'cada pendente recebe unauthorized');
    }
    assert.equal(kit.refreshCalls.length, 1, 'UM refresh, sem nova tentativa');
    assert.equal(resource.calls, CONCURRENT, 'ninguém repetiu a chamada (não havia token novo)');
    assert.deepEqual(kit.states.filter((s) => s.startsWith('signed_out')), ['signed_out:session_expired'], 'UM logout local');
    assert.equal(kit.storage.ops.filter((op) => op === `remove:${SESSION_KEY}`).length, 1, 'e o cofre foi apagado uma vez');
    assert.equal(await kit.stored(), null);
    assert.equal(kit.logoutCalls.length, 0, 'não chama /logout: o servidor é quem disse que a sessão morreu');
  });

  test('o código do servidor chega às pendentes (a tela pode distinguir "expirou" de "sem sessão")', async () => {
    const kit = createKit({ refresh: async () => err(REFRESH_REJECTED) });
    const result = await kit.manager.run(protectedResource(() => 'a2').call);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'invalid_refresh_token');
  });

  for (const [name, error] of [
    ['sem rede', { kind: 'network', retryable: true }],
    ['servidor fora (5xx)', { kind: 'unavailable', retryable: true, code: 'unavailable' }],
    ['429 do rate limit', { kind: 'rate_limited', code: 'rate_limited', retryAfterSeconds: 30 }],
    ['resposta inesperada', { kind: 'unknown', message: 'Resposta inesperada do servidor.' }],
  ] as const) {
    test(`falha transitória (${name}) NÃO desloga: a sessão fica; o mesmo refresh descansa e depois tenta de novo`, async () => {
      let now = Date.now();
      const kit = createKit({ refresh: async () => err(error), clock: () => now });
      await kit.manager.restore();
      const resource = protectedResource(() => 'a2');

      // Rajada em dois tempos: a falha é instantânea, então as últimas 401 chegam DEPOIS do fim do voo.
      const burst = await Promise.all(Array.from({ length: 5 }, () => kit.manager.run(resource.call)));
      await sleep(5);
      burst.push(await kit.manager.run(resource.call));

      for (const result of burst) assert.ok(!result.ok && result.error.kind === error.kind);
      assert.equal(kit.refreshCalls.length, 1, 'uma tentativa só: não se repete o mesmo refresh logo depois de uma falha ambígua');
      assert.equal(kit.manager.getState().status, 'signed_in');
      assert.equal((await kit.stored())?.refreshToken, 'r1', 'o cofre não foi tocado');

      now += 61_000; // passou o descanso (teto de 60 s, inclusive para o 429 com retryAfterSeconds)
      kit.setRefresh(refreshTo(tokens(2), 1));
      const retry = await kit.manager.run(resource.call);
      assert.ok(retry.ok, 'a rede voltou: renova e segue');
      assert.deepEqual(kit.refreshCalls, ['r1', 'r1'], 'o refresh não rotacionou na falha, então o MESMO refresh serve');
    });
  }

  test('o descanso após falha transitória é curto (5 s) quando o servidor não pede mais', async () => {
    let now = Date.now();
    const kit = createKit({ refresh: async () => err({ kind: 'network', retryable: true }), clock: () => now });
    const resource = protectedResource(() => 'a2');

    await kit.manager.run(resource.call);
    now += 4_000;
    await kit.manager.run(resource.call);
    assert.equal(kit.refreshCalls.length, 1, 'aos 4 s ainda descansa');
    now += 1_500;
    await kit.manager.run(resource.call);
    assert.equal(kit.refreshCalls.length, 2, 'aos 5,5 s tenta de novo');
  });

  test('400 invalid_refresh_body no refresh (token malformado guardado) é definitivo: desloga em vez de repetir para sempre', async () => {
    const kit = createKit({ refresh: async () => err({ kind: 'validation', fields: { form: 'x' }, code: 'invalid_refresh_body' }) });
    const result = await kit.manager.run(protectedResource(() => 'a2').call);
    assert.ok(!result.ok && result.error.kind === 'unauthorized');
    assert.equal(kit.manager.getState().status, 'signed_out');
  });
});

describe('SessionManager — M-4: a recusa do refresh só é definitiva com um `code` do contrato', () => {
  // O que um proxy, WAF ou CDN responde em `/v1/auth/refresh`: tem status 4xx, mas não é a API falando.
  const intermediary: ReadonlyArray<[string, ApiError]> = [
    ['401 sem envelope (proxy)', { kind: 'unauthorized' }],
    ['401 com code de outra rota (unauthorized)', { kind: 'unauthorized', code: 'unauthorized' }],
    ['401 com code desconhecido (desafio anti-bot)', { kind: 'unauthorized', code: 'waf_challenge' }],
    ['403 sem envelope (WAF)', { kind: 'forbidden' }],
    ['403 com code de outro assunto', { kind: 'forbidden', code: 'email_not_verified' }],
    ['400 sem envelope', { kind: 'validation', fields: { form: 'status HTTP 400' } }],
    ['400 com code de outro assunto', { kind: 'validation', fields: { email: 'x' }, code: 'invalid_email' }],
    ['401 com code que só existe em 400 (status e code não combinam)', { kind: 'unauthorized', code: 'invalid_refresh_body' }],
    // B5: a API usa o `invalid_body` GENÉRICO para qualquer 4xx de transporte (413, 415, corpo ilegível): não prova que o refresh morreu.
    ['400 invalid_body GENÉRICO (4xx de transporte: 413, 415, corpo ilegível)', { kind: 'validation', fields: { form: 'x' }, code: 'invalid_body' }],
    ['401 invalid_body genérico', { kind: 'unauthorized', code: 'invalid_body' }],
    ['404 de rota que o proxy não achou', { kind: 'not_found' }],
    ['code com nome de propriedade de Object (constructor)', { kind: 'unauthorized', code: 'constructor' }],
  ];

  for (const [name, error] of intermediary) {
    test(`${name}: NÃO desloga, não inventa code e o mesmo refresh descansa`, async () => {
      let now = Date.now();
      const kit = createKit({ refresh: async () => err(error), clock: () => now });
      await kit.manager.restore();
      const resource = protectedResource(() => 'a2');

      const burst = await Promise.all(Array.from({ length: 5 }, () => kit.manager.run(resource.call)));
      await sleep(5);
      burst.push(await kit.manager.run(resource.call)); // chega depois do fim do voo: cai no descanso

      for (const result of burst) {
        assert.ok(!result.ok);
        assert.equal(result.error.kind, 'unavailable', 'a tela lê "tente de novo", não "sua sessão acabou"');
        assert.equal(result.error.code, undefined, 'o code NÃO é fabricado (nem o do servidor, que não é do contrato)');
      }
      assert.equal(kit.refreshCalls.length, 1, 'uma tentativa só; o descanso vale também para a recusa sem code');
      assert.deepEqual(kit.manager.getState(), { status: 'signed_in' });
      assert.equal((await kit.stored())?.refreshToken, 'r1', 'o cofre não foi tocado');
      assert.ok(!kit.storage.ops.includes(`remove:${SESSION_KEY}`));
      assert.deepEqual(kit.states.filter((s) => s.startsWith('signed_out')), [], 'ninguém foi deslogado');

      now += 61_000;
      kit.setRefresh(refreshTo(tokens(2), 1));
      const retry = await kit.manager.run(resource.call);
      assert.ok(retry.ok, 'o intermediário saiu do caminho: a MESMA sessão renova e segue');
      assert.deepEqual(kit.refreshCalls, ['r1', 'r1']);
    });
  }

  test('o descanso de uma recusa sem code respeita o `retryAfterSeconds` que veio', async () => {
    let now = Date.now();
    const kit = createKit({ refresh: async () => err({ kind: 'forbidden', retryAfterSeconds: 30 }), clock: () => now });
    const resource = protectedResource(() => 'a2');
    const first = await kit.manager.run(resource.call);
    assert.ok(!first.ok && first.error.kind === 'unavailable' && first.error.retryAfterSeconds === 30);
    now += 20_000;
    await kit.manager.run(resource.call);
    assert.equal(kit.refreshCalls.length, 1, 'aos 20 s ainda descansa');
    now += 11_000;
    await kit.manager.run(resource.call);
    assert.equal(kit.refreshCalls.length, 2, 'aos 31 s tenta de novo');
  });

  const definitive: ReadonlyArray<[string, ApiError]> = [
    ['401 invalid_refresh_token (o contrato)', { kind: 'unauthorized', code: 'invalid_refresh_token' }],
    ['400 invalid_refresh_body (refresh malformado guardado, código PRÓPRIO)', { kind: 'validation', fields: { form: 'x' }, code: 'invalid_refresh_body' }],
    ['403 com invalid_refresh_token (o code é a assinatura, o status é transporte)', { kind: 'forbidden', code: 'invalid_refresh_token' }],
    ['400 com invalid_refresh_token', { kind: 'validation', fields: { form: 'x' }, code: 'invalid_refresh_token' }],
  ];

  for (const [name, error] of definitive) {
    test(`controle positivo — ${name}: UM logout local e o code é o do servidor`, async () => {
      const kit = createKit({ refresh: async () => err(error) });
      await kit.manager.restore();
      const result = await kit.manager.run(protectedResource(() => 'a2').call);

      assert.ok(!result.ok && result.error.kind === 'unauthorized');
      assert.equal(result.error.code, error.code, 'o code devolvido é exatamente o que o servidor mandou');
      assert.deepEqual(kit.manager.getState(), { status: 'signed_out', reason: 'session_expired' });
      assert.equal(await kit.stored(), null);
      assert.equal(kit.refreshCalls.length, 1);
    });
  }

  test('getValidAccessToken e refreshIfExpiring seguem a mesma regra (sem code = sessão fica)', async () => {
    const kit = createKit({ initial: tokens(1, { accessExpiresInMs: 10_000 }), refresh: async () => err({ kind: 'unauthorized' }) });
    const direct = await kit.manager.getValidAccessToken();
    assert.ok(!direct.ok && direct.error.kind === 'unavailable');
    const foreground = await kit.manager.refreshIfExpiring();
    assert.ok(!foreground.ok && foreground.error.kind === 'unavailable');
    assert.equal(kit.manager.getState().status, 'signed_in');
  });
});

describe('SessionManager — época (login/logout no meio de uma chamada)', () => {
  test('401 que chega depois do logout não renova nem refaz a chamada', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 1) });
    await kit.manager.restore();
    const resource = protectedResource(() => 'a2', () => 30);

    const pending = kit.manager.run(resource.call);
    await sleep(5);
    await kit.manager.signOut();
    const result = await pending;

    assert.ok(!result.ok && result.error.kind === 'unauthorized');
    assert.equal(kit.refreshCalls.length, 0, 'sem sessão não há o que renovar');
    assert.equal(resource.calls, 1, 'e a chamada não foi repetida');
    assert.deepEqual(kit.logoutCalls, ['r1']);
  });

  test('logout durante um refresh em voo espera o voo, revoga o refresh MAIS NOVO e não ressuscita a sessão', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 40) });
    await kit.manager.restore();
    const resource = protectedResource(() => 'a2');

    const pending = kit.manager.run(resource.call);
    await sleep(10); // o refresh está em voo
    const signedOut = await kit.manager.signOut();
    const settled = await pending;

    assert.ok(signedOut.ok && signedOut.data.serverRevoked);
    assert.deepEqual(kit.logoutCalls, ['r2'], 'o r1 já foi rotacionado: a revogação usa o sucessor');
    assert.deepEqual(kit.manager.getState(), { status: 'signed_out', reason: 'user' });
    assert.equal(await kit.stored(), null, 'a gravação tardia do refresh não pode trazer a sessão de volta');
    assert.ok(settled.ok || settled.error.kind === 'unauthorized', 'a pendente termina (com dado ou unauthorized), nunca pendura');
  });

  test('login (adopt) durante um refresh em voo: o resultado do voo é descartado e a pendente não vira a conta nova', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 40) });
    await kit.manager.restore();
    const resource = protectedResource(() => 'a2');

    const pending = kit.manager.run(resource.call);
    await sleep(10);
    await kit.manager.adopt(tokens(9));
    const result = await pending;

    assert.ok(!result.ok && result.error.kind === 'unauthorized', 'o pedido da sessão antiga não é repetido com o token da nova');
    assert.equal((await kit.stored())?.refreshToken, 'r9', 'o cofre ficou com a sessão NOVA, não com a do voo');
    const check = await kit.manager.getValidAccessToken();
    assert.ok(check.ok && check.data === 'a9');
  });

  test('troca de conta no meio da chamada: o 401 tardio NÃO é repetido com o token da conta nova', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 1) });
    await kit.manager.restore();
    const resource = protectedResource(() => 'a9', () => 30); // aceitaria o token da conta NOVA

    const pending = kit.manager.run(resource.call); // sai com o a1 (conta A)
    await sleep(5);
    await kit.manager.signOut();
    await kit.manager.adopt(tokens(9)); // a conta B entra enquanto a chamada da A ainda está no ar
    const result = await pending;

    assert.ok(!result.ok && result.error.kind === 'unauthorized');
    assert.deepEqual(resource.used, ['a1'], 'o pedido da conta A nunca é refeito com o token da B');
    assert.equal(kit.refreshCalls.length, 0);
  });

  test('login que chega enquanto o refresh é GRAVADO: quem esperava não repete com o token da sessão antiga', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 5) });
    await kit.manager.restore();
    kit.storage.setDelayMs = 40; // a gravação do sucessor demora: dá tempo de um login entrar no meio
    const resource = protectedResource(() => 'a2');

    const pending = kit.manager.run(resource.call);
    await sleep(20); // o refresh já terminou; a gravação do r2 está em andamento
    await kit.manager.adopt(tokens(9));
    const result = await pending;

    assert.ok(!result.ok && result.error.kind === 'unauthorized');
    assert.deepEqual(resource.used, ['a1'], 'não repetiu com o a2 (sessão que já não existe)');
  });

  // As duas lacunas que a Íris mostrou por mutação (SF10 e SF4) estavam cobertas por testes que dependiam de relógio
  // (`sleep`): sob carga o cenário se desfazia e o mutante sobrevivia. Estes não dormem: cada passo espera uma
  // CONDIÇÃO, e cada um afirma a pré-condição (o refresh está em voo / a gravação está presa) antes de provocar a corrida.
  test('logout local (logout-all) com um refresh EM VOO: a renovação tardia é descartada e não ressuscita a sessão (SF10)', async () => {
    const flight = deferred<Result<SessionTokens>>();
    const kit = createKit({ refresh: () => flight.promise });
    await kit.manager.restore();

    const renewing = kit.manager.getValidAccessToken(10_000_000); // pede mais validade do que resta: força o refresh
    await waitFor(() => kit.refreshCalls.length === 1, 'o refresh sair'); // pré-condição: ele está em voo
    await kit.manager.endLocal('user'); // o logout-all terminou ENQUANTO o refresh voava
    flight.resolve(ok(tokens(2)));
    const result = await renewing;

    assert.ok(!result.ok && result.error.kind === 'unauthorized', 'quem esperava a renovação não recebe token');
    assert.deepEqual(kit.manager.getState(), { status: 'signed_out', reason: 'user' });
    assert.equal(await kit.stored(), null, 'a renovação tardia não pode gravar a sessão de volta');
    assert.ok(!kit.storage.ops.includes(`set:${SESSION_KEY}`), 'nem tentou gravar');
    const after = await kit.manager.getValidAccessToken();
    assert.ok(!after.ok && after.error.code === 'no_session', 'e a memória também ficou sem sessão');
  });

  test('401 → refresh ok → login de OUTRA conta chega enquanto o novo refresh é GRAVADO: a chamada da conta A não é repetida (SF4)', async () => {
    const kit = createKit({ refresh: async () => ok(tokens(2)) });
    await kit.manager.restore();
    const release = kit.storage.holdWrites(SESSION_KEY); // a gravação do r2 fica presa até o teste soltar
    const resource = protectedResource(() => 'a2'); // aceitaria o token renovado: o dado da conta A sairia

    const pending = kit.manager.run(resource.call);
    await waitFor(() => kit.storage.ops.includes(`set:${SESSION_KEY}`), 'a gravação do refresh começar'); // pré-condição
    const adopting = kit.manager.adopt(tokens(9)); // login da conta B: muda a época de forma síncrona
    release();
    const result = await pending;
    await adopting;

    assert.deepEqual(resource.used, ['a1'], 'o pedido da conta A NÃO foi repetido com o token renovado');
    assert.ok(!result.ok && result.error.code === 'no_session', 'e nada da conta A chega à sessão da B');
    assert.equal((await kit.stored())?.refreshToken, 'r9', 'o cofre ficou com a sessão NOVA');
  });

  describe('o resultado de uma chamada de época antiga é descartado também quando DÁ CERTO (B-8b)', () => {
    const arrivals: ReadonlyArray<[string, Result<string>]> = [
      ['sucesso', ok('dados-da-conta-A')],
      ['erro que não é 401', err({ kind: 'unavailable', retryable: true })],
      ['404', err({ kind: 'not_found' })],
    ];
    for (const [name, arrival] of arrivals) {
      test(`${name} que chega depois de um logout no meio da chamada`, async () => {
        const kit = createKit();
        await kit.manager.restore();
        const gate = deferred<Result<string>>();
        let started = false;
        const pending = kit.manager.run((accessToken) => {
          started = accessToken === 'a1';
          return gate.promise;
        });
        await waitFor(() => started, 'a chamada sair com o token da conta A');
        await kit.manager.signOut();
        gate.resolve(arrival);
        const result = await pending;
        assert.ok(!result.ok && result.error.code === 'no_session', 'a resposta da sessão que acabou não chega a quem pediu');
      });

      test(`${name} que chega depois de a conta B entrar por cima (troca de conta)`, async () => {
        const kit = createKit();
        await kit.manager.restore();
        const gate = deferred<Result<string>>();
        let started = false;
        const pending = kit.manager.run(() => {
          started = true;
          return gate.promise;
        });
        await waitFor(() => started, 'a chamada sair');
        await kit.manager.adopt(tokens(9));
        gate.resolve(arrival);
        const result = await pending;
        assert.ok(!result.ok && result.error.code === 'no_session', 'o dado da conta A não vai para a tela da B');
        assert.equal(kit.manager.getState().status, 'signed_in', 'a sessão da B segue intacta');
      });
    }

    test('troca de conta durante a REPETIÇÃO depois do 401: o resultado da repetição é descartado', async () => {
      const kit = createKit({ refresh: refreshTo(tokens(2), 1) });
      await kit.manager.restore();
      const second = deferred<Result<string>>();
      let calls = 0;
      const pending = kit.manager.run((accessToken) => {
        calls += 1;
        return calls === 1 ? Promise.resolve(err(UNAUTHORIZED)) : (accessToken === 'a2' ? second.promise : Promise.resolve(err(UNAUTHORIZED)));
      });
      await waitFor(() => calls === 2, 'a repetição sair com o token renovado'); // pré-condição
      await kit.manager.adopt(tokens(9));
      second.resolve(ok('dados-da-conta-A'));
      const result = await pending;
      assert.ok(!result.ok && result.error.code === 'no_session');
    });
  });

  test('sem sessão: run devolve unauthorized sem chamar o recurso', async () => {
    const kit = createKit({ initial: null });
    const resource = protectedResource(() => 'a1');
    const result = await kit.manager.run(resource.call);
    assert.ok(!result.ok && result.error.kind === 'unauthorized' && result.error.code === 'no_session');
    assert.equal(resource.calls, 0);
  });
});

const NETWORK_DOWN = { kind: 'network', retryable: true } as const;

describe('SessionManager — B-8a: login por cima de uma sessão aberta revoga a anterior', () => {
  test('revoga no servidor, com o refresh mais novo que conhecemos, e adota a sessão nova', async () => {
    const kit = createKit(); // sessão r1 no cofre
    await kit.manager.restore();

    await kit.manager.adopt(tokens(9));
    await waitFor(() => kit.logoutCalls.length === 1, 'a revogação da sessão anterior sair');

    assert.deepEqual(kit.logoutCalls, ['r1']);
    assert.equal((await kit.stored())?.refreshToken, 'r9', 'a sessão guardada é a nova');
    assert.deepEqual(kit.manager.getState(), { status: 'signed_in' });
    assert.deepEqual(await kit.pendingRevocations(), [], 'o servidor confirmou: nada fica na fila');
  });

  test('com um refresh em voo, revoga o refresh que está em memória (a API revoga a família por qualquer um deles)', async () => {
    const flight = deferred<Result<SessionTokens>>();
    const kit = createKit({ refresh: () => flight.promise });
    await kit.manager.restore();
    const resource = protectedResource(() => 'a2');
    const pending = kit.manager.run(resource.call);
    await waitFor(() => kit.refreshCalls.length === 1, 'o refresh sair');

    await kit.manager.adopt(tokens(9));
    flight.resolve(ok(tokens(2)));
    await pending;

    assert.deepEqual(kit.logoutCalls, ['r1']);
    assert.equal((await kit.stored())?.refreshToken, 'r9', 'o sucessor do voo descartado não sobrescreve a sessão nova');
  });

  test('sem sessão anterior não há o que revogar', async () => {
    const kit = createKit({ initial: null });
    await kit.manager.restore();
    await kit.manager.adopt(tokens(9));
    await sleep(10);
    assert.deepEqual(kit.logoutCalls, []);
  });

  test('nunca revoga a sessão que acabou de adotar (mesmo refresh)', async () => {
    const kit = createKit();
    await kit.manager.restore();
    await kit.manager.adopt(tokens(1)); // o mesmo r1
    await sleep(10);
    assert.deepEqual(kit.logoutCalls, []);
    assert.equal((await kit.stored())?.refreshToken, 'r1');
  });

  test('revogação que falha por rede fica na fila (e a troca de conta não espera nem falha por isso)', async () => {
    const kit = createKit({ logout: async () => err(NETWORK_DOWN) });
    await kit.manager.restore();

    await kit.manager.adopt(tokens(9));
    await waitFor(() => kit.storage.ops.includes(`set:${PENDING_KEY}`), 'a fila ser gravada');
    await sleep(2);

    assert.deepEqual(await kit.pendingRevocations(), ['r1']);
    assert.equal((await kit.stored())?.refreshToken, 'r9');
    assert.deepEqual(kit.manager.getState(), { status: 'signed_in' });
  });
});

describe('SessionManager — B-8c: logout sem rede é guardado e repetido na abertura', () => {
  test('sem rede: sai do local, diz que o servidor não confirmou e guarda a revogação', async () => {
    const kit = createKit({ logout: async () => err(NETWORK_DOWN) });
    await kit.manager.restore();

    const result = await kit.manager.signOut();

    assert.ok(result.ok && result.data.serverRevoked === false);
    assert.deepEqual(kit.manager.getState(), { status: 'signed_out', reason: 'user' });
    assert.equal(await kit.stored(), null);
    assert.deepEqual(await kit.pendingRevocations(), ['r1'], 'o refresh que o servidor ainda não revogou ficou guardado');
  });

  test('na abertura seguinte a revogação é repetida e a fila esvazia', async () => {
    const first = createKit({ logout: async () => err(NETWORK_DOWN) });
    await first.manager.restore();
    await first.manager.signOut();

    const second = createKit({ storage: first.storage }); // o app abre de novo, agora com rede
    const state = await second.manager.restore();
    await waitFor(() => second.logoutCalls.length === 1, 'a revogação ser repetida');
    await waitFor(() => first.storage.ops.includes(`remove:${PENDING_KEY}`), 'a fila ser apagada');

    assert.deepEqual(state, { status: 'signed_out', reason: 'none' });
    assert.deepEqual(second.logoutCalls, ['r1']);
    assert.deepEqual(await second.pendingRevocations(), []);
  });

  test('a repetição também acontece com outra sessão já aberta no cofre (não depende de estar deslogado)', async () => {
    const first = createKit({ logout: async () => err(NETWORK_DOWN) });
    await first.manager.restore();
    await first.manager.signOut();
    await first.storage.setItem(SESSION_KEY, serializeSession(tokens(5)));

    const second = createKit({ storage: first.storage });
    const state = await second.manager.restore();
    await waitFor(() => second.logoutCalls.length === 1, 'a revogação ser repetida');

    assert.deepEqual(state, { status: 'signed_in' });
    assert.deepEqual(second.logoutCalls, ['r1'], 'revoga a pendente, não a sessão aberta');
  });

  test('servidor ainda fora na abertura: continua guardado e a repetição para na primeira falha', async () => {
    const first = createKit({ logout: async () => err(NETWORK_DOWN) });
    await first.manager.restore();
    await first.manager.signOut(); // r1
    await first.manager.adopt(tokens(2));
    await first.manager.signOut(); // r2

    const second = createKit({ storage: first.storage, logout: async () => err({ kind: 'unavailable', retryable: true }) });
    await second.manager.restore();
    await waitFor(() => second.logoutCalls.length === 1, 'a primeira tentativa');
    await sleep(10);

    assert.equal(second.logoutCalls.length, 1, 'as outras falhariam igual: não insiste');
    assert.deepEqual(await second.pendingRevocations(), ['r1', 'r2'], 'nada foi perdido');
  });

  test('recusa que não melhora (400) tira da fila; token vencido sai sem chamar o servidor', async () => {
    const now = Date.UTC(2026, 10, 22, 12, 0, 0);
    const storage = spyStorage({
      [PENDING_KEY]: serializePendingRevocations([
        { refreshToken: 'r-vencido-no-cofre', expiresAt: new Date(now - 1_000).toISOString() },
        { refreshToken: 'r-malformado', expiresAt: new Date(now + 86_400_000).toISOString() },
      ]),
    });
    const kit = createKit({ storage, clock: () => now, logout: async () => err({ kind: 'validation', fields: { form: 'x' }, code: 'invalid_body' }) });

    await kit.manager.restore();
    await waitFor(() => storage.ops.includes(`remove:${PENDING_KEY}`), 'a fila ser apagada');

    assert.deepEqual(kit.logoutCalls, ['r-malformado'], 'o vencido não vai ao servidor');
    assert.deepEqual(await kit.pendingRevocations(), []);
  });

  test('logout confirmado pelo servidor não deixa nada guardado', async () => {
    const kit = createKit();
    await kit.manager.restore();
    const result = await kit.manager.signOut();
    assert.ok(result.ok && result.data.serverRevoked);
    assert.ok(!kit.storage.ops.includes(`set:${PENDING_KEY}`), 'nem chegou a gravar a fila');
    assert.deepEqual(await kit.pendingRevocations(), []);
  });

  test('erro que não melhora com o tempo (400) não é guardado', async () => {
    const kit = createKit({ logout: async () => err({ kind: 'validation', fields: { form: 'x' }, code: 'invalid_body' }) });
    await kit.manager.restore();
    await kit.manager.signOut();
    assert.deepEqual(await kit.pendingRevocations(), []);
  });

  test('cofre que não lê a sessão não lê a fila (sem segundo erro; tenta de novo na próxima abertura)', async () => {
    const kit = createKit();
    kit.storage.failGet = true;
    await kit.manager.restore();
    assert.equal(kit.storageErrors.length, 1);
    assert.ok(!kit.storage.ops.includes(`get:${PENDING_KEY}`));
  });

  test('a fila é de ida e volta, tem teto e lixo vira fila vazia', () => {
    const items = Array.from({ length: 12 }, (_, n) => ({ refreshToken: `r${n}`, expiresAt: '2030-01-01T00:00:00.000Z' }));
    assert.equal(parsePendingRevocations(serializePendingRevocations(items)).length, 10);
    assert.deepEqual(parsePendingRevocations(serializePendingRevocations(items.slice(0, 2))), items.slice(0, 2));
    for (const junk of [null, '', 'não é json', '[]', '{"v":2,"items":[]}', '{"v":1,"items":"x"}', '{"v":1,"items":[null,{"refreshToken":"","expiresAt":"2030-01-01"},{"refreshToken":"r1","expiresAt":"ontem"}]}']) {
      assert.deepEqual(parsePendingRevocations(junk), [], String(junk));
    }
  });
});

describe('SessionManager — restauração e armazenamento', () => {
  test('restaura do cofre; run sem restore() explícito também funciona', async () => {
    const kit = createKit();
    assert.deepEqual(kit.manager.getState(), { status: 'unknown' });
    const result = await kit.manager.run(protectedResource(() => 'a1').call);
    assert.ok(result.ok);
    assert.equal(kit.manager.getState().status, 'signed_in');
  });

  test('conteúdo corrompido ou de versão estranha = sem sessão, e o lixo é apagado', async () => {
    const futureVersion = JSON.stringify({ ...(JSON.parse(serializeSession(tokens(1))) as object), v: 99 }); // completa, mas de OUTRA versão
    for (const garbage of ['isso não é json', '{"v":99,"accessToken":"x"}', futureVersion, JSON.stringify({ v: 1, accessToken: 'a' }), 'null']) {
      const kit = createKit({ initial: null });
      await kit.storage.setItem(SESSION_KEY, garbage);
      const state = await kit.manager.restore();
      assert.deepEqual(state, { status: 'signed_out', reason: 'none' }, garbage);
      await sleep(0);
      assert.equal(await kit.storage.raw(SESSION_KEY), null, 'lixo removido');
    }
  });

  test('cofre que falha na leitura = sem sessão nesta execução, erro reportado, nada apagado', async () => {
    const kit = createKit();
    kit.storage.failGet = true;
    const state = await kit.manager.restore();
    assert.deepEqual(state, { status: 'signed_out', reason: 'none' });
    assert.equal(kit.storageErrors.length, 1);
    assert.ok((await kit.storage.raw(SESSION_KEY)) !== null, 'a sessão guardada continua lá para a próxima abertura');
  });

  test('cofre que falha na gravação do refresh: a sessão segue em memória, o erro é reportado e ninguém fica preso', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 5) });
    kit.storage.failSet = true;
    const resource = protectedResource(() => 'a2');

    const results = await Promise.all(Array.from({ length: 5 }, () => kit.manager.run(resource.call)));

    assert.ok(results.every((r) => r.ok));
    assert.equal(kit.storageErrors.length, 1);
    const again = await kit.manager.run(resource.call);
    assert.ok(again.ok);
    assert.equal(kit.refreshCalls.length, 1, 'continua usando o token novo da memória');
  });

  test('gravações saem na ordem: a mais nova vence mesmo se a anterior demora', async () => {
    const kit = createKit({ initial: null });
    kit.storage.setDelayMs = 30;
    const first = kit.manager.adopt(tokens(1));
    await sleep(5); // a gravação lenta da primeira já começou (lê o atraso quando executa)
    kit.storage.setDelayMs = 0;
    const second = kit.manager.adopt(tokens(2));
    await Promise.all([first, second]);
    assert.equal((await kit.stored())?.refreshToken, 'r2', 'sem a fila, a gravação velha (lenta) terminaria por último e venceria');
  });
});

describe('SessionManager — access token a vencer (primeiro plano e WebSocket)', () => {
  test('renova antes de vencer (< 60 s), com um voo só para vários chamadores', async () => {
    const now = Date.now();
    const kit = createKit({ initial: tokens(1, { accessExpiresInMs: 30_000, now }), refresh: refreshTo(tokens(2), 10), clock: () => now });

    const results = await Promise.all(Array.from({ length: 5 }, () => kit.manager.getValidAccessToken()));

    assert.ok(results.every((r) => r.ok && r.data === 'a2'));
    assert.equal(kit.refreshCalls.length, 1);
  });

  test('não renova se ainda há folga; refreshIfExpiring é inofensivo nesse caso', async () => {
    const now = Date.now();
    const kit = createKit({ initial: tokens(1, { accessExpiresInMs: 10 * 60_000, now }), refresh: refreshTo(tokens(2)), clock: () => now });
    const token = await kit.manager.getValidAccessToken();
    const foreground = await kit.manager.refreshIfExpiring();
    assert.ok(token.ok && token.data === 'a1');
    assert.ok(foreground.ok);
    assert.equal(kit.refreshCalls.length, 0);
  });

  test('refreshIfExpiring propaga a recusa definitiva como unauthorized e desloga uma vez', async () => {
    const now = Date.now();
    const kit = createKit({ initial: tokens(1, { accessExpiresInMs: 1_000, now }), refresh: async () => err(REFRESH_REJECTED), clock: () => now });
    const result = await kit.manager.refreshIfExpiring();
    assert.ok(!result.ok && result.error.kind === 'unauthorized' && result.error.code === 'invalid_refresh_token');
    assert.deepEqual(kit.states.filter((s) => s.startsWith('signed_out')), ['signed_out:session_expired']);
  });
});

describe('SessionManager — assinatura de estado', () => {
  test('getState devolve o MESMO objeto enquanto nada muda (rotação de token não notifica)', async () => {
    const kit = createKit({ refresh: refreshTo(tokens(2), 1) });
    await kit.manager.restore();
    const before = kit.manager.getState();
    await kit.manager.run(protectedResource(() => 'a2').call);
    assert.equal(kit.manager.getState(), before);
    assert.deepEqual(kit.states, ['signed_in'], 'só a restauração notificou');
  });

  test('cancelar a assinatura funciona e um ouvinte que lança não derruba a sessão', async () => {
    const kit = createKit({ initial: null });
    const seen: string[] = [];
    const stop = kit.manager.subscribe((s) => seen.push(s.status));
    kit.manager.subscribe(() => {
      throw new Error('tela com defeito');
    });
    await kit.manager.adopt(tokens(1));
    stop();
    await kit.manager.signOut();
    assert.deepEqual(seen, ['signed_in'], 'depois de cancelar não recebe mais nada');
    assert.equal(kit.manager.getState().status, 'signed_out');
  });
});

describe('sanidade do kit de teste', () => {
  test('o serializador do cofre é o mesmo que o parser lê (ida e volta)', async () => {
    const kit = createKit({ initial: null });
    const original = tokens(7);
    await kit.storage.setItem(SESSION_KEY, serializeSession(original));
    assert.deepEqual(await kit.stored(), original);
  });
});
