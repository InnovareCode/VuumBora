/**
 * Mesmo padrão de `@vuumbora/api-client` (portas & adaptadores, `Result<T>`
 * com origem explícita) — reimplementado aqui, não importado, porque aquele
 * pacote é a porta dos apps RN (passageiro/motorista) e o admin é um
 * consumidor novo, fora daquele perfil. Ver também §5 de docs/plano-sistema.md
 * (envelope e famílias de erro — os `kind` abaixo espelham a tabela de lá).
 */

export type DataOrigin = 'mock' | 'real';

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
  | { readonly kind: 'unavailable'; readonly retryable: true }
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
    case 'unknown':
      return error.message || 'Algo deu errado. Tente novamente.';
  }
}
