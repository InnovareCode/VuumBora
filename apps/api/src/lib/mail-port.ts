/**
 * Porta de envio de e-mail da identidade. A identidade só conhece ESTA
 * interface; a implementação SMTP (lib de mailer) é de outro módulo e é
 * ligada em `buildApp({ mail })`. Contrato:
 *  - `send` resolve quando o provedor ACEITOU a mensagem e REJEITA em qualquer falha;
 *  - o implementador é dono de timeout e de qualquer retry (a identidade
 *    ainda põe um teto de 10 s por cima);
 *  - `to` já vem validado como e-mail (sem quebra de linha); `subject` e
 *    `text` são texto puro, em português, prontos para enviar;
 *  - NUNCA logar `text` (contém o código de 6 dígitos).
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

/** Padrão quando nenhum adaptador foi ligado: toda tentativa falha (o cadastro responde `emailSent: false`). */
export const unavailableMailPort: MailPort = {
  send: () => Promise.reject(new Error('mail_port_not_configured')),
};
