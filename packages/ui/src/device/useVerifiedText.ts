/**
 * Hook que baixa um texto, confere o SHA-256 e entrega os estados `loading` | `verified` | `failed` (B-6). A lógica está
 * em `verifiedText.ts` (pura e provada); aqui só há o ciclo de vida do React e uma memória dos textos JÁ conferidos.
 *
 * A memória é por (`url`, `sha256`): o texto de uma versão publicada é imutável e o hash o identifica — o que já bateu
 * com aquele hash vale de novo, sem baixar outra vez (abrir os Termos pelo cadastro e depois pelo reaceite). Guarda poucos
 * textos e só dos que PASSARAM na conferência; falha nunca entra.
 */
import { useCallback, useEffect, useState } from 'react';
import { sha256OfBytes } from './sha256OfBytes';
import { fetchVerifiedText, type FetchLike, type VerifyFailureReason } from './verifiedText';

export type VerifiedTextState =
  | { readonly status: 'loading' }
  | { readonly status: 'verified'; readonly text: string }
  | { readonly status: 'failed'; readonly reason: VerifyFailureReason; readonly httpStatus?: number };

export interface UseVerifiedTextSource {
  readonly url: string;
  readonly sha256: string;
  /** Passe `__DEV__`: em produção só `https`. */
  readonly allowHttp: boolean;
}

const MAX_REMEMBERED = 4;
const remembered = new Map<string, string>();

const keyOf = (source: UseVerifiedTextSource): string => `${source.sha256}|${source.url}`;

function remember(key: string, text: string): void {
  remembered.delete(key);
  remembered.set(key, text);
  while (remembered.size > MAX_REMEMBERED) {
    const oldest = remembered.keys().next();
    if (oldest.done === true) break;
    remembered.delete(oldest.value);
  }
}

/** Para a prova: esquece o que foi conferido (o cache vive no módulo, e um roteiro de teste precisa recomeçar do zero). */
export function forgetVerifiedTexts(): void {
  remembered.clear();
}

const globalFetch: FetchLike = (url, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(url, init);

interface Snapshot {
  readonly key: string;
  readonly attempt: number;
  readonly state: VerifiedTextState;
}

export function useVerifiedText(source: UseVerifiedTextSource): VerifiedTextState & { readonly retry: () => void } {
  const key = keyOf(source);
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const { url, sha256, allowHttp } = source;

  useEffect(() => {
    const known = remembered.get(key);
    if (known !== undefined) {
      setSnapshot({ key, attempt, state: { status: 'verified', text: known } });
      return undefined;
    }
    let cancelled = false;
    void fetchVerifiedText({ url, expectedSha256: sha256, allowHttp, fetch: globalFetch, sha256Hex: sha256OfBytes }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        remember(key, result.text);
        setSnapshot({ key, attempt, state: { status: 'verified', text: result.text } });
      } else {
        setSnapshot({
          key,
          attempt,
          state: result.httpStatus === undefined ? { status: 'failed', reason: result.reason } : { status: 'failed', reason: result.reason, httpStatus: result.httpStatus },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, attempt, url, sha256, allowHttp]);

  const retry = useCallback(() => {
    setSnapshot(null);
    setAttempt((previous) => previous + 1);
  }, []);

  // Um resultado de OUTRA versão/tentativa nunca vale para a atual (o `409` troca a versão com a tela aberta).
  const current: VerifiedTextState =
    snapshot !== null && snapshot.key === key && snapshot.attempt === attempt ? snapshot.state : remembered.has(key) ? { status: 'verified', text: remembered.get(key) as string } : { status: 'loading' };
  return { ...current, retry };
}
