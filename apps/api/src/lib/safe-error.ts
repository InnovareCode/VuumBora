/**
 * Descrição de erro que é SEGURA para log. `err.message` nunca entra no log
 * deste serviço: o parser de JSON do Node ecoa trecho do corpo na mensagem
 * ("Unexpected token 'x', \"fulano@...\" is not valid JSON") e o `pg` ecoa
 * valor de coluna/UUID inválido — ou seja, dado pessoal do cliente
 * acabaria em texto puro no log. `name` + `code` (ex.: `FST_ERR_CTP_...`,
 * `23505`, `ECONNREFUSED`) bastam para diagnosticar sem carregar conteúdo.
 */
export function describeErrorForLog(err: unknown): { errorName: string; errorCode?: string } {
  if (typeof err !== 'object' || err === null) return { errorName: typeof err };
  const { name, code } = err as { name?: unknown; code?: unknown };
  return {
    errorName: typeof name === 'string' ? name : 'Error',
    ...(typeof code === 'string' || typeof code === 'number' ? { errorCode: String(code) } : {}),
  };
}
