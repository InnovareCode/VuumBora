/**
 * `createGuardedSessionStorage` — a verificação da primeira execução, com cofre e marcador falsos.
 * Cada teste existe por uma regra escrita em `src/device/sessionVault.ts`; o roteiro de mutação (ver o handoff) desfaz
 * cada regra e confere que ao menos um destes testes cai.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGuardedSessionStorage, type InstallMarker, type KeyValueStorage } from '../src/device/sessionVault';

const SESSION = 'vuumbora.passenger.session';
const INSTALLATION = 'vuumbora.passenger.installation_id';
const PENDING = 'vuumbora.passenger.pending_revocations';
const APP_KEYS = [SESSION, INSTALLATION, PENDING] as const;
const OTHER_PROFILE = 'vuumbora.driver.session';

function makeVault(initial: Record<string, string> = {}) {
  const items = new Map<string, string>(Object.entries(initial));
  const log: string[] = [];
  const failRemove = new Set<string>();
  const vault: KeyValueStorage = {
    getItem: async (key) => {
      log.push(`get:${key}`);
      return items.get(key) ?? null;
    },
    setItem: async (key, value) => {
      log.push(`set:${key}`);
      items.set(key, value);
    },
    removeItem: async (key) => {
      log.push(`remove:${key}`);
      // Um cofre que ecoa o valor na mensagem de erro: a guarda não pode repassá-la (o valor é um token).
      if (failRemove.has(key)) throw new Error(`boom (valor: ${items.get(key) ?? ''})`);
      items.delete(key);
    },
  };
  return { vault, items, log, failRemove };
}

function makeMarker(initiallySet = false) {
  const state = { set: initiallySet, failRead: false, failWrite: false, writes: 0, reads: 0 };
  const marker: InstallMarker = {
    isSet: async () => {
      state.reads += 1;
      if (state.failRead) throw new Error('boom');
      return state.set;
    },
    set: async () => {
      if (state.failWrite) throw new Error('boom');
      state.writes += 1;
      state.set = true;
    },
  };
  return { marker, state };
}

const guarded = (vault: KeyValueStorage, marker: InstallMarker | null) =>
  createGuardedSessionStorage({ vault, marker, keysToWipe: APP_KEYS });

describe('primeira execução (marcador ausente)', () => {
  it('apaga as três chaves do app e só depois grava o marcador', async () => {
    const { vault, items, log } = makeVault({ [SESSION]: 'velha', [INSTALLATION]: 'id-velho', [PENDING]: 'fila-velha' });
    const { marker, state } = makeMarker(false);
    const order: string[] = [];
    const orderedMarker: InstallMarker = {
      isSet: marker.isSet,
      set: async () => {
        order.push(`marker.set depois de ${log.filter((entry) => entry.startsWith('remove:')).length} remoções`);
        await marker.set();
      },
    };
    const storage = guarded(vault, orderedMarker);
    await storage.ready();

    assert.equal(items.size, 0, 'o cofre foi limpo');
    assert.equal(state.set, true, 'o marcador foi gravado');
    assert.deepEqual(order, ['marker.set depois de 3 remoções'], 'marcador só DEPOIS de apagar as três');
    assert.equal(await storage.getItem(SESSION), null);
  });

  it('só apaga as chaves informadas: o resto do cofre (inclusive o outro perfil) fica', async () => {
    const { vault, items } = makeVault({ [SESSION]: 'velha', [OTHER_PROFILE]: 'do-motorista', 'outra.coisa': 'x' });
    await guarded(vault, makeMarker(false).marker).ready();
    assert.equal(items.has(SESSION), false);
    assert.equal(items.get(OTHER_PROFILE), 'do-motorista');
    assert.equal(items.get('outra.coisa'), 'x');
  });

  it('quando não há nada no cofre também grava o marcador (a próxima abertura não repete)', async () => {
    const { vault } = makeVault();
    const { marker, state } = makeMarker(false);
    await guarded(vault, marker).ready();
    assert.equal(state.writes, 1);
  });
});

describe('abertura seguinte (marcador presente)', () => {
  it('não apaga nada e entrega o que o cofre tem', async () => {
    const { vault, items, log } = makeVault({ [SESSION]: 'da-instalacao-atual' });
    const { marker, state } = makeMarker(true);
    const storage = guarded(vault, marker);
    assert.equal(await storage.getItem(SESSION), 'da-instalacao-atual');
    assert.equal(log.some((entry) => entry.startsWith('remove:')), false, 'nenhuma remoção');
    assert.equal(state.writes, 0);
    assert.equal(items.get(SESSION), 'da-instalacao-atual');
  });

  it('a verificação roda UMA vez por processo, mesmo com várias operações', async () => {
    const { vault } = makeVault();
    const { marker, state } = makeMarker(true);
    const storage = guarded(vault, marker);
    await Promise.all([storage.getItem(SESSION), storage.getItem(INSTALLATION), storage.setItem(PENDING, 'x'), storage.removeItem(SESSION)]);
    await storage.getItem(SESSION);
    assert.equal(state.reads, 1);
  });
});

describe('ordem: nada passa antes da verificação', () => {
  it('uma escrita feita DURANTE a verificação não é apagada por ela', async () => {
    const { vault, items } = makeVault({ [SESSION]: 'velha' });
    const { marker } = makeMarker(false);
    const storage = guarded(vault, marker);
    // Duas chamadas sobrepostas, antes de a verificação terminar: a leitura não pode ver a velha, a escrita tem de ficar.
    const [read] = await Promise.all([storage.getItem(SESSION), storage.setItem(SESSION, 'nova')]);
    assert.equal(read, null, 'a sessão velha nunca é entregue');
    assert.equal(items.get(SESSION), 'nova', 'a nova sobreviveu ao apagar inicial');
  });
});

describe('ordem: remover também espera', () => {
  it('uma remoção feita DURANTE a verificação acontece depois do apagar inicial', async () => {
    const { vault, log } = makeVault({ [SESSION]: 'velha' });
    const storage = guarded(vault, makeMarker(false).marker);
    await storage.removeItem(PENDING);
    assert.deepEqual(
      log,
      [`remove:${SESSION}`, `remove:${INSTALLATION}`, `remove:${PENDING}`, `remove:${PENDING}`],
      'as três do apagar inicial vêm primeiro; a remoção pedida pelo app, por último',
    );
  });

  it('com a verificação falhando, remover também rejeita (nada passa por um cofre não verificado)', async () => {
    const { vault, failRemove } = makeVault({ [SESSION]: 'velha' });
    failRemove.add(SESSION);
    await assert.rejects(() => guarded(vault, makeMarker(false).marker).removeItem(PENDING), /limpar o cofre/);
  });
});

describe('falhas (falha fechada, tenta de novo na abertura seguinte)', () => {
  it('apagar uma chave falha: rejeita, NÃO grava o marcador, e as outras chaves foram tentadas mesmo assim', async () => {
    const { vault, items, failRemove } = makeVault({ [SESSION]: 'velha', [INSTALLATION]: 'id-velho', [PENDING]: 'fila' });
    failRemove.add(INSTALLATION);
    const { marker, state } = makeMarker(false);
    const storage = guarded(vault, marker);

    await assert.rejects(() => storage.ready(), /limpar o cofre/);
    assert.equal(state.set, false, 'marcador NÃO foi gravado');
    assert.equal(items.has(SESSION), false, 'as outras chaves foram apagadas');
    assert.equal(items.has(PENDING), false);
    assert.equal(items.get(INSTALLATION), 'id-velho', 'a que falhou continua lá');

    // Enquanto não verificou, nada passa: nem leitura da chave que sobrou, nem escrita.
    await assert.rejects(() => storage.getItem(INSTALLATION));
    await assert.rejects(() => storage.setItem(SESSION, 'nova'));

    // O cofre volta ao normal: a próxima tentativa conclui.
    failRemove.clear();
    await storage.ready();
    assert.equal(state.set, true);
    assert.equal(items.size, 0);
  });

  it('não gravar o marcador rejeita as operações e a tentativa seguinte refaz tudo', async () => {
    const { vault } = makeVault({ [SESSION]: 'velha' });
    const { marker, state } = makeMarker(false);
    state.failWrite = true;
    const storage = guarded(vault, marker);
    await assert.rejects(() => storage.getItem(SESSION), /gravar o marcador/);
    state.failWrite = false;
    assert.equal(await storage.getItem(SESSION), null);
    assert.equal(state.set, true);
  });

  it('não conseguir LER o marcador rejeita (sem saber se é reinstalação, o cofre não é confiável)', async () => {
    const { vault, items } = makeVault({ [SESSION]: 'pode-ser-de-outra-instalacao' });
    const { marker, state } = makeMarker(false);
    state.failRead = true;
    const storage = guarded(vault, marker);
    await assert.rejects(() => storage.getItem(SESSION), /ler o marcador/);
    assert.equal(items.get(SESSION), 'pode-ser-de-outra-instalacao', 'não apagou às cegas');
  });

  it('a mensagem de erro não carrega valores do cofre', async () => {
    const { vault, failRemove } = makeVault({ [SESSION]: 'TOKEN-SECRETO-123' });
    failRemove.add(SESSION);
    await assert.rejects(
      () => guarded(vault, makeMarker(false).marker).ready(),
      (error: Error) => !error.message.includes('TOKEN-SECRETO-123'),
    );
  });
});

describe('sem marcador (Android, web)', () => {
  it('nada é apagado: o cofre é só repassado', async () => {
    const { vault, items, log } = makeVault({ [SESSION]: 'sessao-valida' });
    const storage = guarded(vault, null);
    assert.equal(await storage.getItem(SESSION), 'sessao-valida');
    await storage.setItem(PENDING, 'x');
    await storage.removeItem(PENDING);
    assert.equal(items.get(SESSION), 'sessao-valida');
    assert.deepEqual(log, [`get:${SESSION}`, `set:${PENDING}`, `remove:${PENDING}`]);
  });
});
