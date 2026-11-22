/**
 * PONTO ÚNICO dos documentos legais exibidos ao criar a conta (Termos de Uso e Política de Privacidade) — fatia B2,
 * sobre o desenho da B3 do passageiro. Perfil `driver`: o `GET /v1/legal/current?audience=driver` é quem decide as
 * versões dos documentos do MOTORISTA (podem diferir das do passageiro).
 *
 * Os textos e as versões vêm de `identity.legalCurrent()`. Este arquivo guarda UMA cópia em memória, compartilhada por
 * todas as telas (criar conta, `/termos`, `/privacidade`): a tela do documento mostra a mesma versão que o formulário
 * mostra e envia. O aceite prova "o que a pessoa VIU" (M-2), então:
 *  - criar a conta só habilita o envio com `ready`; carregando/erro não mostram caixa de aceite alguma (marcar um aceite
 *    sobre um texto que ainda não está na tela não vale nada);
 *  - as versões enviadas são as de `documents` (`consentPayload` em `legalModel.ts`) — nenhuma constante no app;
 *  - `409 consent_outdated` troca a cópia (`adopt(error.current)`, ou `load()` se o erro veio sem `current`) e a tela
 *    desmarca os aceites: o app NUNCA reenvia sozinho.
 *
 * Em `mode: 'mock'` o texto é PROVISÓRIO e fica marcado (o mock tem `url` `.invalid` e `sha256` zerado). Em `http` a
 * tela baixa o texto da `url`, confere o SHA-256 dos bytes com o `sha256` da resposta e SÓ ENTÃO o exibe
 * (`VerifiedTextView`, `@vuumbora/ui`; B-6 da revisão de segurança): este arquivo não entrega `url` a ninguém.
 */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { ApiError } from '@vuumbora/api-client';
import type { CurrentLegal } from '@vuumbora/api-client/identity';
import { describeAuthError, type AuthErrorView } from '../identity/authErrors';
import { identity } from '../identity/identityClient';
import { safeCall } from '../identity/safeCall';
import { toLegalDocuments, type LegalDocuments } from './legalModel';

export { LEGAL_LABELS, consentPayload, type LegalDocuments, type LegalDocumentView, type LegalKind } from './legalModel';

/** Rota que abre o texto de cada documento (grupo `(auth)`: só existe sem sessão). */
export const LEGAL_ROUTE = { terms: '/termos', privacy: '/privacidade' } as const;

/**
 * A API manda `Cache-Control: public, max-age=60`. Uma cópia mais nova que isto vale; mais velha é buscada de novo ao
 * abrir a criação da conta. (Se mudar entre a abertura e o envio, o `409` corrige.)
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
  /** Criar a conta, ao abrir: busca de novo se a cópia está velha. */
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
 * Os Termos e a Política em um de três estados. `refreshIfStale` é só da criação da conta (quem ENVIA); as telas dos
 * documentos usam o padrão (`ensure`) e mostram a cópia que o formulário já tem.
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
 * `409 consent_outdated` ao criar a conta: troca a cópia pela vigente. Com `error.current` (já validado pelo
 * `api-client`) a tela mostra ESSES textos; sem ele busca de novo (`legalCurrent`). Não reenvia nada.
 */
export function refreshLegalAfterOutdated(error: ApiError): void {
  const store = useLegalStore.getState();
  if (error.current !== undefined) store.adopt(error.current);
  else void store.load();
}
