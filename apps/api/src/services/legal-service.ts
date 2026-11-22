/**
 * Regra de negócio dos documentos legais e do aceite com a versão EXIBIDA (M-3, migração 0021). Sem HTTP aqui.
 *
 *  - "vigente" e "pendente" são DEFINIÇÕES do banco (`legal_current_versions`, `legal_pending_for_account`): a API as lê,
 *    nunca as reimplementa;
 *  - sem a URL base dos textos (`LEGAL_DOCUMENTS_BASE_URL`) ou sem versão publicada para o perfil, tudo que depende de
 *    mostrar/registrar o aceite fica INDISPONÍVEL (fail-closed): a API não registra aceite de texto que não pôde mostrar;
 *  - o aceite grava as versões que o cliente enviou, já conferidas como vigentes; o banco é a rede da corrida
 *    ("publicaram outra versão no meio"): a recusa dele vira o mesmo `outdated`.
 */
import type { Pool } from 'pg';
import type { AccountType } from '../domain/auth.js';
import { fromStoredDocument, LEGAL_DOCUMENTS, type ConsentStatus, type CurrentLegal, type LegalDocument, type LegalDocumentView, type PendingDocumentView } from '../domain/legal.js';
import { documentUrl, type LegalConfig } from '../lib/legal-config.js';
import { ConsentOutdatedError, findCurrentVersions, findPendingForAccount, insertConsents, type VersionRow } from '../repositories/legal-repository.js';
import type { Queryable } from '../repositories/identity-repository.js';

export { ConsentOutdatedError };

export type CurrentLegalResult =
  | { kind: 'ok'; current: CurrentLegal }
  /** `not_configured` = sem URL base dos textos; `not_published` = falta versão publicada de um dos DOIS documentos para o perfil. */
  | { kind: 'unavailable'; reason: 'not_configured' | 'not_published' };

function viewOf(config: LegalConfig, document: LegalDocument, audience: AccountType, row: VersionRow): LegalDocumentView {
  return { version: row.version, sha256: row.sha256, publishedAt: row.publishedAt.toISOString(), url: documentUrl(config, document, audience, row.version) };
}

/** A vigente dos DOIS documentos do perfil (corpo de `GET /v1/legal/current` e de `error.current`). */
export async function loadCurrentLegal(db: Queryable, config: LegalConfig | null, audience: AccountType): Promise<CurrentLegalResult> {
  if (!config) return { kind: 'unavailable', reason: 'not_configured' };
  const rows = await findCurrentVersions(db, audience);
  const byDocument = new Map(rows.map((row) => [fromStoredDocument(row.document), row]));
  const terms = byDocument.get('terms');
  const privacy = byDocument.get('privacy');
  if (!terms || !privacy) return { kind: 'unavailable', reason: 'not_published' };
  return { kind: 'ok', current: { audience, terms: viewOf(config, 'terms', audience, terms), privacy: viewOf(config, 'privacy', audience, privacy) } };
}

function statusOf(config: LegalConfig, audience: AccountType, pendingRows: readonly VersionRow[]): ConsentStatus {
  const pending: PendingDocumentView[] = pendingRows.map((row) => {
    const document = fromStoredDocument(row.document);
    return { document, ...viewOf(config, document, audience, row) };
  });
  // Ordem estável e documentada: Termos primeiro, depois a Política (o banco ordena pelo nome interno, que inverteria).
  pending.sort((a, b) => LEGAL_DOCUMENTS.indexOf(a.document) - LEGAL_DOCUMENTS.indexOf(b.document));
  return { upToDate: pending.length === 0, pending };
}

export type ConsentStatusResult =
  | { kind: 'ok'; status: ConsentStatus }
  | { kind: 'unavailable' }
  | { kind: 'account_missing' };

/** Está em dia? O que falta aceitar? Uma consulta a `legal_pending_for_account` (os dois documentos juntos, sem N+1). */
export async function getConsentStatus(db: Queryable, config: LegalConfig | null, accountId: string): Promise<ConsentStatusResult> {
  if (!config) return { kind: 'unavailable' };
  const found = await findPendingForAccount(db, accountId);
  if (!found) return { kind: 'account_missing' };
  return { kind: 'ok', status: statusOf(config, found.audience, found.pending) };
}

export type AcceptResult =
  | { kind: 'ok'; status: ConsentStatus }
  /** Alguma versão enviada não é a vigente do perfil: nada foi gravado. `current` é o que o app deve mostrar de novo. */
  | { kind: 'outdated'; current: CurrentLegal }
  | { kind: 'unavailable' }
  | { kind: 'account_missing' };

/**
 * Reaceite (`POST /v1/auth/consents`): cada versão enviada TEM de ser a vigente do perfil da conta, senão nada é gravado
 * (tudo ou nada). Idempotente: reaceitar a mesma versão não duplica (`ON CONFLICT DO NOTHING`).
 */
export async function acceptConsents(
  pool: Pool,
  config: LegalConfig | null,
  input: { accountId: string; termsVersion: string | undefined; privacyVersion: string | undefined; ipHash: string | null },
): Promise<AcceptResult> {
  if (!config) return { kind: 'unavailable' };
  const found = await findPendingForAccount(pool, input.accountId);
  if (!found) return { kind: 'account_missing' };
  const audience = found.audience;

  const gate = await loadCurrentLegal(pool, config, audience);
  if (gate.kind === 'unavailable') return { kind: 'unavailable' };
  const sent: { document: LegalDocument; version: string }[] = [];
  if (input.termsVersion !== undefined) sent.push({ document: 'terms', version: input.termsVersion });
  if (input.privacyVersion !== undefined) sent.push({ document: 'privacy', version: input.privacyVersion });
  if (sent.some((item) => item.version !== gate.current[item.document].version)) return { kind: 'outdated', current: gate.current };

  try {
    await insertConsents(pool, { accountId: input.accountId, items: sent, ipHash: input.ipHash });
  } catch (err) {
    // Corrida: publicaram outra versão entre a conferência e o INSERT. O banco recusou; relê a vigente para o corpo do 409.
    if (!(err instanceof ConsentOutdatedError)) throw err;
    const reread = await loadCurrentLegal(pool, config, audience);
    return reread.kind === 'ok' ? { kind: 'outdated', current: reread.current } : { kind: 'unavailable' };
  }
  const after = await findPendingForAccount(pool, input.accountId);
  if (!after) return { kind: 'account_missing' };
  return { kind: 'ok', status: statusOf(config, audience, after.pending) };
}

export type CommitmentGateResult =
  | { kind: 'ok' }
  /** Há aceite pendente: `pending` diz quais documentos; `current` é o que o app mostra na tela de reaceite. */
  | { kind: 'pending'; pending: readonly LegalDocument[]; current: CurrentLegal }
  | { kind: 'unavailable' }
  | { kind: 'account_missing' };

/** A conta pode assumir um compromisso NOVO (corrida, ficar online)? Só se não houver aceite pendente. */
export async function checkCommitmentConsent(db: Queryable, config: LegalConfig | null, accountId: string): Promise<CommitmentGateResult> {
  if (!config) return { kind: 'unavailable' };
  const found = await findPendingForAccount(db, accountId);
  if (!found) return { kind: 'account_missing' };
  if (found.pending.length === 0) return { kind: 'ok' };
  const gate = await loadCurrentLegal(db, config, found.audience);
  if (gate.kind === 'unavailable') return { kind: 'unavailable' };
  const pending = LEGAL_DOCUMENTS.filter((document) => found.pending.some((row) => fromStoredDocument(row.document) === document));
  return { kind: 'pending', pending, current: gate.current };
}
