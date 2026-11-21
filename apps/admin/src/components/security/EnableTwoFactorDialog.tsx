import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useApi } from '../../context/ApiContext';
import type { ApiError, TotpEnrollment } from '../../api';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { Dialog } from '../Dialog';
import { AuthAlert } from '../auth/AuthAlert';
import { PasswordField } from '../auth/CodeField';
import { EnrollmentScan } from '../auth/EnrollmentScan';
import { RecoveryCodesPanel } from '../auth/RecoveryCodesPanel';
import { TwoFactorAlert } from '../auth/TwoFactorAlert';

type Phase =
  | { readonly name: 'password'; readonly notice: string | null }
  | { readonly name: 'scan'; readonly enrollment: TotpEnrollment }
  | { readonly name: 'codes'; readonly codes: readonly string[] };

/**
 * Ligar o 2FA com sessão (papéis opcionais). Primeiro a SENHA ATUAL
 * (reautenticação: sessão roubada não basta para ligar um 2FA do atacante),
 * depois QR + primeiro código, depois os códigos de recuperação.
 *
 * `start` é idempotente por 15 min; se o segredo pendente vencer antes do
 * `confirm` (409 `two_factor_enrollment_not_started`), volta para a senha com
 * aviso — a senha NÃO fica guardada para refazer em silêncio. Concluir derruba
 * as OUTRAS sessões da conta (a atual fica); a tela avisa antes.
 *
 * Enquanto os códigos estão na tela o diálogo NÃO fecha por Escape/fundo/"x"
 * (`busy`): é a única exibição deles.
 */
export function EnableTwoFactorDialog({ onClose, onChanged }: { readonly onClose: () => void; readonly onChanged: () => void }) {
  const api = useApi();
  const titleId = useId();
  const passwordId = useId();
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'password', notice: null });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { feedback, report, clear, locked, remaining } = useTwoFactorFeedback();

  useEffect(() => {
    if (phase.name === 'password') passwordRef.current?.focus();
  }, [phase.name]);

  async function handlePassword(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || password === '') return;
    setSubmitting(true);
    clear();
    const result = await api.twoFactor.startEnrollment(password);
    setSubmitting(false);
    if (result.ok) {
      setPassword(''); // a senha já cumpriu o papel; não fica na memória durante o QR
      setPhase({ name: 'scan', enrollment: result.data });
      return;
    }
    report(result.error);
    // Senha errada: apaga e devolve o foco ao campo. Bloqueio/rede: mantém o texto digitado.
    if (result.error.kind === 'password_invalid') setPassword('');
    passwordRef.current?.focus();
  }

  const confirm = useCallback(
    async (code: string): Promise<ApiError | null> => {
      const result = await api.twoFactor.confirmEnrollment(code);
      if (result.ok) {
        // A conta JÁ tem 2FA ligado neste ponto: atualiza o status por trás, mas só fecha depois dos códigos.
        onChanged();
        setPhase({ name: 'codes', codes: result.data.recoveryCodes });
        return null;
      }
      if (result.error.kind === 'conflict' && result.error.reason === 'two_factor_enrollment_not_started') {
        setPhase({ name: 'password', notice: 'O QR code venceu (eles valem 15 minutos). Confirme a senha para gerar um novo.' });
        return null;
      }
      return result.error;
    },
    [api, onChanged],
  );

  return (
    <Dialog titleId={titleId} title="Ativar verificação em duas etapas" onClose={onClose} busy={phase.name === 'codes' || submitting}>
      {phase.name === 'password' && (
        <form onSubmit={handlePassword} noValidate className="space-y-4">
          <p className="text-small leading-relaxed text-text-secondary">
            Por segurança, confirme a sua senha atual para começar. Ao concluir a ativação, as <strong className="font-bold text-text">outras sessões</strong>{' '}
            abertas desta conta serão encerradas.
          </p>
          {phase.notice && <AuthAlert kind="warning">{phase.notice}</AuthAlert>}
          {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} />}
          <PasswordField
            id={passwordId}
            ref={passwordRef}
            value={password}
            onChange={setPassword}
            invalid={feedback?.field === 'password'}
            describedBy={feedback ? errorId : undefined}
          />
          <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
            <button
              type="submit"
              aria-disabled={submitting || locked || password === ''}
              onClick={(e) => {
                if (submitting || locked || password === '') e.preventDefault();
              }}
              className="flex h-11 items-center justify-center rounded-xl bg-cta text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta sm:flex-1"
            >
              {submitting ? 'Verificando…' : 'Continuar'}
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
      )}
      {phase.name === 'scan' && (
        <EnrollmentScan enrollment={phase.enrollment} onConfirm={confirm} submitLabel="Ativar">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-border-control text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info"
          >
            Cancelar
          </button>
        </EnrollmentScan>
      )}
      {phase.name === 'codes' && <RecoveryCodesPanel codes={phase.codes} continueLabel="Concluir" onContinue={onClose} />}
    </Dialog>
  );
}
