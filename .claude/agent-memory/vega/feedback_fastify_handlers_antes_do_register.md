---
name: feedback-fastify-handlers-antes-do-register
description: setErrorHandler/setNotFoundHandler definidos DEPOIS de `await app.register(...)` nao chegam as rotas encapsuladas; o erro cai no handler padrao do Fastify, que loga err.message/stack e responde fora do envelope.
metadata:
  type: feedback
---

**Causa raiz (21/11/2026, `apps/api/src/app.ts`):** `await app.register(plugin)` cria o contexto
encapsulado na hora, herdando os handlers do pai *naquele momento*. O `setErrorHandler` /
`setNotFoundHandler` estavam no fim do `buildApp`, entao NUNCA valiam para `/v1/admin/*` nem para as
rotas publicas: corpo malformado voltava `{statusCode, code, error, message}` (fora do envelope
`{ok:false,error}`) e o erro era logado pelo handler padrao, que grava `err.message` + `err.stack`
(+ `msg`). Era o vazamento de PII em log que o handler "sanitizado" nao conseguia impedir.

**Correcao:** handlers definidos logo apos `Fastify()`, antes de qualquer `register`; log de erro
so com `describeErrorForLog` (`lib/safe-error.ts`: nome + code, nunca message); serializer `err` do
pino como rede de seguranca; `buildApp({ logStream })` para testar o que foi logado.

**Como evitar:** em app Fastify com contextos encapsulados, a ordem do codigo importa para handlers.
Teste de erro tem que usar rota DENTRO de um `register`. Nunca logar `err.message`: parser de JSON
do Node e o `pg` (uuid invalido, valor de coluna) ecoam dado do cliente na mensagem.
Mutacao verificada: trocar por `message: err.message` derruba o teste do 500; mover handlers para
depois dos register derruba o teste do corpo malformado.
