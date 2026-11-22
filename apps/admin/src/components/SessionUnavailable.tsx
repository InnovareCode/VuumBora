import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { errorMessage, type ApiError } from '../api';
import { useCountdown } from '../hooks/useCountdown';

function explain(problem: ApiError | null): string {
  switch (problem?.kind) {
    case 'rate_limited':
      return 'O servidor pediu uma pausa por excesso de requisições vindas desta rede.';
    case 'network':
      return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
    default:
      return 'O servidor está indisponível no momento.';
  }
}

/**
 * Tela de "não deu para confirmar a sessão" (`GET /me` com 429, rede caída ou 5xx). Existe porque mandar
 * a pessoa para o login nesses casos parece "a sessão caiu" quando ela, em geral, segue válida. O texto diz isso
 * explicitamente. Com `retryAfterSeconds` (429), o botão fica indisponível até a contagem acabar — `aria-disabled`,
 * não `disabled`, para o foco não cair no <body> — e a contagem é `aria-hidden` (texto mudando por segundo seria
 * anunciado sem parar); o leitor de tela recebe uma frase estática.
 */
export function SessionUnavailable({ problem, onRetry }: { readonly problem: ApiError | null; readonly onRetry: () => void }) {
  const [until] = useState<number | null>(() =>
    problem?.kind === 'rate_limited' && problem.retryAfterSeconds != null ? Date.now() + problem.retryAfterSeconds * 1000 : null,
  );
  const remaining = useCountdown(until);
  const waiting = remaining > 0;
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Painel e API em versões diferentes (`GET /me` num formato desconhecido): não é pausa nem queda de rede, e NÃO dá para
  // dizer "você não foi desconectado" — a API não disse quem é a pessoa. Tom de erro, texto próprio, sem promessa.
  const mismatch = problem?.kind === 'contract_mismatch';

  // A tela substitui a página inteira: o foco inicial vai para o botão (senão cairia no <body>).
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-screen p-6">
      <div
        role="alert"
        className={
          mismatch
            ? 'w-full max-w-md space-y-3 rounded-xxl border border-danger/30 bg-danger-fill p-6 text-text'
            : 'w-full max-w-md space-y-3 rounded-xxl border border-warning/40 bg-warning/10 p-6 text-text'
        }
      >
        <div className="flex items-center gap-2.5">
          {mismatch ? (
            <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          ) : (
            <Clock className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <h1 className="text-subtitle font-bold">{mismatch ? 'Painel e API em versões diferentes' : 'Não foi possível confirmar o seu acesso agora'}</h1>
        </div>
        {mismatch ? (
          // `text-text`, não `text-text-secondary`: sobre o vermelho do `danger-fill` o secundário medido dá 2,92:1 (reprova AA); o branco dá 5,16:1.
          <p className="text-small font-medium leading-relaxed text-text">{errorMessage({ kind: 'contract_mismatch' })}</p>
        ) : (
          <p className="text-small leading-relaxed text-text-secondary">
            {explain(problem)} <strong className="font-bold text-text">Você não foi desconectado</strong> — só não deu para conferir a sessão. Tente de novo em
            instantes.
          </p>
        )}
        {waiting && (
          <p className="text-small font-medium text-text-secondary">
            <span className="sr-only">Aguarde alguns segundos antes de tentar de novo.</span>
            <span aria-hidden="true">
              Tente de novo em <strong className="tabular-nums">{remaining} s</strong>
            </span>
          </p>
        )}
        <button
          ref={buttonRef}
          type="button"
          aria-disabled={waiting}
          onClick={() => {
            if (!waiting) onRetry();
          }}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-cta px-4 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta sm:w-auto"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
