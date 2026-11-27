import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, ExternalLink, ImageOff, RefreshCw } from 'lucide-react';
import { useApi } from '../../context/ApiContext';
import { errorMessage } from '../../api';
import { formatTime, isImageContentType } from '../../lib/documentFormat';

/** Teto do contrato para a URL de visualização (≤ 300 s). Mesmo que o servidor mande mais, a tela não guarda além disto. */
const MAX_VIEW_URL_TTL_MS = 300_000;

type ViewerState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'open'; readonly url: string; readonly expiresAtMs: number; readonly broken: boolean }
  | { readonly phase: 'expired' };

/**
 * Visualizador de UM documento (D7). Regras do aceite, todas locais a este componente:
 *
 * - a URL é pedida SÓ no clique em "Ver documento" (`viewUrl`, que o servidor audita a cada chamada — N5).
 *   Nada de pré-carregar no foco, no hover nem na montagem;
 * - a URL mora só no estado DESTE componente: nunca em Context, `sessionStorage`, `localStorage`, cache de
 *   requisição, `console` ou atributo de texto (`title`, `aria-*`). Some ao fechar, ao desmontar e quando
 *   vence (no máximo 300 s depois, mesmo que o servidor diga mais);
 * - imagem abre aqui mesmo (`<img>` sem `Referer`); PDF abre em outra aba (`noopener noreferrer`), porque a
 *   CSP do painel proíbe `<object>`/`<iframe>` de outra origem.
 *
 * Padrão "disclosure": o botão alterna o painel logo abaixo dele (`aria-expanded`/`aria-controls`), então o
 * foco fica no botão e o próximo Tab já entra na visualização.
 */
export function DocumentViewer({
  documentId,
  typeLabel,
  driverName,
  contentType,
}: {
  readonly documentId: string;
  readonly typeLabel: string;
  readonly driverName: string;
  readonly contentType: string;
}) {
  const api = useApi();
  const panelId = useId();
  const [state, setState] = useState<ViewerState>({ phase: 'idle' });
  // Resposta que chega depois de "Fechar" (ou de outra abertura) é descartada, nunca vira estado.
  const requestId = useRef(0);

  async function requestUrl() {
    const id = ++requestId.current;
    setState({ phase: 'loading' });
    const result = await api.documentReview.viewUrl(documentId);
    if (id !== requestId.current) return;
    if (!result.ok) {
      setState({ phase: 'error', message: errorMessage(result.error) });
      return;
    }
    const expiresAtMs = Math.min(Date.parse(result.data.expiresAt), Date.now() + MAX_VIEW_URL_TTL_MS);
    setState({ phase: 'open', url: result.data.url, expiresAtMs, broken: false });
  }

  function close() {
    requestId.current += 1;
    setState({ phase: 'idle' });
  }

  // Vencimento: a URL sai do estado no instante em que deixa de valer.
  const expiresAtMs = state.phase === 'open' ? state.expiresAtMs : null;
  useEffect(() => {
    if (expiresAtMs === null) return undefined;
    const timer = setTimeout(() => {
      requestId.current += 1;
      setState({ phase: 'expired' });
    }, Math.max(0, expiresAtMs - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAtMs]);

  const expanded = state.phase === 'open';
  const loading = state.phase === 'loading';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => {
            // `aria-disabled` (não `disabled`) para o foco não cair no <body> durante a espera; o clique é ignorado aqui.
            if (loading) return;
            if (state.phase === 'open') close();
            else void requestUrl();
          }}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-disabled={loading}
          className="flex min-h-11 items-center gap-2 rounded-pill border border-border-control px-4 py-2 text-small font-bold text-text outline-none transition-colors hover:border-cta-pressed/60 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-wait aria-disabled:opacity-70"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted/40 border-t-text" aria-hidden="true" />
          ) : state.phase === 'open' ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? 'Gerando link seguro…' : state.phase === 'open' ? 'Fechar visualização' : 'Ver documento'}
        </button>
        <span className="text-caption text-text-muted">Cada visualização fica registrada.</span>
      </div>

      {/* Anúncio para leitor de tela da mudança assíncrona (o painel aparece depois da resposta). */}
      <p className="sr-only" role="status" aria-live="polite">
        {state.phase === 'open' ? `Documento aberto. Link válido até ${formatTime(new Date(state.expiresAtMs).toISOString())}.` : ''}
        {state.phase === 'expired' ? 'O link do documento venceu.' : ''}
      </p>

      {state.phase === 'expired' && (
        <p className="rounded-xl border border-border bg-elevated px-3 py-2.5 text-small text-text-secondary">
          O link venceu (vale 5 minutos) e saiu da tela. Para ver de novo, use "Ver documento" — a nova visualização
          também fica registrada.
        </p>
      )}

      {state.phase === 'error' && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-fill px-3 py-2.5 text-small text-text">
          {state.message}
        </p>
      )}

      <div id={panelId} hidden={!expanded}>
        {state.phase === 'open' && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-3">
            <p className="text-caption font-semibold text-text-secondary">
              Link válido até {formatTime(new Date(state.expiresAtMs).toISOString())} (5 minutos). Depois disso, peça outro.
            </p>
            {isImageContentType(contentType) && !state.broken ? (
              <img
                src={state.url}
                alt={`${typeLabel} enviado por ${driverName}`}
                referrerPolicy="no-referrer"
                decoding="async"
                onError={() => setState((prev) => (prev.phase === 'open' ? { ...prev, broken: true } : prev))}
                className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : null}
            {isImageContentType(contentType) && state.broken ? (
              <div role="alert" className="flex flex-col items-start gap-2 text-small text-text-secondary">
                <span className="flex items-center gap-2 font-semibold text-text">
                  <ImageOff className="h-4 w-4" aria-hidden="true" />
                  Não foi possível exibir o arquivo aqui.
                </span>
                <span>O link pode ter vencido ou o arquivo não carregou.</span>
                <button
                  type="button"
                  onClick={() => void requestUrl()}
                  className="flex min-h-11 items-center gap-2 rounded-pill border border-border-control px-4 py-2 text-small font-bold text-text outline-none transition-colors hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Pedir novo link
                </button>
              </div>
            ) : null}
            {!isImageContentType(contentType) ? (
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="flex min-h-11 w-fit items-center gap-2 rounded-pill bg-cta px-4 py-2 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Abrir arquivo em nova aba
              </a>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
