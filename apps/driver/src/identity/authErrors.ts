/**
 * Erro do `api-client` de identidade -> o que a TELA mostra. Um lugar só: todas as telas de conta (login, criar conta,
 * código, esqueci/redefinir senha) passam por `describeAuthError`, então o mesmo código de erro tem o mesmo texto e
 * o mesmo comportamento em qualquer tela (README do api-client: ramifique em `kind`, escolha o texto por `code`).
 *
 * Regras que esta função garante:
 *  - o texto é NOSSO (português, escrito aqui); a `message` do servidor nunca vai para a tela;
 *  - `too_many_attempts` fala em ESPERA ("aguarde...") e nunca em conta trancada — o contrato é explícito: a conta
 *    não é bloqueada, só o par identificador+IP espera. A palavra "bloqueada" não aparece em nenhum texto;
 *  - `invalid_credentials` não diz se o e-mail existe nem qual dos dois campos está errado;
 *  - código que o mock não produz (503, sem rede) tem o mesmo tratamento: é a `kind` que decide, não a origem.
 *
 * Copy do MOTORISTA (B2): aqui "conta" nunca vira "cadastro". Criar a conta no app não abre o cadastro de motorista
 * (documentos, veículo, análise), que é outra etapa e só abre com as regras de taxa e repasse publicadas. Por isso
 * nenhum texto deste arquivo usa "cadastro"/"cadastrar"/"cadastrado" para falar da conta (o passageiro usa; aqui não).
 * A revisão de copy procura essas palavras: se uma aparecer, é erro de texto, não de código.
 */
import type { ApiError } from '@vuumbora/api-client';

/**
 * `code_request` = pedir código por e-mail (esqueci a senha, reenviar o código de confirmação).
 * `consent` = carregar os Termos/Política e o reaceite (`src/legal`): chamadas que não são de login nem de criar conta.
 */
export type AuthErrorContext = 'login' | 'register' | 'verify' | 'code_request' | 'reset' | 'consent';

/** Chave estável de cada estado de tela (a revisão e os testes usam estes nomes). */
export type AuthErrorKey =
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'too_many_attempts'
  | 'invalid_code'
  | 'code_locked'
  | 'code_expired'
  | 'reset_locked'
  | 'email_taken'
  | 'invalid_email'
  | 'invalid_password'
  | 'invalid_phone'
  | 'invalid_birth_date'
  | 'underage'
  | 'consent_required'
  | 'consent_unavailable'
  | 'consent_outdated'
  | 'invalid_body'
  | 'network'
  | 'unavailable'
  | 'unknown';

/** Campo do formulário a que o erro pertence (a tela decide como mapear para os próprios campos). */
export type AuthErrorField = 'email' | 'password' | 'newPassword' | 'phone' | 'birthDate' | 'consent' | 'code';

export type AuthErrorAction = 'go_verify' | 'go_login' | 'go_forgot' | 'resend_code' | 'restart_register' | 'retry';

export type AuthErrorTone = 'danger' | 'warning' | 'info';

export interface AuthErrorView {
  readonly key: AuthErrorKey;
  readonly tone: AuthErrorTone;
  readonly title?: string;
  readonly message: string;
  /** Campo afetado. Com `presentation: 'field'` a mensagem vai no campo; com `'alert'` o campo só fica destacado. */
  readonly field?: AuthErrorField;
  readonly presentation: 'field' | 'alert';
  /** Espera do servidor, em segundos (`too_many_attempts`). Ausente = o servidor não disse quanto. */
  readonly retryAfterSeconds?: number;
  readonly attemptsLeft?: number;
  readonly actions: readonly AuthErrorAction[];
}

const KNOWN_KEYS: ReadonlySet<string> = new Set<AuthErrorKey>([
  'invalid_credentials',
  'email_not_verified',
  'too_many_attempts',
  'invalid_code',
  'code_locked',
  'code_expired',
  'reset_locked',
  'email_taken',
  'invalid_email',
  'invalid_password',
  'invalid_phone',
  'invalid_birth_date',
  'underage',
  'consent_required',
  'consent_unavailable',
  'consent_outdated',
  'invalid_body',
]);

