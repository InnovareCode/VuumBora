import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '../../context/ApiContext';
import type { AdminUser, ApiError, DataOrigin, SecondFactorChallenge, TotpEnrollment } from '../../api';
import { useChallengeExpiry } from '../../hooks/useChallengeExpiry';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { ActivationField, isPlausibleActivation } from './CodeField';
import { AuthAlert } from './AuthAlert';
import { EnrollmentScan } from './EnrollmentScan';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { TwoFactorAlert } from './TwoFactorAlert';

type Phase =
  | { readonly name: 'activation' }
  | { readonly name: 'restarting' }
  | { readonly name: 'scan'; readonly enrollment: TotpEnrollment; readonly notice: string | null }
  | { readonly name: 'codes'; readonly admin: AdminUser; readonly origin: DataOrigin; readonly codes: readonly string[] };

const BackToCredentials = ({ onClick }: { readonly onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-small font-semibold text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
  >
    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
    Usar outra conta
  </button>
);

/**
 * Ativação OBRIGATÓRIA do segundo fator (dono e financeiro — nunca recebem
 * sessão sem ele). Quatro fases: código de ativação → QR → confirmar o
 * primeiro código → os 10 códigos de recuperação, UMA vez.
 *
 * O código de ativação (`enrollmentToken`, uso único, 48 h) NÃO vem pela API:
 * o responsável técnico o entrega por um canal seguro. Só a senha não basta —
 * de propósito (revisão S1). Fica só em estado de componente (memória) e vai
 * em `start` e em `confirm`, junto com o `challengeToken`.
 *
 * `start` é idempotente por 15 min (repetir devolve o MESMO segredo), então
 * voltar e avançar não invalida um QR já escaneado — e por isso não há mais
 * efeito automático de `start` (nada para o StrictMode duplicar).
 *
 * Confirmar já emite a sessão (cookie), mas a UI só vira "logada" depois de a
 * pessoa dizer que guardou os códigos: se `acceptSession` rodasse antes, a
 * rota `/login` redirecionaria e os códigos únicos sumiriam sem serem vistos.
 */
export function EnrollmentStep({
  challenge,
  onDone,
  onBackToCredentials,
  initialEnrollmentToken,
}: {
  readonly challenge: SecondFactorChallenge;
  readonly onDone: (admin: AdminUser, origin: DataOrigin) => void;
  readonly onBackToCredentials: (message?: string) => void;
  /**
   * Primeiro acesso de quem acabou de ativar a conta (`/auth/activate`,
   * docs/contrato-admin-usuarios.md §6): o `enrollmentToken` já está em mãos
   * (a resposta da ativação o entregou), então a tela não pede de novo o
   * código que o responsável técnico mandaria por fora — pula direto para o
   * QR, como se tivesse acabado de digitá-lo. Ausente (login normal): fluxo
   * igual a sempre, pedindo o campo.
   */
  readonly initialEnrollmentToken?: string;
}) {
  const api = useApi();
  const headingId = useId();
  const tokenId = useId();
  const errorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>(initialEnrollmentToken ? { name: 'restarting' } : { name: 'activation' });
  const [enrollmentToken, setEnrollmentToken] = useState(initialEnrollmentToken ?? '');
  const [submitting, setSubmitting] = useState(false);
  const { feedback, report, clear, locked, remaining } = useTwoFactorFeedback();

  const expired = useCallback(
    () => onBackToCredentials('O tempo para ativar a verificação acabou (10 minutos). Informe e-mail e senha novamente.'),
    [onBackToCredentials],
  );
  // Depois de confirmado o desafio já foi consumido; expirar na tela dos códigos não pode expulsar a pessoa.
  useChallengeExpiry(challenge.challengeExpiresAt, phase.name !== 'codes', expired);

  useEffect(() => {
    if (phase.name === 'activation') headingRef.current?.focus();
  }, [phase.name]);

  /** Pede o QR. Devolve o erro (ou null) — quem chama decide a tela; `challenge_invalid` sempre volta ao login. */
  const start = useCallback(async (): Promise<{ enrollment: TotpEnrollment } | { error: ApiError }> => {
    const result = await api.auth.startEnrollment({ challengeToken: challenge.challengeToken, enrollmentToken });
    return result.ok ? { enrollment: result.data } : { error: result.error };
  }, [api, challenge.challengeToken, enrollmentToken]);

  // `initialEnrollmentToken`: pula o campo de "digite o código de ativação" e já pede o QR com o token em mãos.
  useEffect(() => {
    if (!initialEnrollmentToken) return;
    let cancelled = false;
    (async () => {
      const outcome = await start();
      if (cancelled) return;
      if ('enrollment' in outcome) {
        setPhase({ name: 'scan', enrollment: outcome.enrollment, notice: null });
        return;
      }
      if (outcome.error.kind === 'challenge_invalid') {
        expired();
        return;
      }
      report(outcome.error);
      setPhase({ name: 'activation' });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só uma vez, no primeiro acesso vindo da ativação.
  }, []);

  async function handleActivation(event: FormEvent) {
    event.preventDefault();
    if (submitting || !isPlausibleActivation(enrollmentToken)) return;
    setSubmitting(true);
    clear();
    const outcome = await start();
    setSubmitting(false);
    if ('enrollment' in outcome) {
      setPhase({ name: 'scan', enrollment: outcome.enrollment, notice: null });
      return;
    }
    if (outcome.error.kind === 'challenge_invalid') {
      expired();
      return;
    }
    report(outcome.error);
    tokenRef.current?.focus();
  }

  const confirm = useCallback(
    async (code: string): Promise<ApiError | null> => {
      const result = await api.auth.confirmEnrollment({ challengeToken: challenge.challengeToken, enrollmentToken, code });
      if (result.ok) {
        setPhase({ name: 'codes', admin: result.data.admin, origin: result.origin, codes: result.data.recoveryCodes });
        return null;
      }
      const error = result.error;
      if (error.kind === 'challenge_invalid') {
        expired();
        return null;
      }
      if (error.kind === 'enrollment_token_invalid') {
        // O código de ativação deixou de valer no meio do caminho (vencido, gasto, reemitido): volta a pedi-lo.
        report(error);
        setPhase({ name: 'activation' });
        return null;
      }
      if (error.kind === 'conflict' && error.reason === 'two_factor_enrollment_not_started') {
        // O segredo pendente venceu (15 min sem confirmar): `start` de novo, à vista, com aviso na tela do QR novo.
        setPhase({ name: 'restarting' });
        const again = await start();
        if ('enrollment' in again) {
          setPhase({
            name: 'scan',
            enrollment: again.enrollment,
            notice: 'O QR code anterior venceu (eles valem 15 minutos). Escaneie este novo e digite o código que o app mostrar.',
          });
        } else if (again.error.kind === 'challenge_invalid') {
          expired();
        } else {
          report(again.error);
          setPhase({ name: 'activation' });
        }
        return null;
      }
      return error;
    },
    [api, challenge.challengeToken, enrollmentToken, expired, report, start],
  );

  if (phase.name === 'codes') {
    return (
      <RecoveryCodesPanel
        codes={phase.codes}
        continueLabel="Continuar para o painel"
        onContinue={() => onDone(phase.admin, phase.origin)}
      />
    );
  }

  const tokenInvalid = feedback?.field === 'activation';

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-6 space-y-2 text-left">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cta-pressed">
          Passo obrigatório
        </span>
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-title font-bold tracking-tight text-text outline-none focus-visible:ring-2 focus-visible:ring-info sm:text-heading"
        >
          Ative a verificação em duas etapas
        </h1>
        <p className="text-small leading-relaxed text-text-secondary sm:text-body">
          {phase.name === 'activation'
            ? 'Seu papel exige um segundo fator para entrar no painel. Para começar, digite o código de ativação que o responsável técnico entregou a você.'
            : 'Seu papel exige um segundo fator para entrar no painel. Leva um minuto e você só faz isso uma vez.'}
        </p>
      </div>

      {phase.name === 'activation' && (
        <>
          {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mb-5" />}
          <form onSubmit={handleActivation} noValidate className="space-y-5">
            <ActivationField
              id={tokenId}
              ref={tokenRef}
              value={enrollmentToken}
              onChange={setEnrollmentToken}
              invalid={tokenInvalid}
              describedBy={feedback ? errorId : undefined}
              hint="Formato ABCDE-FGHIJ-KLMNO-PQRST. Vale 48 horas e só pode ser usado uma vez. Maiúsculas e hífens não importam."
            />
            <button
              type="submit"
              // `aria-disabled`: desabilitar o botão que acabou de ser clicado joga o foco no <body>.
              aria-disabled={submitting || locked || !isPlausibleActivation(enrollmentToken)}
              onClick={(e) => {
                if (submitting || locked || !isPlausibleActivation(enrollmentToken)) e.preventDefault();
              }}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
                  Verificando…
                </span>
              ) : (
                'Continuar'
              )}
            </button>
          </form>
          <p className="mt-5 text-caption leading-relaxed text-text-muted">
            Não recebeu ou o código venceu? Peça um novo ao responsável técnico — ele não pode ser gerado por aqui.
          </p>
        </>
      )}

      {phase.name === 'restarting' && (
        <div role="status" className="flex items-center justify-center gap-3 py-10 text-small text-text-secondary">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-control border-t-cta" aria-hidden="true" />
          Gerando um novo QR code…
        </div>
      )}

      {phase.name === 'scan' && (
        <>
          {phase.notice && <AuthAlert kind="warning" className="mb-5">{phase.notice}</AuthAlert>}
          <EnrollmentScan enrollment={phase.enrollment} onConfirm={confirm}>
            <div className="flex justify-center border-t border-border pt-5">
              <BackToCredentials onClick={() => onBackToCredentials()} />
            </div>
          </EnrollmentScan>
        </>
      )}

      {phase.name !== 'scan' && (
        <div className="mt-6 flex justify-center border-t border-border pt-5">
          <BackToCredentials onClick={() => onBackToCredentials()} />
        </div>
      )}
    </section>
  );
}
