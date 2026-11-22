/**
 * Thread de trabalho do bcrypt (ver `bcrypt-pool.ts`). Roda FORA da thread principal: o bcryptjs é JS puro e,
 * na thread principal, cada comparação de custo 12 ocupa o laço de eventos por centenas de milissegundos
 * (medido: 478 ms por comparação e atraso de laço de ~1 s com 10 em paralelo) e o `/healthz` para de responder.
 *
 * Aqui se usa a versão SÍNCRONA do bcryptjs de propósito: esta thread só faz isto, então não há laço a proteger,
 * e a versão assíncrona só acrescentaria cortes e retomadas. A biblioteca é a mesma de antes: o algoritmo e o
 * formato do hash não mudam, então todo hash já gravado continua válido (provado em `test/bcrypt-pool.test.ts`).
 *
 * Só sintaxe apagável do TypeScript (sem enum nem parâmetro-propriedade): o arquivo também roda direto sob o `tsx`.
 * A senha chega por `postMessage` e nunca é logada; um erro volta só como nome, jamais como mensagem.
 */
import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

export type BcryptRequest =
  | { readonly op: 'hash'; readonly password: string; readonly cost: number }
  | { readonly op: 'compare'; readonly password: string; readonly hash: string };

export type BcryptResponse =
  | { readonly ok: true; readonly value: string | boolean }
  | { readonly ok: false; readonly errorName: string };

parentPort?.on('message', (request: BcryptRequest) => {
  let response: BcryptResponse;
  try {
    response = {
      ok: true,
      value: request.op === 'hash' ? bcrypt.hashSync(request.password, request.cost) : bcrypt.compareSync(request.password, request.hash),
    };
  } catch (err) {
    response = { ok: false, errorName: err instanceof Error ? err.name : 'Error' };
  }
  parentPort?.postMessage(response);
});
