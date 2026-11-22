import type { Result } from '@vuumbora/api-client';

/**
 * Toda chamada de identidade das telas passa por aqui. O cliente devolve `Result` e não rejeita no caminho normal,
 * mas pode lançar por falha que não é de rede (ex.: o aparelho não gera o `installationId`, o web sem contexto seguro
 * não tem `crypto.randomUUID`). Sem este abrigo a exceção escapa da tela: o botão fica em "carregando" para sempre e a
 * pessoa não tem o que fazer. Aqui vira o erro `unknown` ("Algo deu errado"), que a tela já sabe mostrar.
 * Registra só o NOME do erro: a mensagem pode carregar dado da pessoa.
 */
export async function safeCall<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch (error) {
    console.warn('[identity] a chamada lançou exceção', error instanceof Error ? error.name : 'erro');
    return { ok: false, error: { kind: 'unknown', message: 'Falha inesperada.' } };
  }
}
