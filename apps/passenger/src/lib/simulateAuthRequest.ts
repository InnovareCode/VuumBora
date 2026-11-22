/**
 * Não existe backend de autenticação ainda (ver docs/decisoes-do-dono.md). Esta
 * função é um placeholder só para a UI exibir carregando/sucesso de forma real —
 * quando a Vega definir o contrato de login/cadastro, isto deve ser substituído
 * pela chamada de verdade (mesmo formato de retorno: Promise que resolve ou rejeita).
 */
export function simulateAuthRequest<T>(values: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(values), 700);
  });
}
