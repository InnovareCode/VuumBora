/** Texto dos e-mails da identidade (pt-BR). O código só existe aqui, em memória, entre gerar e enviar. */
import type { EmailCodePurpose } from './email-code.js';
import type { MailMessage } from './mail-port.js';

/** Máximo de caracteres do primeiro nome na saudação. Nome maior que isto não é nome: vira "Olá!". */
export const GREETING_NAME_MAX_LENGTH = 30;

// Só letras (qualquer alfabeto), com hífen ou apóstrofo no meio. Nada de dígito, ponto, barra, dois-pontos,
// arroba ou espaço: sem isso não existe URL, e-mail nem domínio dentro da saudação.
const SAFE_FIRST_NAME = new RegExp(`^\\p{L}(?:[\\p{L}'’-]{0,${GREETING_NAME_MAX_LENGTH - 2}}\\p{L})?$`, 'u');

/**
 * Saudação do e-mail. O nome é texto LIVRE de quem se cadastrou (o atacante), e o e-mail sai do domínio
 * legítimo para a caixa de OUTRA pessoa: `Olá, https://phishing.exemplo/x!` seria phishing com nosso
 * remetente (revisão S1 rodada 2, I-5e). Só o primeiro nome entra, e só se for um nome curto e comum;
 * qualquer outra coisa vira "Olá!".
 */
export function greetingFor(fullName: string): string {
  const first = fullName.normalize('NFC').trim().split(/\s+/)[0] ?? '';
  return SAFE_FIRST_NAME.test(first) ? `Olá, ${first}!` : 'Olá!';
}

export function buildCodeMail(input: { purpose: EmailCodePurpose; to: string; fullName: string; code: string; ttlSeconds: number }): MailMessage {
  const minutes = Math.max(1, Math.round(input.ttlSeconds / 60));
  const greeting = greetingFor(input.fullName);
  if (input.purpose === 'verify_email') {
    return {
      to: input.to,
      subject: 'Seu código de verificação do VuumBora',
      text: `${greeting}\n\nSeu código para confirmar o e-mail é: ${input.code}\n\nEle vale por ${minutes} minutos e só pode ser usado uma vez. Se não foi você que criou a conta, ignore esta mensagem.\n\nEquipe VuumBora`,
    };
  }
  return {
    to: input.to,
    subject: 'Redefinição de senha do VuumBora',
    text: `${greeting}\n\nSeu código para redefinir a senha é: ${input.code}\n\nEle vale por ${minutes} minutos e só pode ser usado uma vez. Se não foi você que pediu, ignore esta mensagem: sua senha continua a mesma. Nunca compartilhe este código.\n\nEquipe VuumBora`,
  };
}

/**
 * Aviso depois de uma redefinição de senha (I-7): quem recebe sabe na hora se a troca não foi dele. NÃO leva
 * código, senha nem link — só o fato, e o que fazer se não foi a própria pessoa.
 */
export function buildPasswordChangedMail(input: { to: string; fullName: string }): MailMessage {
  return {
    to: input.to,
    subject: 'Sua senha do VuumBora foi alterada',
    text: `${greetingFor(input.fullName)}\n\nA senha da sua conta do VuumBora acabou de ser alterada e todas as sessões abertas foram encerradas.\n\nSe foi você, não precisa fazer nada.\n\nSe NÃO foi você, peça uma nova redefinição de senha agora, no aplicativo (opção "Esqueci a senha"), e avise o suporte do VuumBora.\n\nEquipe VuumBora`,
  };
}
