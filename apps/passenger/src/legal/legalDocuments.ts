/**
 * PONTO ÚNICO dos documentos legais exibidos no cadastro (Termos de Uso e Política de Privacidade) — fatia B3.
 *
 * Os textos e as versões vêm de `identity.legalCurrent()` (`GET /v1/legal/current`). Este arquivo guarda UMA cópia em
 * memória, compartilhada por todas as telas (cadastro, `/termos`, `/privacidade`): a tela do documento mostra a mesma
 * versão que o cadastro mostra e envia. O aceite prova "o que a pessoa VIU" (M-2), então:
 *  - o cadastro só habilita o envio com `ready`; carregando/erro não mostram caixa de aceite alguma (marcar um aceite
 *    sobre um texto que ainda não está na tela não vale nada);
 *  - as versões enviadas são as de `documents` (`consentPayload` em `legalModel.ts`) — nenhuma constante no app;
 *  - `409 consent_outdated` troca a cópia (`adopt(error.current)`, ou `load()` se o erro veio sem `current`) e a tela
 *    desmarca os aceites: o app NUNCA reenvia sozinho.
 *
 * Em `mode: 'mock'` o texto é PROVISÓRIO e fica marcado (o mock tem `url` `.invalid` e `sha256` zerado). Em `http` a
 * tela abre o texto da `url` (`openLegalDocument`).
 */
import { useEffect, useMemo } from 'react';
import { Linking } from 'react-native';
import { create } from 'zustand';
import type { ApiError } from '@vuumbora/api-client';
import type { CurrentLegal } from '@vuumbora/api-client/identity';
import { describeAuthError, type AuthErrorView } from '../identity/authErrors';
import { identity } from '../identity/identityClient';
import { safeCall } from '../identity/safeCall';
import { openableUrl, toLegalDocuments, type LegalDocuments, type LegalDocumentView } from './legalModel';

export { LEGAL_LABELS, consentPayload, type LegalDocuments, type LegalDocumentView, type LegalKind } from './legalModel';

/** Rota que abre o texto de cada documento (grupo `(auth)`: só existe sem sessão). */
export const LEGAL_ROUTE = { terms: '/termos', privacy: '/privacidade' } as const;

/**
 * A API manda `Cache-Control: public, max-age=60`. Uma cópia mais nova que isto vale; mais velha é buscada de novo ao
 * abrir o cadastro. (Se mudar entre a abertura e o envio, o `409` corrige.)
 */
const FRESH_FOR_MS = 60_000;

type Snapshot =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiError }
  | { readonly status: 'ready'; readonly documents: LegalDocuments; readonly loadedAt: number };

const isStale = (snapshot: { readonly loadedAt: number }): boolean => Date.now() - snapshot.loadedAt >= FRESH_FOR_MS;

interface LegalStoreState {
  readonly snapshot: Snapshot;
  /** Busca sempre (o botão "tentar de novo"). */
  load(): Promise<void>;
  /** Busca só se ainda não há cópia (telas dos documentos): nunca troca uma cópia pronta por baixo de quem a lê. */
  ensure(): void;
  /** Cadastro ao abrir: busca de novo se a cópia está velha. */
  refreshIfStale(): void;
  /** `409 consent_outdated` trouxe a vigente: passa a valer ELA, e qualquer busca em voo fica obsoleta. */
  adopt(current: CurrentLegal): void;
}

// Só a resposta do pedido MAIS RECENTE vale: uma busca lenta que chega depois de `adopt` não pode desfazê-lo.
let latestRequest = 0;

const provisionalSource = (): boolean => identity.mode === 'mock';

const readySnapshot = (current: CurrentLegal): Snapshot => ({
  status: 'ready',
  documents: toLegalDocuments(current, provisionalSource()),
  loadedAt: Date.now(),
});

