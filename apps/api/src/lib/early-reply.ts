/**
 * Resposta antecipada a partir de um hook ASYNC (`onRequest`/`preHandler`) que de fato INTERROMPE a cadeia.
 *
 * Causa raiz (achada na fatia D4, Fastify 5.12): depois que um hook async resolve, o Fastify só pula os próximos hooks e o
 * handler se `reply.sent` já for verdadeiro — e `reply.sent` é `raw.writableEnded`. Num contexto com hook `onSend`
 * ASSÍNCRONO (o das rotas públicas tem: `Cache-Control` da identidade e do motorista), o `send()` só termina a resposta
 * depois desse `onSend`; o hook de recusa resolve antes, e o HANDLER RODA mesmo com a recusa (401/403/409) já enviada.
 * Devolver `reply` do hook não muda nada nesta versão. O sintoma no log é "Reply was already sent" — e, num portão de
 * compromisso, a ação acontece apesar do 409.
 *
 * Correção: logo depois de `reply.send()`, o hook ESPERA a resposta terminar (`untilSent`). Quando ele resolve,
 * `reply.sent` é verdadeiro e o Fastify encerra a cadeia. Todo hook que recusa usa isto.
 */
import type { FastifyReply } from 'fastify';

/**
 * Resolve quando a resposta terminou (ou a conexão caiu). Chame SÓ depois de `reply.send()`: a resposta tem de estar a
 * caminho, senão nunca termina.
 */
export function untilSent(reply: FastifyReply): Promise<void> {
  const raw = reply.raw;
  if (raw.writableEnded || raw.destroyed) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      raw.off('finish', finish);
      raw.off('close', finish);
      resolve();
    };
    raw.once('finish', finish);
    raw.once('close', finish);
  });
}

/** Envia a recusa e só devolve quando ela terminou: o próximo hook e o handler não rodam. */
export async function refuseAndStop(reply: FastifyReply, status: number, body: unknown): Promise<void> {
  reply.code(status).send(body);
  await untilSent(reply);
}
