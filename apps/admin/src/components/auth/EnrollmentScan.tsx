import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ApiError, TotpEnrollment } from '../../api';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { QrCode } from './QrCode';
import { TotpField, isCompleteTotp } from './CodeField';
import { TwoFactorAlert } from './TwoFactorAlert';

/** Agrupa a chave base32 de 4 em 4 só para leitura/digitação; o que se copia é a chave crua. */
function groupSecret(secret: string): string[] {
  return secret.match(/.{1,4}/g) ?? [secret];
}

/**
 * Passo "escaneie e confirme" do enrolamento — o mesmo no login obrigatório
 * (dono/financeiro) e nas configurações (papéis opcionais), por isso recebe só
 * `onConfirm` e devolve o erro cru da API: quem usa decide o que fazer com
 * `challenge_invalid` (voltar ao login) ou `conflict` (reiniciar a ativação).
 *
 * Ordem do documento = ordem do Tab: QR → chave manual → "copiar chave" →
 * campo do código → ativar → (filhos extras, ex. "voltar").
 */
export function EnrollmentScan({
  enrollment,
  onConfirm,
  submitLabel = 'Ativar e entrar',
  children,
}: {
  readonly enrollment: TotpEnrollment;
  /** Devolve `null` em sucesso (a tela hospedeira troca de passo) ou o erro da API. */
  readonly onConfirm: (code: string) => Promise<ApiError | null>;
  readonly submitLabel?: string;
  readonly children?: ReactNode;
}) {
  const codeId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'error'>('idle');
  const { feedback, report, clear, locked, remaining } = useTwoFactorFeedback();

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  async function copySecret() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard indisponível');
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied('copied');
    } catch {
      setCopied('error');
    }
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopied('idle'), 2500);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || !isCompleteTotp(code)) return;
    setSubmitting(true);
    clear();
    const error = await onConfirm(code);
    // Em sucesso o componente é desmontado pela tela hospedeira; só mexe em
    // estado se ainda estamos aqui (erro). O campo NUNCA fica `disabled` no
    // envio: desabilitar o input que tem o foco joga o foco no <body>.
    if (error) {
      setSubmitting(false);
      report(error);
      setCode('');
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 text-left">
      <ol className="space-y-5">
        <li className="space-y-3">
          <p className="text-small font-semibold text-text">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cta/15 text-caption font-black text-cta-pressed" aria-hidden="true">
              1
            </span>
            Escaneie o QR code no app autenticador
          </p>
          <QrCode value={enrollment.otpauthUri} />
          <div className="space-y-1.5 rounded-xl border border-border bg-input p-3">
            <p className="text-caption font-semibold uppercase tracking-wider text-text-secondary">
              Ou digite esta chave
            </p>
            <code
              className="flex select-all flex-wrap gap-x-3 gap-y-1 font-mono text-small font-semibold tracking-wider text-text"
              data-testid="totp-secret"
            >
              {groupSecret(enrollment.secret).map((group, index) => (
                <span key={index}>{group}</span>
              ))}
            </code>
            <button
              type="button"
              onClick={() => void copySecret()}
              className="mt-1 inline-flex h-11 items-center gap-2 rounded-lg px-2 text-caption font-bold text-text-secondary outline-none transition-colors hover:bg-elevated hover:text-text focus-visible:ring-2 focus-visible:ring-info"
            >
              {copied === 'copied' ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied === 'copied' ? 'Chave copiada' : 'Copiar chave'}
            </button>
            <p role="status" className="sr-only">
              {copied === 'copied' ? 'Chave copiada.' : copied === 'error' ? 'Não foi possível copiar a chave.' : ''}
            </p>
          </div>
        </li>

        <li className="space-y-3">
          <p className="text-small font-semibold text-text">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cta/15 text-caption font-black text-cta-pressed" aria-hidden="true">
              2
            </span>
            Digite o código de 6 dígitos que o app mostra
          </p>

          {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} />}

          <TotpField
            id={codeId}
            ref={inputRef}
            value={code}
            onChange={setCode}
            invalid={feedback?.field === 'code'}
            describedBy={feedback ? errorId : undefined}
          />
        </li>
      </ol>

      <button
        type="submit"
        disabled={submitting || locked || !isCompleteTotp(code)}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
            Confirmando…
          </span>
        ) : (
          submitLabel
        )}
      </button>
      {children}
    </form>
  );
}
