/**
 * Fixtures do catálogo de versões legais (migração 0021). Importar `./setup.js` ANTES deste arquivo.
 *
 * O CATÁLOGO É IMUTÁVEL (nem o dono apaga, nem trunca), então "voltar ao estado conhecido" não é DELETE:
 * `resetLegalCatalog` faz `TRUNCATE legal_document_versions CASCADE` com `SET LOCAL session_replication_role = replica`
 * (desliga o gatilho `legal_document_versions_no_truncate` só naquela transação). ESCOLHA, em vez de um banco `_test`
 * dedicado por arquivo:
 *   1. dá catálogo VAZIO e baseline conhecido a cada arquivo, também em banco que PERSISTE entre execuções (um banco
 *      dedicado persistente acumularia versões e nunca mais teria "nada publicado");
 *   2. não exige segundo banco para migrar (as 21 migrações + papel) em toda execução da suíte;
 *   3. o gatilho de imutabilidade segue provado à parte (legal-catalog-db.test.ts) e este atalho fica confinado ao teste:
 *      recusa banco que não termine em `_test`, a opção é `SET LOCAL` (nunca vaza para a conexão devolvida ao pool) e exige
 *      superusuário, que o banco de teste já pressupõe (a suíte usa `SET ROLE`).
 * O CASCADE leva junto `account_consents` inteira (única tabela que aponta para o catálogo): cada arquivo começa do zero.
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

export const BASELINE_VERSION = 'teste-2026-11';
/** URL base dos textos nos testes (a API só monta o endereço; nada é baixado). */
export const LEGAL_BASE_URL = 'https://textos.teste.vuumbora.dev/legal';

export type StoredDocument = 'terms_of_use' | 'privacy_policy';
export type Audience = 'passenger' | 'driver';
export const STORED_DOCUMENTS: readonly StoredDocument[] = ['terms_of_use', 'privacy_policy'];
export const AUDIENCES: readonly Audience[] = ['passenger', 'driver'];

/** Texto determinístico por (documento, perfil, versão): o hash publicado é o hash desse texto. */
export function textFor(document: StoredDocument, audience: Audience, version: string): string {
  return `Texto de teste de ${document} para ${audience}, versão ${version}.\n`;
}
export function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
export function sha256For(document: StoredDocument, audience: Audience, version: string): string {
  return sha256Of(textFor(document, audience, version));
}

export interface PublishInput {
  readonly document: StoredDocument;
  readonly audience: Audience;
  readonly version: string;
  readonly requiresReacceptance?: boolean;
  /** Hash explícito (para testar hash errado); o padrão é o do texto determinístico. */
  readonly sha256?: string;
}

/** Publica UMA versão (credencial DONA: o papel da API não tem INSERT no catálogo). */
export async function publishVersion(owner: Pick<Pool, 'query'>, input: PublishInput): Promise<void> {
  await owner.query(
    `INSERT INTO legal_document_versions (document, audience, version, text_sha256, requires_reacceptance) VALUES ($1, $2, $3, $4, $5)`,
    [input.document, input.audience, input.version, input.sha256 ?? sha256For(input.document, input.audience, input.version), input.requiresReacceptance ?? true],
  );
}

/** Publica a mesma versão nos DOIS documentos, para os perfis pedidos (padrão: os dois). Uma linha por (documento, perfil). */
export async function publishAll(owner: Pick<Pool, 'query'>, version: string, options: { requiresReacceptance?: boolean; audiences?: readonly Audience[] } = {}): Promise<void> {
  for (const audience of options.audiences ?? AUDIENCES) {
    for (const document of STORED_DOCUMENTS) {
      await publishVersion(owner, { document, audience, version, ...(options.requiresReacceptance !== undefined ? { requiresReacceptance: options.requiresReacceptance } : {}) });
    }
  }
}

/** Esvazia o catálogo (e, em cascata, `account_consents`). Só em banco `_test`. Ver o cabeçalho para a justificativa. */
export async function resetLegalCatalog(owner: Pool): Promise<void> {
  const client = await owner.connect();
  try {
    const name = (await client.query<{ db: string }>('SELECT current_database() AS db')).rows[0]!.db;
    if (!name.endsWith('_test')) throw new Error(`resetLegalCatalog só roda em banco terminado em "_test" (encontrado: "${name}")`);
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query('TRUNCATE legal_document_versions CASCADE');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Catálogo conhecido para os testes de identidade: a versão baseline nos 4 pares (documento x perfil), e só ela. */
export async function resetToBaseline(owner: Pool): Promise<void> {
  await resetLegalCatalog(owner);
  await publishAll(owner, BASELINE_VERSION);
}

/**
 * Garante o baseline sem apagar nada quando ele já é o estado atual (o caso comum: o banco persiste entre execuções).
 * Se outro arquivo deixou o catálogo diferente (versão a mais, vazio), refaz do zero.
 */
export async function ensureBaseline(owner: Pool): Promise<void> {
  const rows = (await owner.query<{ version: string }>('SELECT version FROM legal_document_versions')).rows;
  if (rows.length === STORED_DOCUMENTS.length * AUDIENCES.length && rows.every((row) => row.version === BASELINE_VERSION)) return;
  await resetToBaseline(owner);
}

/** Cria uma conta ativa (credencial DONA; a API cria conta pelo cadastro). Devolve o id. */
export async function insertAccount(owner: Pick<Pool, 'query'>, accountType: Audience, label = 'conta'): Promise<string> {
  const email = `${label}-${Math.random().toString(36).slice(2, 10)}@teste.vuumbora.dev`;
  const result = await owner.query<{ id: string }>(
    `INSERT INTO accounts (account_type, email, full_name, birth_date) VALUES ($1, $2, 'Pessoa de Teste', '1990-05-15') RETURNING id`,
    [accountType, email],
  );
  return result.rows[0]!.id;
}
