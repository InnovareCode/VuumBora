/**
 * `exactOptionalPropertyTypes: true` rejeita `errorMessage: string | undefined` passado
 * a uma prop opcional `errorMessage?: string` (InputCore/ButtonCore) — tem que omitir a
 * chave de vez quando não há mensagem, não valer `undefined`. Ver memória da Lyra:
 * feedback_medir_expo_web_playwright.
 */
export function fieldErrorProps(error?: { message?: string }): { error: boolean; errorMessage?: string } {
  if (!error) return { error: false };
  return error.message !== undefined ? { error: true, errorMessage: error.message } : { error: true };
}