export const useLegalStore = create<LegalStoreState>((set, get) => ({
  snapshot: { status: 'idle' },

  load: async () => {
    latestRequest += 1;
    const request = latestRequest;
    set({ snapshot: { status: 'loading' } });
    const result = await safeCall(() => identity.legalCurrent());
    if (request !== latestRequest) return;
    set({ snapshot: result.ok ? readySnapshot(result.data) : { status: 'error', error: result.error } });
  },

  ensure: () => {
    const { snapshot, load } = get();
    if (snapshot.status === 'idle' || snapshot.status === 'error') void load();
  },

  refreshIfStale: () => {
    const { snapshot, load } = get();
    if (snapshot.status === 'loading') return;
    if (snapshot.status === 'ready' && !isStale(snapshot)) return;
    void load();
  },

  adopt: (current) => {
    latestRequest += 1;
    set({ snapshot: readySnapshot(current) });
  },
}));

export type LegalDocumentsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly view: AuthErrorView; readonly retry: () => void }
  | { readonly status: 'ready'; readonly documents: LegalDocuments };

/** Falha ao carregar os textos: o aviso de sempre (`describeAuthError`), sem contagem (o botão deixa tentar de novo). */
function loadErrorView(error: ApiError): AuthErrorView {
  const view = describeAuthError('consent', error);
  // Monta o aviso campo a campo, SEM `retryAfterSeconds`: `AuthErrorAlert` com esse campo e sem contagem mostraria
  // "Pronto, você já pode tentar de novo" na hora. Aqui não há espera: o botão deixa tentar quando a pessoa quiser.
  return {
    key: view.key,
    tone: view.tone,
    ...(view.title !== undefined ? { title: view.title } : {}),
    message: view.message,
    presentation: 'alert',
    actions: ['retry'],
  };
}

/**
 * Os Termos e a Política em um de três estados. `refreshIfStale` é só do cadastro (quem ENVIA); as telas dos
 * documentos usam o padrão (`ensure`) e mostram a cópia que o cadastro já tem.
 */
export function useLegalDocuments(options: { readonly refreshIfStale?: boolean } = {}): LegalDocumentsState {
  const snapshot = useLegalStore((state) => state.snapshot);
  const refresh = options.refreshIfStale === true;

  useEffect(() => {
    const store = useLegalStore.getState();
    if (refresh) store.refreshIfStale();
    else store.ensure();
  }, [refresh]);

  return useMemo<LegalDocumentsState>(() => {
    // Quem vai ENVIAR (`refresh`) não mostra, nem por um quadro, uma cópia velha: o efeito acima já a busca de novo.
    if (snapshot.status === 'ready' && !(refresh && isStale(snapshot))) {
      return { status: 'ready', documents: snapshot.documents };
    }
    if (snapshot.status === 'error') {
      return { status: 'error', view: loadErrorView(snapshot.error), retry: () => void useLegalStore.getState().load() };
    }
    return { status: 'loading' };
  }, [snapshot, refresh]);
}

/**
 * `409 consent_outdated` no cadastro: troca a cópia pela vigente. Com `error.current` (já validado pelo `api-client`) a
 * tela mostra ESSES textos; sem ele busca de novo (`legalCurrent`). Não reenvia nada.
 */
export function refreshLegalAfterOutdated(error: ApiError): void {
  const store = useLegalStore.getState();
  if (error.current !== undefined) store.adopt(error.current);
  else void store.load();
}

export type OpenDocumentResult = 'opened' | 'unavailable';

/**
 * Abre o texto de uma versão no navegador do sistema. Único ponto que entrega `url` ao sistema.
 *
 * TODO(A3 · B-6 da Órion): ANTES de abrir, baixar o texto de `document.url`, calcular o SHA-256 (A3 traz o
 * `expo-crypto`) e comparar com `document.sha256`; divergência = não mostrar o texto e avisar. Hoje NADA confere o
 * hash: o `url` é aberto como a API o entregou (por isso só `https`).
 */
export async function openLegalDocument(document: LegalDocumentView): Promise<OpenDocumentResult> {
  const url = openableUrl(document.url, __DEV__);
  if (url === null) return 'unavailable';
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'unavailable';
  }
}
