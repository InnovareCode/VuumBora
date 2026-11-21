import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Clock, Send } from 'lucide-react';
import { useApi } from '../../context/ApiContext';
import { errorMessage, type ApiError, type SmtpFailureDetails } from '../../api';
import { useCountdown } from '../../hooks/useCountdown';
import { controlClass } from './SettingField';

export const TEST_EMAIL_LIMIT_PER_HOUR = 5;

type Outcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sent'; readonly to: string }
  | { readonly kind: 'failed'; readonly error: ApiError };

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DELIVERY_TITLE: Record<string, string> = {
  smtp: 'O servidor de e-mail recusou ou não respondeu',
  unresolvable_host: 'Não foi possível encontrar o servidor (DNS)',
  password_unreadable: 'A senha salva não pôde ser lida',
};

const DELIVERY_ADVICE: Record<string, string> = {
  unresolvable_host: 'Confira se o endereço do servidor está escrito certo.',
  password_unreadable: 'A chave de cifra do servidor mudou depois que a senha foi salva. Digite a senha de novo, salve e teste outra vez.',
};

/** Texto EXATO do servidor, sem reescrever — é o que o dono precisa para corrigir (ex.: "535 5.7.8 Authentication failed"). */
function DeliveryFailure({ details }: { readonly details: SmtpFailureDetails }) {
  const advice = DELIVERY_ADVICE[details.kind];
  return (
    <div className="space-y-3">
      <p className="font-bold">{DELIVERY_TITLE[details.kind] ?? DELIVERY_TITLE['smtp']}</p>
      {advice && <p className="text-text-secondary">{advice}</p>}
      <div>
        <p className="mb-1 text-caption font-bold uppercase tracking-wide text-text-secondary">Resposta exata do servidor</p>
        <pre
          data-testid="smtp-server-message"
          className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-mono text-caption leading-relaxed text-text select-all"
        >
          {details.serverMessage}
        </pre>
      </div>
      {(details.smtpCode || details.responseCode != null || details.command) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
          {details.smtpCode && (
            <>
              <dt className="font-bold text-text-secondary">Código SMTP</dt>
              <dd className="font-mono text-text">{details.smtpCode}</dd>
            </>
          )}
          {details.responseCode != null && (
            <>
              <dt className="font-bold text-text-secondary">Código de resposta</dt>
              <dd className="font-mono text-text">{details.responseCode}</dd>
            </>
          )}
          {details.command && (
            <>
              <dt className="font-bold text-text-secondary">Comando</dt>
              <dd className="font-mono text-text">{details.command}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Bloco "Enviar e-mail de teste". Usa a configuração SALVA — por isso fica
 * travado com alteração pendente (a pessoa testaria outra coisa). Falha de
 * entrega mostra o erro exato do servidor; o limite (5/hora/admin, falha
 * também gasta) aparece sempre e, ao estourar, trava o botão com o tempo
 * restante em minutos (frase estática — nada mudando por segundo na região viva).
 */
export function TestEmailPanel({
  configured,
  dirty,
  defaultRecipient,
}: {
  readonly configured: boolean;
  readonly dirty: boolean;
  /** E-mail do próprio dono — o destino padrão quando o campo fica em branco. */
  readonly defaultRecipient: string | undefined;
}) {
  const api = useApi();
  const toId = useId();
  const toErrorId = useId();
  const noteId = useId();
  const [to, setTo] = useState('');
  const [toError, setToError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null);
  const remaining = useCountdown(limitedUntil);
  const limited = remaining > 0;

  const blockedReason = dirty
    ? 'Você tem alterações não salvas. Salve antes de testar: o teste usa a configuração salva.'
    : !configured
      ? 'Defina servidor, porta e remetente (e salve) para poder testar.'
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending || limited || blockedReason) return;
    const recipient = to.trim();
    if (recipient !== '' && !SIMPLE_EMAIL.test(recipient)) {
      setToError('Informe um e-mail válido, ou deixe em branco para enviar ao seu próprio e-mail.');
      return;
    }
    setToError(null);
    setSending(true);
    setOutcome({ kind: 'idle' });
    const result = await api.emailSettings.sendTest(recipient || undefined);
    setSending(false);
    if (result.ok) {
      setOutcome({ kind: 'sent', to: result.data.to });
      return;
    }
    if (result.error.kind === 'rate_limited' && result.error.retryAfterSeconds != null) {
      setLimitedUntil(Date.now() + result.error.retryAfterSeconds * 1000);
    }
    setOutcome({ kind: 'failed', error: result.error });
  }

  const blocked = sending || limited || blockedReason !== null;

  return (
    <section aria-labelledby={`${toId}-title`} className="space-y-4">
      <div>
        <h2 id={`${toId}-title`} className="text-subtitle font-bold text-text">
          Enviar e-mail de teste
        </h2>
        <p id={noteId} className="mt-1 text-small text-text-secondary">
          Manda uma mensagem de verdade usando a configuração <strong className="font-bold text-text">salva</strong>. Limite: {TEST_EMAIL_LIMIT_PER_HOUR} testes por
          hora por administrador — tentativa que falha também conta.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor={toId} className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Enviar para
          </label>
          <input
            id={toId}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={defaultRecipient ?? 'seu e-mail'}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setToError(null);
            }}
            aria-invalid={toError ? true : undefined}
            aria-describedby={[toError ? toErrorId : null, noteId].filter(Boolean).join(' ')}
            className={controlClass}
          />
          {toError ? (
            <p id={toErrorId} className="text-caption font-semibold text-danger">
              {toError}
            </p>
          ) : (
            <p className="text-caption text-text-muted">Em branco: envia para o seu próprio e-mail{defaultRecipient ? ` (${defaultRecipient})` : ''}.</p>
          )}
        </div>

        {blockedReason && <p className="text-small font-medium text-warning">{blockedReason}</p>}
        {limited && (
          <p role="status" className="text-small font-medium text-warning">
            Limite de {TEST_EMAIL_LIMIT_PER_HOUR} testes por hora atingido. Tente de novo em cerca de {Math.ceil(remaining / 60)} minuto(s).
          </p>
        )}

        <button
          type="submit"
          // Bloqueio por motivo visível: `aria-disabled` mantém o botão alcançável com a explicação ao lado; sem `disabled`
          // também porque desabilitar o botão focado ao enviar joga o foco no <body>.
          aria-disabled={blocked}
          onClick={(e) => {
            if (blocked) e.preventDefault();
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-control bg-surface px-5 text-body font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-surface sm:w-auto"
        >
          {sending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-text/30 border-t-text" aria-hidden="true" />
              Enviando…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden="true" />
              Enviar e-mail de teste
            </>
          )}
        </button>
      </form>

      <div aria-live="polite" className="empty:hidden">
        {outcome.kind === 'sent' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-small text-text">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words font-medium">
              E-mail de teste enviado para <strong className="font-bold">{outcome.to}</strong>. Confira a caixa de entrada — e a de spam.
            </p>
          </div>
        )}
        {outcome.kind === 'failed' && <FailureAlert error={outcome.error} />}
      </div>
    </section>
  );
}

/**
 * Resultado de falha do teste. Fundo translúcido (não o vermelho cheio do login):
 * o bloco carrega texto longo de diagnóstico, e texto secundário sobre vermelho
 * cheio não alcança contraste. `warning` (âmbar) = estado de limite/rede, não erro de configuração.
 */
function DiagnosticAlert({ tone, children }: { readonly tone: 'error' | 'warning'; readonly children: ReactNode }) {
  const Icon = tone === 'warning' ? Clock : AlertCircle;
  return (
    <div
      role="alert"
      className={
        tone === 'warning'
          ? 'flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text'
          : 'flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-small text-text'
      }
    >
      <Icon className={tone === 'warning' ? 'mt-0.5 h-4 w-4 shrink-0 text-warning' : 'mt-0.5 h-4 w-4 shrink-0 text-danger'} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function FailureAlert({ error }: { readonly error: ApiError }) {
  if (error.kind === 'smtp_delivery_failed') {
    return (
      <DiagnosticAlert tone="error">
        <DeliveryFailure details={error.details} />
      </DiagnosticAlert>
    );
  }
  // O limite já aparece, persistente, acima do botão (com o tempo restante) — não repete aqui.
  if (error.kind === 'rate_limited' && error.retryAfterSeconds != null) return null;
  const tone = error.kind === 'network' || error.kind === 'unavailable' || error.kind === 'email_not_configured' ? 'warning' : 'error';
  return <DiagnosticAlert tone={tone}>{errorMessage(error)}</DiagnosticAlert>;
}
