/**
 * Texto e AÇÃO de cada erro de geografia e cotação, por contexto da tela. A tela ramifica no `code` do catálogo
 * (`GEO_QUOTE_ERRORS`, `@vuumbora/api-client/passenger`) e, sem `code`, no `kind` — nunca na `message` do servidor.
 *
 * O mapa abaixo é um `Record` sobre TODOS os códigos do catálogo: um código novo no contrato quebra o `tsc` aqui até
 * alguém decidir o texto dele (é o que garante que nenhum erro cai no texto genérico sem querer).
 *
 * Regra que não pode se perder: `503 fare_not_configured` é "ainda não operamos", NÃO "tente de novo" (N8, decisão 7 em
 * aberto). A ação dele é voltar ao início, nunca repetir a chamada.
 */
import type { ApiError } from '@vuumbora/api-client';
import { GEO_QUOTE_ERRORS, type GeoQuoteErrorCode } from '@vuumbora/api-client/passenger';

/** Onde o erro aconteceu: muda o texto ("buscar endereço" x "calcular o preço"), não a regra. */
export type GeoProblemContext = 'search' | 'pin' | 'quote' | 'confirm';

/**
 * - `retry`: repetir a mesma chamada;
 * - `change_route`: voltar à P04 para trocar origem ou destino (o trajeto é o problema);
 * - `requote`: pedir uma cotação nova (preço venceu ou sumiu) e mostrar "O preço foi atualizado";
 * - `home`: voltar ao início (não adianta repetir);
 * - `sign_in`: sessão expirou, entrar de novo.
 */
export type GeoProblemAction = 'retry' | 'change_route' | 'requote' | 'home' | 'sign_in';

export interface GeoProblemView {
  /** Código que decidiu o texto (do catálogo, `network` ou `unknown`): vai para o `testID` e para a prova. */
  readonly key: GeoProblemKey;
  readonly title: string;
  readonly description: string;
  readonly action: GeoProblemAction;
  readonly actionLabel: string;
}

export type GeoProblemKey = GeoQuoteErrorCode | 'network' | 'unknown';

type ProblemText = Omit<GeoProblemView, 'key'>;

const RETRY = 'Tentar de novo';

function retryText(title: string, description = 'Tente de novo em instantes.'): ProblemText {
  return { title, description, action: 'retry', actionLabel: RETRY };
}

const COULD_NOT_SEARCH = retryText('Não conseguimos buscar agora.');
const COULD_NOT_CHECK_POINT = retryText('Não conseguimos achar o endereço deste ponto.');
const COULD_NOT_PRICE = retryText('Não conseguimos calcular o preço agora.');

const PRICE_UPDATED: ProblemText = {
  title: 'O preço foi atualizado.',
  description: 'Confira o valor novo antes de continuar.',
  action: 'requote',
  actionLabel: 'Ver preço novo',
};

const GENERIC: Readonly<Record<GeoProblemContext, ProblemText>> = {
  search: COULD_NOT_SEARCH,
  pin: COULD_NOT_CHECK_POINT,
  quote: COULD_NOT_PRICE,
  confirm: COULD_NOT_PRICE,
};

const PROBLEMS: Readonly<Record<GeoProblemKey, (context: GeoProblemContext) => ProblemText>> = {
  network: (context) =>
    ({
      search: retryText('Sem conexão para buscar endereços novos.', 'Confira sua internet e tente de novo.'),
      pin: retryText('Sem conexão para conferir este ponto.', 'Confira sua internet e tente de novo.'),
      quote: retryText('Sem conexão para calcular o preço.', 'Confira sua internet e tente de novo.'),
      confirm: retryText('Sem conexão para confirmar o preço.', 'Confira sua internet e tente de novo.'),
    })[context],
  // Corpo recusado pelo servidor: é defeito do app, não da pessoa. Texto genérico de "tente de novo".
  invalid_body: (context) => GENERIC[context],
  unauthorized: () => ({
    title: 'Sua sessão expirou.',
    description: 'Entre de novo para continuar.',
    action: 'sign_in',
    actionLabel: 'Entrar de novo',
  }),
  // Cotação inexistente (ou de outra conta) e cotação vencida: em qualquer dos dois, o caminho é cotar de novo.
  not_found: (context) => (context === 'quote' || context === 'confirm' ? PRICE_UPDATED : GENERIC[context]),
  quote_expired: (context) => (context === 'quote' || context === 'confirm' ? PRICE_UPDATED : GENERIC[context]),
  outside_service_area: (context) =>
    context === 'search' || context === 'pin'
      ? {
          title: 'Este ponto fica fora da área atendida.',
          description: 'Por enquanto, atendemos só a Grande Natal.',
          action: 'change_route',
          actionLabel: 'Escolher outro ponto',
        }
      : {
          title: 'Ainda não atendemos este trajeto.',
          description: 'Por enquanto, atendemos só a Grande Natal.',
          action: 'change_route',
          actionLabel: 'Trocar destino',
        },
  route_too_short: () => ({
    title: 'O destino está muito perto da origem.',
    description: 'Escolha um destino mais distante.',
    action: 'change_route',
    actionLabel: 'Trocar destino',
  }),
  rate_limited: (context) =>
    context === 'search'
      ? retryText('Muitas buscas seguidas.', 'Aguarde um pouco e tente de novo.')
      : retryText('Muitas tentativas seguidas.', 'Aguarde um pouco e tente de novo.'),
  route_unavailable: (context) => (context === 'quote' || context === 'confirm' ? retryText('Não conseguimos calcular a rota agora.') : GENERIC[context]),
  geo_unavailable: (context) => GENERIC[context],
  // N8: produção sem tarifa definitiva. NÃO é falha passageira: repetir não muda nada.
  fare_not_configured: () => ({
    title: 'Ainda não estamos operando.',
    description: 'As corridas da VuumBora ainda não começaram. Quando começarem, o preço aparece aqui.',
    action: 'home',
    actionLabel: 'Voltar ao início',
  }),
  unknown: (context) => GENERIC[context],
};

function isCatalogCode(code: string | undefined): code is GeoQuoteErrorCode {
  return code !== undefined && Object.prototype.hasOwnProperty.call(GEO_QUOTE_ERRORS, code);
}

/** Qual linha do mapa vale para este erro: o `code` do catálogo primeiro; sem ele, o `kind`. */
export function geoProblemKey(error: ApiError): GeoProblemKey {
  if (isCatalogCode(error.code)) return error.code;
  switch (error.kind) {
    case 'network':
      return 'network';
    case 'unauthorized':
      return 'unauthorized';
    case 'rate_limited':
      return 'rate_limited';
    case 'not_found':
      return 'not_found';
    case 'conflict':
      return isCatalogCode(error.reason) ? error.reason : 'unknown';
    default:
      return 'unknown';
  }
}

export function describeGeoProblem(error: ApiError, context: GeoProblemContext): GeoProblemView {
  const key = geoProblemKey(error);
  return { key, ...PROBLEMS[key](context) };
}
