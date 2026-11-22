import { errorMessage, type ApiError } from '../api';

export interface TwoFactorFeedback {
  readonly message: string;
  /** `error` = você errou (vermelho); `warning` = estado de infraestrutura/limite (âmbar). */
  readonly kind: 'error' | 'warning';
  /**
   * Segundos até poder tentar de novo. Vem de DOIS casos diferentes: `account_locked` (espera curta por par e-mail + IP,
   * 1 s a 15 min — NÃO é bloqueio de conta) e `two_factor_locked` (bloqueio de 15 min do CÓDIGO, por admin).
   */
  readonly lockSeconds?: number;
  /** Qual campo recebe o erro (`aria-invalid`, foco). Ausente = erro geral do formulário. */
  readonly field?: 'code' | 'password' | 'activation';
  /** Beco sem saída (nenhum campo a corrigir): o foco vai para o aviso quando ele aparece. */
  readonly focus?: boolean;
}

/** Qual tipo de código a pessoa digitou — o texto do erro muda (código de recuperação não vem de "app autenticador"). */
export type CodeMethod = 'totp' | 'recovery';

/** Abaixo disto o aviso de "poucos códigos de recuperação" vira destaque (Segurança e login com código de recuperação). */
export const LOW_RECOVERY_CODES_THRESHOLD = 3;

/**
 * Tradução ÚNICA de erro de API em feedback de tela para qualquer passo do
 * segundo fator (login, enrolamento, configurações) — para os três lugares
 * nunca divergirem na redação. `challenge_invalid` NÃO passa por aqui: quem
 * chama trata como "voltar ao e-mail/senha" antes de pedir feedback.
 */
export function twoFactorFeedback(error: ApiError, method: CodeMethod = 'totp'): TwoFactorFeedback {
  switch (error.kind) {
    case 'invalid_second_factor':
      return {
        kind: 'error',
        field: 'code',
        message:
          method === 'recovery'
            ? 'Código de recuperação inválido ou já usado. Cada código vale uma única vez; confira se digitou o código inteiro.'
            : // TOTP de uso único: o mesmo passo de 30 s não vale duas vezes (ex.: acabou de entrar com ele e foi pedir de novo).
              'Código inválido ou já usado. Se você acabou de usar este código (para entrar, por exemplo), espere o próximo: ele muda a cada 30 segundos e vale uma vez.',
      };
    case 'password_invalid':
      return { kind: 'error', field: 'password', message: errorMessage(error) };
    case 'enrollment_token_invalid':
      return { kind: 'error', field: 'activation', message: errorMessage(error) };
    case 'account_locked':
      return { kind: 'warning', message: errorMessage(error), lockSeconds: error.retryAfterSeconds };
    case 'two_factor_locked':
      return { kind: 'warning', message: 'Muitos códigos errados seguidos. O acesso desta conta foi bloqueado por segurança.', lockSeconds: error.retryAfterSeconds };
    case 'rate_limited':
      return { kind: 'warning', message: 'Muitas tentativas em pouco tempo a partir desta rede. Aguarde alguns minutos e tente de novo.' };
    case 'conflict':
      if (error.reason === 'two_factor_enrollment_not_started') {
        return { kind: 'error', message: 'A ativação não foi iniciada ou foi reiniciada. Gere o QR code de novo.' };
      }
      if (error.reason === 'two_factor_already_enrolled') {
        return { kind: 'error', message: 'A verificação em duas etapas já está ativa nesta conta.' };
      }
      if (error.reason === 'two_factor_not_enrolled') {
        return { kind: 'error', message: 'A verificação em duas etapas não está ativa nesta conta.' };
      }
      return { kind: 'error', message: errorMessage(error) };
    case 'network':
    case 'unavailable':
    case 'two_factor_unavailable':
      return { kind: 'warning', message: errorMessage(error) };
    case 'contract_mismatch':
      // Painel e API em versões diferentes: nada que a pessoa digite resolve, então o aviso recebe o foco.
      return { kind: 'error', message: errorMessage(error), focus: true };
    default:
      return { kind: 'error', message: errorMessage(error) };
  }
}

/** `mm:ss` — para a contagem do bloqueio. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Contagem na tela. A espera do `account_locked` começa em 1 s e a do código em 15 min; "00:01" para uma espera de um
 * segundo é ruído, então espera INICIAL abaixo de 1 min mostra segundos ("3 s"). O formato vem do tempo INICIAL (não do
 * restante) para não trocar de "01:00" para "59 s" no meio de uma contagem longa.
 */
export function formatWaitLabel(remainingSeconds: number, initialSeconds: number): string {
  return initialSeconds < 60 ? `${Math.max(0, Math.ceil(remainingSeconds))} s` : formatCountdown(remainingSeconds);
}

/**
 * Frase ESTÁTICA para leitor de tela (a contagem visual é `aria-hidden`: texto mudando por segundo dentro de
 * `role="alert"` seria anunciado sem parar). Calculada do tempo INICIAL, não do restante, pelo mesmo motivo.
 */
export function waitAnnouncement(initialSeconds: number): string {
  if (initialSeconds < 60) return 'Tente novamente em alguns segundos.';
  return `Tente novamente em cerca de ${Math.ceil(initialSeconds / 60)} minuto(s).`;
}