/** O `code` do servidor manda; sem `code` conhecido, cai na família (`kind`). */
export function authErrorKey(error: ApiError): AuthErrorKey {
  if (error.code !== undefined && KNOWN_KEYS.has(error.code)) return error.code as AuthErrorKey;
  switch (error.kind) {
    case 'network':
      return 'network';
    case 'unavailable':
      return 'unavailable';
    case 'rate_limited':
      return 'too_many_attempts';
    case 'validation':
      return 'invalid_body';
    default:
      return 'unknown';
  }
}

const WAIT_TITLE: Record<AuthErrorContext, string> = {
  login: 'Muitas tentativas de entrada',
  register: 'Muitas tentativas de criar a conta',
  verify: 'Muitas tentativas de confirmação',
  code_request: 'Muitos pedidos de código',
  reset: 'Muitas tentativas de redefinição',
  consent: 'Muitas tentativas seguidas',
};

const WAIT_MESSAGE: Record<AuthErrorContext, string> = {
  login: 'Por segurança, aguarde um pouco antes de tentar entrar de novo.',
  register: 'Aguarde um pouco antes de tentar criar a conta de novo.',
  verify: 'Aguarde um pouco antes de tentar confirmar de novo.',
  code_request: 'Aguarde um pouco antes de pedir outro código.',
  reset: 'Aguarde um pouco antes de tentar de novo.',
  consent: 'Aguarde um pouco antes de tentar de novo.',
};

function attemptsText(attemptsLeft: number | undefined): string {
  if (attemptsLeft === undefined) return '';
  if (attemptsLeft <= 0) return ' As tentativas deste código acabaram: peça um novo código.';
  return ` Você ainda tem ${attemptsLeft} ${attemptsLeft === 1 ? 'tentativa' : 'tentativas'} com este código.`;
}

