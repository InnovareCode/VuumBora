/**
 * Thread de trabalho dos testes do vigia de prazo do pool de bcrypt (`bcrypt-pool.test.ts`): igual à de produção
 * (`src/lib/bcrypt-worker.ts`), EXCETO que uma operação cuja senha é `trava` entra num laço síncrono infinito e nunca
 * responde, como um `compareSync` que não termina. Só `Worker.terminate()` a para; é o que prova que o vigia interrompe
 * JS síncrono (o caso do bcryptjs) e que o resto da pista segue servindo.
 *
 * O ouvinte que trava é registrado ANTES de carregar o worker real: os dois ouvintes recebem a mensagem, na ordem de
 * registro, e o laço infinito impede o worker real de responder. Só sintaxe apagável do TypeScript (roda sob o `tsx`).
 */
import { parentPort } from 'node:worker_threads';

parentPort?.on('message', (request: { password?: string }) => {
  if (request.password === 'trava') {
    for (;;) {
      // trava até alguém chamar terminate()
    }
  }
});

await import('../../src/lib/bcrypt-worker.js');
