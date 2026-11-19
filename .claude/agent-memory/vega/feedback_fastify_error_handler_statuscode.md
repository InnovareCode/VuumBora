---
name: feedback-fastify-error-handler-statuscode
description: Bug real em Fastify — setErrorHandler global que ignora err.statusCode vira 500 para tudo (corpo malformado, @fastify/rate-limit). Checar sempre que adicionar setErrorHandler num serviço Fastify.
metadata:
  type: feedback
---

**Causa raiz:** um `app.setErrorHandler(...)` escrito "genérico" (assumindo
que só vai capturar erros inesperados do handler) na verdade intercepta
TODO erro lançado em qualquer fase do ciclo de vida da requisição —
inclusive erros que já deveriam ser 4xx: corpo JSON malformado/vazio
(Fastify lança com `statusCode: 400`), payload maior que `bodyLimit`
(413), e principalmente **`@fastify/rate-limit`**, cujo
`errorResponseBuilder` não devolve o corpo final da resposta — o plugin dá
`throw` no valor retornado (ver `node_modules/@fastify/rate-limit/index.js`,
`throw params.errorResponseBuilder(req, respCtx)`). Se o handler global só
olha `err.message` e sempre responde 500, todo 429 de rate limit e todo 400
de corpo malformado viram 500 "erro interno" — sintoma observado: numa
sequência de requisições, só a primeira (que passa da validação) teve
comportamento correto; a partir da que excedeu o rate limit, tudo virou 500
sem mensagem (porque o objeto lançado pelo rate-limit não tinha `.message`
útil pro meu código custom).

**Correção:** `setErrorHandler` tem que LER `err.statusCode` (default 500
só se ausente) e responder de acordo — 429 vira corpo próprio de
`rate_limited`, qualquer 4xx vira corpo próprio de "requisição inválida",
só o que sobra (sem `statusCode` ou já 5xx) é "erro interno" de verdade. E
o `errorResponseBuilder` do `@fastify/rate-limit` só precisa devolver algo
com `statusCode: 429` — o corpo de resposta final já fica a cargo do
`setErrorHandler`, não do builder.

**Como evitar a próxima vez:** sempre que registrar
`setErrorHandler`/`errorResponseBuilder` num serviço Fastify, testar de
verdade com `curl` repetido (não só leitura de código): corpo JSON
malformado, corpo vazio, e disparar o rate limit de propósito (configurar
um `max` baixo temporariamente no teste). Os três casos têm que devolver o
status HTTP e o corpo estruturado certos — nunca 500 genérico. Ver
`apps/api/src/app.ts` no VuumBora para o padrão já corrigido (aplicável a
qualquer serviço Fastify novo, não só este projeto).
