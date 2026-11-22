/**
 * Camada de dados dos documentos legais e do aceite (migração 0021). A API só LÊ o catálogo
 * (`legal_current_versions`, `legal_pending_for_account`) e só INSERE em `account_consents`; quem publica versão é o
 * operador, com a credencial dona (`src/lib/legal-publish.ts`).
 */
import type { AccountType } from '../domain/auth.js';
import { toStoredDocument, type LegalDocument } from '../domain/legal.js';
import type { Queryable } from './identity-repository.js';

/** Uma versão vigente (ou pendente) como o banco a devolve. `publishedAt` é do relógio do banco, só para exibir. */
export interface VersionRow {
  readonly document: string;
  readonly version: string;
  readonly sha256: string;
  readonly publishedAt: Date;
}

/** O banco recusou a versão aceita: nunca foi publicada para o perfil, ou já foi substituída por outra mais nova. */
export class ConsentOutdatedError extends Error {
  constructor() {
    super('consent_outdated');
  }
}

/** A vigente de cada documento do perfil (a view `legal_current_versions`: no máximo uma linha por documento). */
export async function findCurrentVersions(db: Queryable, audience: AccountType): Promise<VersionRow[]> {
  const result = await db.query<{ document: string; version: string; text_sha256: string; published_at: Date }>(
    `SELECT document, version, text_sha256, published_at FROM legal_current_versions WHERE audience = $1`,
    [audience],
  );
  return result.rows.map((row) => ({ document: row.document, version: row.version, sha256: row.text_sha256, publishedAt: row.published_at }));
}

export interface PendingForAccount {
  readonly audience: AccountType;
  readonly pending: VersionRow[];
}

/**
 * O que a conta ainda precisa aceitar: a versão VIGENTE de cada documento pendente. A REGRA mora em
 * `legal_pending_for_account` (0021) e não é reimplementada aqui. Uma consulta só, e já devolve o perfil da conta
 * (para montar a URL). `null` = a conta não existe.
 */
export async function findPendingForAccount(db: Queryable, accountId: string): Promise<PendingForAccount | null> {
  const result = await db.query<{ audience: AccountType; document: string | null; version: string | null; text_sha256: string | null; published_at: Date | null }>(
    `SELECT a.account_type AS audience, p.document, p.version, p.text_sha256, p.published_at
       FROM accounts a
       LEFT JOIN LATERAL legal_pending_for_account(a.id) p ON true
      WHERE a.id = $1
      ORDER BY p.document`,
    [accountId],
  );
  const first = result.rows[0];
  if (!first) return null;
  const pending: VersionRow[] = [];
  for (const row of result.rows) {
    if (row.document !== null && row.version !== null && row.text_sha256 !== null && row.published_at !== null) {
      pending.push({ document: row.document, version: row.version, sha256: row.text_sha256, publishedAt: row.published_at });
    }
  }
  return { audience: first.audience, pending };
}

/**
 * Registra o aceite das versões que a pessoa VIU, numa instrução só (tudo ou nada). A aplicação informa apenas
 * `(conta, documento, versão, HMAC do IP)`: `audience`, `text_sha256` e `accepted_at` são do banco, que descarta o
 * que a aplicação mandar (gatilho `account_consents_guard`). `ON CONFLICT DO NOTHING` torna o reenvio da MESMA versão
 * idempotente (o gatilho ainda confere, antes, que ela segue vigente). Versão que o banco recusa vira
 * `ConsentOutdatedError`; qualquer outro erro sobe como está.
 */
export async function insertConsents(
  db: Queryable,
  input: { accountId: string; items: readonly { document: LegalDocument; version: string }[]; ipHash: string | null },
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO account_consents (account_id, document, version, ip_hash)
       SELECT $1::uuid, t.document, t.version, $4::text
         FROM unnest($2::text[], $3::text[]) AS t(document, version)
       ON CONFLICT (account_id, document, version) DO NOTHING`,
      [input.accountId, input.items.map((item) => toStoredDocument(item.document)), input.items.map((item) => item.version), input.ipHash],
    );
  } catch (err) {
    const { code, constraint } = err as { code?: string; constraint?: string };
    if (code === '23503' && constraint === 'account_consents_version_published') throw new ConsentOutdatedError();
    if (code === '23514' && constraint === 'account_consents_version_current') throw new ConsentOutdatedError();
    throw err;
  }
}
