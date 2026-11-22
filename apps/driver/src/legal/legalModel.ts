/**
 * Modelo PURO dos documentos legais exibidos no app (sem React, sem rede): converte o que o `api-client` devolve
 * (`legalCurrent()`, `error.current` do `409 consent_outdated`, `consent.pending` de `me()`) no que a tela renderiza, e
 * monta o que o aceite envia.
 *
 * Regra que este arquivo protege (M-2/M-3): a versão enviada no aceite é a do documento que a tela RENDERIZOU. Por isso
 * `consentPayload`/`reacceptPayload` só aceitam `LegalDocumentView` já convertido de uma resposta da API — não há
 * versão constante em nenhum lugar do app, e não existe caminho para "inventar" uma.
 *
 * Fica separado de `legalDocuments.ts` (store + hook, que importam `react-native`) para poder ser provado por unidade
 * com `node --import tsx`.
 */
import type {
  AcceptConsentsInput,
  CurrentLegal,
  LegalDocumentName,
  LegalDocumentView as ApiLegalDocument,
  PendingConsentDocument,
} from '@vuumbora/api-client/identity';

export type LegalKind = LegalDocumentName;

/** Texto NOSSO de cada documento (títulos e frases do aceite). Não vem do servidor e não tem versão. */
export const LEGAL_LABELS: Record<
  LegalKind,
  { readonly title: string; readonly shortTitle: string; readonly acceptLabel: string; readonly readLabel: string }
> = {
  terms: {
    title: 'Termos de Uso',
    // Cabeçalho estreito (320pt): `ScreenHeader` trunca título longo, sem reticências configuráveis.
    shortTitle: 'Termos de Uso',
    acceptLabel: 'Li e aceito os Termos de Uso',
    readLabel: 'Ler os Termos de Uso',
  },
  privacy: {
    title: 'Política de Privacidade',
    shortTitle: 'Privacidade',
    acceptLabel: 'Li e aceito a Política de Privacidade',
    readLabel: 'Ler a Política de Privacidade',
  },
};

export const LEGAL_KINDS: readonly LegalKind[] = ['terms', 'privacy'];

export interface LegalDocumentView {
  readonly kind: LegalKind;
  readonly title: string;
  readonly shortTitle: string;
  /** A versão que a tela exibe E que o aceite envia. Sempre veio da API (ou do mock, que a simula). */
  readonly version: string;
  /** Endereço do texto daquela versão (imutável). No mock é `.invalid`: não abre. */
  readonly url: string;
  /**
   * SHA-256 (hexadecimal minúsculo) do arquivo em `url`. A tela só EXIBE o texto baixado se os bytes baterem com ele
   * (B-6 da Órion, ver `VerifiedTextView` em `@vuumbora/ui`). No mock é zerado (fictício) e o texto é o provisório.
   */
  readonly sha256: string;
  /**
   * `true` quando a fonte é o MOCK (sem texto real): a tela mostra o texto provisório marcado em vez de abrir `url`.
   * Decidido pelo MODO do cliente, não por adivinhar o formato da URL.
   */
  readonly provisional: boolean;
  /** Texto provisório (só com `provisional`). Com texto real a tela abre `url`. */
  readonly paragraphs: readonly string[];
}

export interface LegalDocuments {
  readonly terms: LegalDocumentView;
  readonly privacy: LegalDocumentView;
}

const PROVISIONAL_NOTICE =
  'Este é um texto provisório, usado só na revisão do aplicativo. O documento definitivo ainda não foi publicado.';

function provisionalParagraphs(kind: LegalKind): readonly string[] {
  const name = kind === 'terms' ? 'dos Termos de Uso' : 'da Política de Privacidade';
  return [PROVISIONAL_NOTICE, `Aqui ficará o texto completo ${name} do VuumBora, na versão vigente no momento do aceite.`];
}

export function toLegalDocument(kind: LegalKind, source: ApiLegalDocument, provisional: boolean): LegalDocumentView {
  const labels = LEGAL_LABELS[kind];
  return {
    kind,
    title: labels.title,
    shortTitle: labels.shortTitle,
    version: source.version,
    url: source.url,
    sha256: source.sha256,
    provisional,
    paragraphs: provisional ? provisionalParagraphs(kind) : [],
  };
}

export function toLegalDocuments(current: CurrentLegal, provisional: boolean): LegalDocuments {
  return {
    terms: toLegalDocument('terms', current.terms, provisional),
    privacy: toLegalDocument('privacy', current.privacy, provisional),
  };
}

/** `consent.pending` de `me()` → os documentos a reaceitar, na ordem recebida (Termos antes da Política). */
export function pendingToLegalDocuments(
  pending: readonly PendingConsentDocument[],
  provisional: boolean,
): readonly LegalDocumentView[] {
  return pending.map((item) => toLegalDocument(item.document, item, provisional));
}

/**
 * Troca cada documento exibido pelo seu par em `current` (o `error.current` do `409`): mesmos documentos, texto novo.
 * Documento que `current` não traz de forma alguma não existe: `CurrentLegal` sempre vem com os dois.
 */
export function replaceWithCurrent(
  shown: readonly LegalDocumentView[],
  current: CurrentLegal,
  provisional: boolean,
): readonly LegalDocumentView[] {
  return shown.map((document) => toLegalDocument(document.kind, current[document.kind], provisional));
}

/** O que criar a conta envia sobre o aceite: as versões dos documentos que a tela RENDERIZOU. */
export function consentPayload(documents: LegalDocuments): {
  readonly termsAccepted: true;
  readonly privacyAccepted: true;
  readonly termsVersion: string;
  readonly privacyVersion: string;
} {
  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: documents.terms.version,
    privacyVersion: documents.privacy.version,
  };
}

/** O que o reaceite envia: só as versões dos documentos que a tela de reaceite RENDERIZOU (ao menos uma). */
export function reacceptPayload(shown: readonly LegalDocumentView[]): AcceptConsentsInput {
  const terms = shown.find((document) => document.kind === 'terms');
  const privacy = shown.find((document) => document.kind === 'privacy');
  return {
    ...(terms !== undefined ? { termsVersion: terms.version } : {}),
    ...(privacy !== undefined ? { privacyVersion: privacy.version } : {}),
  };
}

/** "os Termos de Uso", "a Política de Privacidade" ou "os Termos de Uso e a Política de Privacidade". */
export function describeDocuments(shown: readonly LegalDocumentView[]): string {
  const parts = shown.map((document) => (document.kind === 'terms' ? 'os Termos de Uso' : 'a Política de Privacidade'));
  return parts.join(' e ');
}
