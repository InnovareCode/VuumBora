/**
 * PONTO ÚNICO dos documentos legais exibidos no cadastro (Termos de Uso e Política de Privacidade).
 *
 * HOJE (B1): texto PROVISÓRIO, marcado como provisório na tela. Os textos reais dependem do dono (advogado) e da
 * decisão de haver Termos diferentes para passageiro e motorista (plano, seção 5).
 *
 * B3 (aceite com versão exibida, M-3) troca SÓ este arquivo:
 *   1. `useLegalDocuments()` passa a buscar `GET /v1/legal/current?audience=passenger` (estados carregando/erro: o
 *      tipo de retorno vira união e o compilador aponta cada tela que precisa tratar o que hoje nunca acontece);
 *   2. `LegalDocumentView.version`/`url` passam a vir do servidor (a tela do documento abre o texto DAQUELA versão);
 *   3. `consentPayload()` passa a levar `termsVersion` e `privacyVersion` (as versões EXIBIDAS) para o cadastro, e
 *      `409 consent_outdated` entra em `authErrors.ts` (recarrega os textos e pede o aceite de novo).
 * Nada fora deste arquivo deve conhecer de onde vem o texto ou qual é a versão.
 */

export type LegalKind = 'terms' | 'privacy';

export interface LegalDocumentView {
  readonly kind: LegalKind;
  readonly title: string;
  /** Para cabeçalho de tela estreito (320pt): `ScreenHeader` trunca título longo, sem reticências configuráveis. */
  readonly shortTitle: string;
  /** Versão exibida. `null` = texto provisório, sem versão publicada (B3: vem do servidor). */
  readonly version: string | null;
  /** `true` enquanto o texto não for o publicado: a tela mostra a marca "texto provisório" e não "versão X". */
  readonly provisional: boolean;
  readonly paragraphs: readonly string[];
}

export interface LegalDocuments {
  readonly terms: LegalDocumentView;
  readonly privacy: LegalDocumentView;
}

const PROVISIONAL_NOTICE =
  'Este é um texto provisório, usado só na revisão do aplicativo. O documento definitivo ainda não foi publicado.';

const DOCUMENTS: LegalDocuments = {
  terms: {
    kind: 'terms',
    title: 'Termos de Uso',
    shortTitle: 'Termos de Uso',
    version: null,
    provisional: true,
    paragraphs: [
      PROVISIONAL_NOTICE,
      'Aqui ficará o texto completo dos Termos de Uso do VuumBora, na versão vigente no momento do cadastro.',
    ],
  },
  privacy: {
    kind: 'privacy',
    title: 'Política de Privacidade',
    shortTitle: 'Privacidade',
    version: null,
    provisional: true,
    paragraphs: [
      PROVISIONAL_NOTICE,
      'Aqui ficará o texto completo da Política de Privacidade do VuumBora, na versão vigente no momento do cadastro.',
    ],
  },
};

/** B3: vira `{ status: 'loading' } | { status: 'error' } | { status: 'ready', documents }`. */
export function useLegalDocuments(): { readonly status: 'ready'; readonly documents: LegalDocuments } {
  return { status: 'ready', documents: DOCUMENTS };
}

/** Rota que abre o texto de cada documento. */
export const LEGAL_ROUTE = { terms: '/termos', privacy: '/privacidade' } as const;

/**
 * O que o cadastro envia sobre o aceite. Hoje o contrato só pede os dois `true` (a versão gravada é a do servidor).
 * B3: acrescentar `termsVersion` e `privacyVersion` = as versões de `documents` que a pessoa VIU ao marcar.
 */
export function consentPayload(): { readonly termsAccepted: true; readonly privacyAccepted: true } {
  return { termsAccepted: true, privacyAccepted: true };
}
