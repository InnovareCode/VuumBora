import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ApiError, Result } from '../../api';
import { adminUserFeedback } from '../../lib/adminUserFeedback';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { PasswordField, TotpField, isCompleteTotp } from '../auth/CodeField';
import { TwoFactorAlert } from '../auth/TwoFactorAlert';

/**
 * Formulário de reautenticação (senha + código condicional) + botões — SEM o
 * `<Dialog>` em volta, para poder morar dentro de um diálogo que já tem outro
 * controle acima (ex.: `ChangeRoleDialog`, com o seletor de papel). Quando o
 * diálogo não precisa de mais nada, use `ActorPasswordDialog` (que embrulha
 * isto num `<Dialog>` próprio).
 *
 * `requireCode`: o servidor só exige (e checa) o TOTP de quem chama quando o
 * papel ENVOLVIDO é `dono`/`financeiro` (`lib/permissions.ts` →
 * `roleRequiresSecondFactorGate`). Mesma política de erro por campo do
 * `StepUpDialog`: senha errada apaga só a senha; código errado apaga só o
 * código; espera/bloqueio mantém os dois. `onBusyChange` avisa quem embrulha
 * (para travar Escape/clique de fora/X enquanto a chamada está em voo).
 */
export function ActorPasswordFields<T>({
  intro,
  submitLabel,
  pendingLabel,
  danger = false,
  requireCode,
  onClose,
  run,
  onDone,
  onRejected,
  onBusyChange,
}: {
  readonly intro: ReactNode;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly danger?: boolean;
  readonly requireCode: boolean;
  readonly onClose: () => void;
  readonly run: (input: { readonly password: string; readonly code?: string }) => Promise<Result<T>>;
  readonly onDone: (data: T) => void;
  readonly onRejected?: ((error: ApiError) => boolean) | undefined;
  readonly onBusyChange?: ((busy: boolean) => void) | undefined;
}) {
  const passwordId = useId();
  const codeId = useId();
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { feedback, show, clear, locked, remaining } = useTwoFactorFeedback();

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const ready = password !== '' && (!requireCode || isCompleteTotp(code));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || !ready) return;
    setSubmitting(true);
    onBusyChange?.(true);
    clear();
    const result = await run({ password, ...(requireCode ? { code } : {}) });
    if (result.ok) {
      onDone(result.data);
      return;
    }
    setSubmitting(false);
    onBusyChange?.(false);
    if (onRejected?.(result.error)) return;
    show(adminUserFeedback(result.error));
    switch (result.error.kind) {
      case 'password_invalid':
        setPassword('');
        passwordRef.current?.focus();
        break;
      case 'invalid_second_factor':
      case 'two_factor_locked':
        setCode('');
        codeRef.current?.focus();
        break;
      default:
        passwordRef.current?.focus();
    }
  }

  const describedBy = feedback ? errorId : undefined;

  return (
    <>
      <p className="text-small leading-relaxed text-text-secondary">{intro}</p>

      {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mt-4" />}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <PasswordField
          id={passwordId}
          ref={passwordRef}
          value={password}
          onChange={setPassword}
          invalid={feedback?.field === 'password'}
          describedBy={describedBy}
          label="Sua senha de acesso ao painel"
        />

        {requireCode && (
          <TotpField
            id={codeId}
            ref={codeRef}
            value={code}
            onChange={setCode}
            invalid={feedback?.field === 'code'}
            describedBy={describedBy}
            hint="Este papel exige verificação em duas etapas: o código do seu app autenticador."
          />
        )}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button
            type="submit"
            aria-disabled={submitting || locked || !ready}
            onClick={(e) => {
              if (submitting || locked || !ready) e.preventDefault();
            }}
            className={
              danger
                ? 'flex h-11 items-center justify-center rounded-xl bg-danger-fill text-small font-bold text-white outline-none transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:flex-1'
                : 'flex h-11 items-center justify-center rounded-xl bg-cta text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta sm:flex-1'
            }
          >
            {submitting ? pendingLabel : submitLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-11 items-center justify-center rounded-xl border border-border-control text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info disabled:opacity-60 sm:flex-1"
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
