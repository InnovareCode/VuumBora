/**
 * Mesmo padrão de `@vuumbora/api-client` (portas & adaptadores, `Result<T>`
 * com origem explícita) — reimplementado aqui, não importado, porque aquele
 * pacote é a porta dos apps RN (passageiro/motorista) e o admin é um
 * consumidor novo, fora daquele perfil. Ver também §5 de docs/plano-sistema.md
 * (envelope e famílias de erro — os `kind` abaixo espelham a tabela de lá).
 */

export type DataOrigin = 'mock' | 'real';

export interface SmtpFailureDetails {
  /** `smtp` | `unresolvable_host` | `password_unreadable` | `blocked_host` — outros valores podem surgir; trate como `smtp`. */
  readonly kind: string;
  readonly serverMessage: string;
  readonly smtpCode?: string;
  readonly responseCode?: number;
  readonly command?: string;
}

export type ApiError =
  | { readonly kind: 'network'; readonly retryable: true }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'forbidden' }
  /**
   * 403 específico (`error.code === 'csrf_token_invalid'`) — sessão sem
   * token de CSRF válido (ex.: sessão criada antes da migração 0009, ver
   * `apps/api/src/routes/admin-auth-route.ts`). Diferente de `forbidden`
   * porque a saída é outra: nenhum retry resolve, só logar de novo.
   */
  | { readonly kind: 'csrf_invalid' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly reason: string }
  | { readonly kind: 'validation'; readonly fields: Readonly<Record<string, string>> }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds?: number }
  /** 401 `invalid_second_factor`: código errado/já usado. NÃO é sessão expirada — nunca dispara o logout global. */
  | { readonly kind: 'invalid_second_factor' }
  /** 401 `challenge_invalid`: desafio de login expirou (10 min), já foi usado ou é de outro tipo. Saída: voltar ao e-mail/senha. */
  | { readonly kind: 'challenge_invalid' }
  /** 429 `two_factor_locked`: 5 códigos errados seguidos, bloqueio de 15 min do CÓDIGO (por admin). Continua sendo bloqueio. */
  | { readonly kind: 'two_factor_locked'; readonly retryAfterSeconds: number }
  /**
   * 429 `account_locked`: ESPERA CURTA por par (e-mail + IP) depois de uma senha errada — 1 s, 2 s, 4 s… até 15 min
   * (login OU reautenticação; contrato `docs/contrato-admin-2fa.md`, I-6). NÃO é conta bloqueada: quem erra de outro IP
   * não atrapalha o dono. A tela mostra contagem regressiva e só trava o envio até ela acabar.
   */
  | { readonly kind: 'account_locked'; readonly retryAfterSeconds: number }
  /** 403 `password_invalid`: senha atual errada ao ligar/desligar/regenerar o 2FA. NÃO é sessão expirada. */
  | { readonly kind: 'password_invalid' }
  /** 403 `enrollment_token_invalid`: código de ativação ausente, errado, vencido, já usado ou de outro admin. */
  | { readonly kind: 'enrollment_token_invalid' }
  /** 503 `two_factor_unavailable`: servidor sem chave de cifra — falha fechada de propósito. */
  | { readonly kind: 'two_factor_unavailable' }
  /**
   * 400 `activation_token_invalid` (`POST /auth/activate`): e-mail inexistente, admin desativado, ou token
   * ausente/errado/vencido/já usado — SEMPRE a mesma resposta das quatro causas (sem oráculo de quais e-mails
   * de admin existem, revisão S1 rodada 3g). Nada no formulário indica qual delas foi; a tela só pode pedir
   * para conferir e-mail/token de novo ou pedir um novo convite.
   */
  | { readonly kind: 'activation_token_invalid' }
  /** 422 `smtp_host_blocked`: o host aponta para rede interna/reservada (trava de SSRF no servidor). */
  | { readonly kind: 'smtp_host_blocked' }
  /** 503 `encryption_unavailable`: servidor sem chave de cifra, não dá para guardar a senha no painel. */
  | { readonly kind: 'encryption_unavailable' }
  /** 409 `email_not_configured`: faltam campos para enviar (`host`, `port`, `from`, `password`). */
  | { readonly kind: 'email_not_configured'; readonly missing: readonly string[] }
  /** 502 `smtp_delivery_failed`: o servidor recusou ou não conectou; `serverMessage` é o texto EXATO dele. */
  | { readonly kind: 'smtp_delivery_failed'; readonly details: SmtpFailureDetails }
  /** 403 `two_factor_required_for_role`: dono/financeiro tentando desligar. */
  | { readonly kind: 'two_factor_required_for_role' }
  | { readonly kind: 'unavailable'; readonly retryable: true }
  /**
   * A API respondeu 200, mas num formato que este painel não conhece (campo obrigatório ausente, `status` de login que
   * não é um dos três do contrato, papel desconhecido). Quase sempre é painel e API publicados em versões diferentes.
   * FALHA FECHADA: nunca vale como login nem como sessão, e retry não resolve — só atualizar um dos dois lados.
   */
  | { readonly kind: 'contract_mismatch' }
  | { readonly kind: 'unknown'; readonly message: string };

