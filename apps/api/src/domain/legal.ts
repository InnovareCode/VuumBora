/**
 * Regras puras dos documentos legais (Termos de Uso e Política de Privacidade): nomes, formato de versão e
 * validação de entrada. Sem I/O. Estrutura de dados: migração 0021; contrato: docs/contrato-identidade-apps.md.
 *
 * Dois vocabulários, de propósito: o JSON da API fala `terms`/`privacy`; o banco guarda `terms_of_use`/`privacy_policy`
 * (valores do CHECK da 0019). A tradução mora SÓ aqui.
 */
import { z } from 'zod';
import type { AccountType } from './auth.js';

export type LegalDocument = 'terms' | 'privacy';
export type StoredLegalDocument = 'terms_of_use' | 'privacy_policy';

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = ['terms', 'privacy'];
export const LEGAL_AUDIENCES: readonly AccountType[] = ['passenger', 'driver'];

const STORED_NAME: Record<LegalDocument, StoredLegalDocument> = { terms: 'terms_of_use', privacy: 'privacy_policy' };

export function toStoredDocument(document: LegalDocument): StoredLegalDocument {
  return STORED_NAME[document];
}

export function fromStoredDocument(stored: string): LegalDocument {
  if (stored === 'terms_of_use') return 'terms';
  if (stored === 'privacy_policy') return 'privacy';
  throw new Error('legal_document_unknown');
}

/** Mesmo formato do CHECK `legal_document_versions_version_format` (0021) e de `account_consents.version` (0019). */
export const LEGAL_VERSION_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/;

/** A versão que o app EXIBIU. Sem `trim`: espaço sobrando é versão malformada, não a mesma versão. */
export const legalVersionSchema = z.string().regex(LEGAL_VERSION_FORMAT);

export const legalCurrentQuerySchema = z.object({ audience: z.enum(['passenger', 'driver']) });

/**
 * `POST /v1/auth/consents`: ao menos uma das duas versões. Problema em qualquer campo (ausente nas duas, tipo errado,
 * formato inválido) cai no caminho do campo, que a rota traduz em `400 consent_required`.
 */
export const consentsBodySchema = z
  .object({ termsVersion: legalVersionSchema.optional(), privacyVersion: legalVersionSchema.optional() })
  .refine((body) => body.termsVersion !== undefined || body.privacyVersion !== undefined, { path: ['termsVersion'] });

/** Um documento vigente (ou pendente) como a API o mostra. `url` aponta para texto imutável por versão. */
export interface LegalDocumentView {
  readonly version: string;
  /** SHA-256 hex minúsculo do arquivo exato servido em `url`. */
  readonly sha256: string;
  readonly publishedAt: string;
  readonly url: string;
}

/** Corpo de `GET /v1/legal/current` e de `error.current` do 409: sempre os DOIS documentos do perfil. */
export interface CurrentLegal {
  readonly audience: AccountType;
  readonly terms: LegalDocumentView;
  readonly privacy: LegalDocumentView;
}

export interface PendingDocumentView extends LegalDocumentView {
  readonly document: LegalDocument;
}

/** `consent` de `GET /me` e da resposta de `POST /consents`. `upToDate` = nenhum documento pendente. */
export interface ConsentStatus {
  readonly upToDate: boolean;
  readonly pending: readonly PendingDocumentView[];
}
