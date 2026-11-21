/**
 * Teto GLOBAL de e-mails de identidade por hora (revisão S1 rodada 2, I-5a).
 *
 * Sem ele, poucas dezenas de IPs consomem a cota diária do provedor SMTP (planos gratuitos têm centenas
 * por dia), o que derruba verificação e redefinição para TODO MUNDO e pode suspender a conta do provedor.
 *
 * Dois baldes independentes — "verificação" (cadastro e reenvio) e "redefinição" —, para que uma enxurrada
 * de cadastros falsos não impeça um passageiro verdadeiro de redefinir a senha. A chave entra na MESMA
 * reserva atômica dos demais limites (`reserveAttempts`): se qualquer chave estourou, nada é gravado.
 * Conta PEDIDOS que podem gerar e-mail (inclusive os respondidos sem enviar, como conta inexistente):
 * contar só os enviados vazaria quem existe.
 */
import type { AttemptKey } from '../repositories/identity-repository.js';
import type { AuthConfig } from './auth-config.js';
import type { EmailCodePurpose } from './email-code.js';
import { hmacHex } from './token-crypto.js';

/** O teto é "por hora", qualquer que seja a janela dos outros limites. */
export const EMAIL_BUDGET_WINDOW_MINUTES = 60;

export function emailGlobalKey(config: AuthConfig, purpose: EmailCodePurpose): AttemptKey {
  return {
    identifierHash: hmacHex(config.pepper, `email_global:${purpose}`),
    max: config.emailGlobalMaxPerHour,
    // Mesmo escopo no cadastro e nos pedidos de código: o balde de "verificação" é um só.
    scope: 'code_request',
    windowMinutes: EMAIL_BUDGET_WINDOW_MINUTES,
  };
}
