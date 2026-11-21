import { formatWaitLabel, waitAnnouncement, type TwoFactorFeedback } from '../../lib/twoFactorFeedback';
import { AuthAlert } from './AuthAlert';

/**
 * Aviso de erro/espera/bloqueio de um formulário. Durante a espera a contagem
 * aparece a cada segundo para quem enxerga, mas fica `aria-hidden`: dentro de
 * `role="alert"`, texto mudando a cada segundo seria anunciado sem parar.
 * Leitor de tela recebe uma frase estática, calculada do tempo INICIAL (a
 * espera de senha errada vai de 1 s a 15 min; o bloqueio do código é de 15 min).
 */
export function TwoFactorAlert({
  id,
  feedback,
  remaining,
  className,
}: {
  readonly id?: string;
  readonly feedback: TwoFactorFeedback;
  readonly remaining: number;
  readonly className?: string;
}) {
  const initial = feedback.lockSeconds;
  const showCountdown = initial != null && remaining > 0;
  return (
    <AuthAlert id={id} kind={feedback.kind} {...(className ? { className } : {})}>
      <p>{feedback.message}</p>
      {showCountdown && (
        <p className="mt-1">
          <span className="sr-only">{waitAnnouncement(initial)}</span>
          <span aria-hidden="true">
            Tente de novo em <strong className="tabular-nums">{formatWaitLabel(remaining, initial)}</strong>
          </span>
        </p>
      )}
    </AuthAlert>
  );
}
