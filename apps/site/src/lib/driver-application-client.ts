import {
  createDriverApplicationHttpAdapter,
  type DriverApplicationPort,
} from '@vuumbora/api-client/driver-applications';

/**
 * Mesma variável da lista de espera (`waitlist-client.ts`) de propósito: é o
 * MESMO serviço (`vuumbora-backend`), em endpoints diferentes. Uma env var só
 * no Easypanel liga os dois formulários de uma vez.
 *
 * Lida em build time — o site é export estático, não existe servidor Node
 * depois do `next build`. Enquanto o backend não estiver publicado ela não
 * está definida, e isso é esperado: a porta vem `null` e o formulário avisa
 * em vez de simular um envio que não chega a lugar nenhum.
 *
 * O adapter vem do contrato oficial em `@vuumbora/api-client/driver-applications`.
 * Houve aqui um cliente provisório, escrito em paralelo ao backend; ele mapeava
 * o erro 400 por `code` (`invalid_phone`, `invalid_email`...), e o servidor
 * responde `validation_failed` com um mapa `fields` de todos os campos errados
 * de uma vez. O resultado era que qualquer erro caía no campo e-mail. O
 * adapter oficial repassa `fields` inteiro, que é o que o formulário já lê.
 */
const DRIVER_APPLICATION_API_URL = process.env['NEXT_PUBLIC_WAITLIST_API_URL'];

export function getDriverApplicationPort(): DriverApplicationPort | null {
  if (!DRIVER_APPLICATION_API_URL) return null;
  return createDriverApplicationHttpAdapter({ mode: 'http', baseUrl: DRIVER_APPLICATION_API_URL });
}
