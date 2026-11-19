import { createWaitlistHttpAdapter, type WaitlistPort } from '@vuumbora/api-client/waitlist';

/**
 * `NEXT_PUBLIC_WAITLIST_API_URL` é lida em build time (export estático: não
 * tem servidor Node rodando depois, então não existe "variável de ambiente
 * do runtime" — o valor fica embutido no bundle gerado pelo `next build`,
 * documentado em `apps/site/.env.example`).
 *
 * O backend (`apps/api`) ainda não está publicado (19/11/2026,
 * `docs/lista-de-espera.md` §7) — por isso esta variável normalmente NÃO
 * está definida ainda, e isso é esperado, não um erro: `getWaitlistPort()`
 * devolve `null` nesse caso, e `WaitlistForm` mostra um aviso honesto em
 * vez de simular um envio que não vai a lugar nenhum.
 */
const WAITLIST_API_URL = process.env['NEXT_PUBLIC_WAITLIST_API_URL'];

export function getWaitlistPort(): WaitlistPort | null {
  if (!WAITLIST_API_URL) return null;
  return createWaitlistHttpAdapter({ mode: 'http', baseUrl: WAITLIST_API_URL });
}
