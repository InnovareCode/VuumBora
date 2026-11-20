/**
 * Token de CSRF (sincronizador por sessão) — contrato fechado com a Vega em
 * 20/11/2026. A assunção original desta Lyra (double-submit cookie) NÃO
 * serve: um cookie legível por JS precisaria de `Domain=.vuumbora.com.br`
 * para o painel (`admin.vuumbora.com.br`) ler o que a API
 * (`api.vuumbora.com.br`) escreveu — e um subdomínio-irmão comprometido lê
 * o MESMO cookie pela mesma regra (a ameaça que o Órion apontou). Double
 * submit cookie não defende do ataque que deveria defender neste cenário.
 *
 * Formato real: o servidor manda o token só no CORPO JSON de
 * `POST /v1/admin/auth/login` e `GET /v1/admin/me` (campo `data.csrfToken`),
 * NUNCA em `Set-Cookie`. Ler corpo de resposta cross-origin exige CORS de
 * origem exata com credenciais — um subdomínio fora da lista de origens
 * nunca recebe o token, mesmo conseguindo disparar a requisição com o
 * cookie de sessão (que o navegador manda sozinho).
 *
 * Por isso isto é estado EM MEMÓRIA (nunca `localStorage`/cookie) — quem
 * popula é `src/api/auth.ts`, a cada login e a cada `/me` (inclusive no
 * boot da `AuthProvider`, que já chama `/me` para restaurar a sessão — é o
 * mesmo lugar que recupera o token depois de um F5).
 */
let currentToken: string | null = null;

export const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** `null` é um valor real (sessão criada antes da migração 0009, ver `apps/api`) — limpa o que houver, nunca mantém o token de uma sessão anterior. */
export function setCsrfToken(token: string | null): void {
  currentToken = token;
}

/** Chamado no logout e em qualquer 401 (ver `onUnauthorized` em `client.ts`) — token de uma sessão morta não serve para a próxima. */
export function clearCsrfToken(): void {
  currentToken = null;
}

export function readCsrfToken(): string | null {
  return currentToken;
}
