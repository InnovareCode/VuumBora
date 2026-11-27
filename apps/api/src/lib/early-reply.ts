/**
 * Resposta antecipada a partir de um hook ASYNC (`onRequest`/`preHandler`) que de fato INTERROMPE a cadeia — inclusive
 * quando o cliente derruba a conexão no meio.
 *
 * Causa raiz (achada na fatia D4, Fastify 5.12): quando um hook async resolve, o Fastify só pula os próximos hooks e o
 * handler se `reply.sent` já for verdadeiro — e `reply.sent` é `kReplyHijacked || raw.writableEnded`. Num contexto com
 * `onSend` ASSÍNCRONO (que espera de verdade, ou troca o corpo por stream, como compressão), o `send()` só termina a
 * resposta depois desse `onSend`; se o hook de recusa resolver antes, o HANDLER RODA com o 401/403/409 já a caminho.
 *
 * `return reply` no hook também segura a cadeia no fluxo normal (o `Reply` é "thenable": `Reply.prototype.then` espera
 * o fim da resposta). Mas nem ele nem esperar `finish`/`close` seguram o ABORTO: se o cliente derruba a conexão antes
 * de a resposta terminar, a espera resolve com `writableEnded === false` e o Fastify segue para o handler — a ação
 * aconteceria sem autorização, só sem resposta para o atacante (revisão M3-D3/D4, IMP-1).
 *
 * Correção: depois de enviar, ESPERA a resposta terminar e, se ela não terminou (conexão caiu), `reply.hijack()`:
 * `reply.sent` passa a ser verdadeiro pela outra metade da condição e a cadeia para. Nenhuma das duas paradas depende
 * de `writableEnded`. Todo hook que recusa usa `refuseAndStop` (ou `stopAfterSend` depois de um helper que já enviou).
 */
import type { FastifyReply } from 'fastify';

/** Resolve quando a resposta terminou ou a conexão caiu. Chame SÓ depois de `reply.send()` (senão espera para sempre). */
function untilFinishedOrClosed(reply: FastifyReply): Promise<void> {
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

/**
 * Depois de um `send()` de recusa: espera e, se a resposta não terminou (cliente derrubou a conexão), assume a resposta
 * (`hijack`) para o Fastify não seguir para o handler. Quando resolve, `reply.sent` é SEMPRE verdadeiro.
 */
export async function stopAfterSend(reply: FastifyReply): Promise<void> {
  await untilFinishedOrClosed(reply);
  if (!reply.sent) reply.hijack();
}

/** Envia a recusa e só devolve quando a cadeia está parada: o próximo hook e o handler não rodam. */
export async function refuseAndStop(reply: FastifyReply, status: number, body: unknown): Promise<void> {
  reply.code(status).send(body);
  await stopAfterSend(reply);
}