export type Result<T> =
  | { readonly ok: true; readonly data: T; readonly origin: DataOrigin }
  | { readonly ok: false; readonly error: ApiError };

/** Mensagem curta e sem jargão, para mostrar na tela — nunca o `kind` cru. */
export function errorMessage(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return 'Não foi possível conectar à API. Verifique sua conexão e tente de novo.';
    case 'unauthorized':
      return 'Sua sessão expirou. Entre novamente.';
    case 'forbidden':
      return 'Seu usuário não tem permissão para ver isto.';
    case 'csrf_invalid':
      return 'Sua sessão não pôde confirmar esta ação por segurança. Saia e entre novamente para continuar.';
    case 'not_found':
      return 'Não encontramos esse registro.';
    case 'conflict':
      return 'Não foi possível concluir: a informação mudou enquanto você olhava.';
    case 'validation':
      return 'Verifique os campos marcados e tente novamente.';
    case 'rate_limited':
      return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.';
    case 'unavailable':
      return 'A API está indisponível no momento. Tente novamente em alguns minutos.';
    case 'invalid_second_factor':
      return 'Código inválido ou já usado. Confira o código digitado e tente de novo.';
    case 'challenge_invalid':
      return 'O tempo para confirmar o acesso acabou. Informe e-mail e senha novamente.';
    case 'two_factor_locked':
      return 'Muitas tentativas com código errado. O acesso a esta conta está bloqueado temporariamente.';
    case 'account_locked':
      // Espera por par (e-mail + IP), não bloqueio da conta. Texto igual para e-mail inexistente (o servidor também
      // não distingue), então não revela se a conta existe.
      return 'Aguarde antes de tentar de novo: é uma pausa curta de segurança depois de uma senha incorreta. A conta não está bloqueada.';
    case 'password_invalid':
      return 'Senha incorreta. Digite a senha atual da sua conta.';
    case 'enrollment_token_invalid':
      return 'Código de ativação inválido ou vencido. Peça um novo ao responsável técnico.';
    case 'two_factor_unavailable':
      return 'A verificação em duas etapas está indisponível. Contate o responsável técnico.';
    case 'activation_token_invalid':
      return 'Link de ativação inválido, vencido ou já usado. Confira o e-mail e o código, ou peça um novo convite a quem administra o painel.';
    case 'two_factor_required_for_role':
      return 'Seu papel exige a verificação em duas etapas; ela não pode ser desativada.';
    case 'smtp_host_blocked':
      return 'Este servidor aponta para uma rede interna ou endereço reservado e não é permitido.';
    case 'encryption_unavailable':
      return 'O servidor não tem a chave de cifra configurada, então a senha não pode ser guardada no painel. Use a variável de ambiente SMTP_PASS.';
    case 'email_not_configured':
      return 'Configure servidor, porta e remetente antes de testar.';
    case 'smtp_delivery_failed':
      return 'O envio de teste falhou.';
    case 'contract_mismatch':
      return 'Este painel e a API estão em versões diferentes. Não foi possível entrar. Avise o suporte técnico.';
    case 'unknown':
      return error.message || 'Algo deu errado. Tente novamente.';
  }
}