export function describeAuthError(context: AuthErrorContext, error: ApiError): AuthErrorView {
  const key = authErrorKey(error);
  const attemptsLeft = error.attemptsLeft;

  switch (key) {
    case 'invalid_credentials':
      return alert(key, 'danger', 'E-mail/ID ou senha incorretos. Confira os dados e tente de novo.');

    case 'email_not_verified':
      return alert(key, 'warning', 'Falta confirmar seu e-mail. Digite o código que enviamos para continuar.', {
        title: 'E-mail ainda não confirmado',
        actions: ['go_verify'],
      });

    case 'too_many_attempts':
      return alert(key, 'warning', WAIT_MESSAGE[context], {
        title: WAIT_TITLE[context],
        // Sem `retryAfterSeconds` (limite global sem corpo rico) não há contagem para inventar.
        ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      });

    case 'invalid_code': {
      // Ao criar a conta o servidor não diz se foi o código ou a senha (mesma resposta, de propósito).
      const base =
        context === 'verify'
          ? 'Código ou senha incorretos. Confira o código e a senha que você escolheu ao criar a conta.'
          : 'Código incorreto. Confira o código que chegou no seu e-mail.';
      const exhausted = attemptsLeft !== undefined && attemptsLeft <= 0;
      return {
        key,
        tone: 'danger',
        message: `${base}${attemptsText(attemptsLeft)}`,
        // Em `verify` o erro pode ser do código OU da senha: fica no aviso, não num campo só.
        presentation: context === 'verify' ? 'alert' : 'field',
        field: 'code',
        ...(attemptsLeft !== undefined ? { attemptsLeft } : {}),
        actions: [...(exhausted ? (['resend_code'] as const) : []), ...(context === 'verify' ? (['restart_register'] as const) : [])],
      };
    }

    case 'code_locked':
      return alert(key, 'danger', 'Muitas tentativas com este código. Peça um novo código.', {
        field: 'code',
        actions: ['resend_code'],
      });

    case 'code_expired':
      return alert(key, 'danger', 'Este código expirou, já foi usado ou não existe. Peça um novo código.', {
        field: 'code',
        actions: ['resend_code'],
      });

    case 'reset_locked':
      // O servidor manda 24 h em `retryAfterSeconds`; uma contagem de 24 h não ajuda ninguém: texto, sem contagem.
      return alert(key, 'danger', 'Houve muitas tentativas de redefinição nesta conta. Tente novamente mais tarde ou fale com o suporte.', {
        title: 'Redefinição indisponível por enquanto',
      });

    case 'email_taken':
      // Contas separadas por tipo: o aviso fala da conta de MOTORISTA (o mesmo e-mail pode ter uma de passageiro).
      return alert(key, 'danger', 'Já existe uma conta de motorista com este e-mail. Entre nela ou, se não lembra a senha, redefina-a.', {
        field: 'email',
        actions: ['go_login', 'go_forgot'],
      });

    case 'invalid_email':
      return fieldError(key, 'email', 'Informe um e-mail válido, como nome@exemplo.com.');

    case 'invalid_password':
      return fieldError(
        key,
        context === 'reset' ? 'newPassword' : 'password',
        'A senha precisa ter pelo menos 8 caracteres e no máximo 72. Acentos e símbolos contam mais de um.',
      );

    case 'invalid_phone':
      return fieldError(key, 'phone', 'Celular inválido. Informe DDD + número.');

    case 'invalid_birth_date':
      return fieldError(key, 'birthDate', 'Data de nascimento inválida. Use dia/mês/ano, por exemplo 15/05/1990.');

    case 'underage':
      return fieldError(key, 'birthDate', 'É preciso ter 18 anos ou mais para criar uma conta.');

    case 'consent_required':
      return fieldError(key, 'consent', 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.');

    case 'consent_unavailable':
      // 503 do servidor enquanto os textos legais não foram publicados: não é erro da pessoa nem falha passageira.
      // "Criar contas" e não "o cadastro": cadastro de motorista é outra etapa (ver o topo do arquivo).
      return alert(key, 'info', 'Estamos finalizando os Termos de Uso e a Política de Privacidade. Tente de novo em breve.', {
        title: 'A criação de contas ainda não está aberta',
      });

    case 'consent_outdated':
      // 409: a versão que a pessoa VIU deixou de ser a vigente. Nada foi gravado. Quem renderiza troca os textos (usa
      // `error.current` ou busca de novo) e desmarca os aceites: o cliente nunca reenvia sozinho. Sem `field`: não é
      // um campo errado, é o texto que mudou.
      return alert(key, 'warning', 'Os Termos de Uso ou a Política de Privacidade foram atualizados. Leia os textos novos e aceite de novo para continuar.', {
        title: 'Os textos foram atualizados',
      });

    case 'invalid_body':
      return alert(key, 'danger', 'Não conseguimos processar os dados enviados. Revise os campos e tente de novo.');

    case 'network':
      return alert(key, 'danger', 'Sem conexão com a internet. Confira sua rede e tente de novo.', {
        title: 'Você está sem conexão',
      });

    case 'unavailable':
      return alert(key, 'danger', 'O serviço está indisponível no momento. Tente de novo em instantes.', {
        title: 'Serviço indisponível',
      });

    case 'unknown':
      return alert(key, 'danger', 'Algo deu errado. Tente de novo.');
  }
}

interface AlertExtras {
  readonly title?: string;
  readonly field?: AuthErrorField;
  readonly retryAfterSeconds?: number;
  readonly actions?: readonly AuthErrorAction[];
}

function alert(key: AuthErrorKey, tone: AuthErrorTone, message: string, extras: AlertExtras = {}): AuthErrorView {
  return {
    key,
    tone,
    message,
    presentation: 'alert',
    actions: extras.actions ?? [],
    ...(extras.title !== undefined ? { title: extras.title } : {}),
    ...(extras.field !== undefined ? { field: extras.field } : {}),
    ...(extras.retryAfterSeconds !== undefined ? { retryAfterSeconds: extras.retryAfterSeconds } : {}),
  };
}

function fieldError(key: AuthErrorKey, field: AuthErrorField, message: string): AuthErrorView {
  return { key, tone: 'danger', message, field, presentation: 'field', actions: [] };
}
