---
name: feedback-fastify-logger-querystring-pii
description: Logger padrão do Fastify/pino grava a querystring inteira em toda linha de requisição — checar sempre que uma rota tiver busca livre ou outro parâmetro sensível em query string.
metadata:
  type: feedback
---

**Causa raiz:** o serializer `req` padrão do Fastify (vem de `pino-http`,
`node_modules/fastify/lib/logger-pino.js`) usa `req.url` crua — que no Node
inclui a querystring — em toda linha "incoming request"/"request
completed". Qualquer rota com busca livre (`?q=...`) ou outro parâmetro
sensível em query vira texto puro no log, mesmo sem nenhum `request.log.info`
explícito no código da rota — o vazamento é automático, no ciclo de vida
que o Fastify já loga sozinho.

**Correção:** registrar `logger.serializers.req` customizado em
`Fastify({...})` que corta a querystring antes de logar
(`url.split('?')[0]`), **para todo o serviço**, não rota a rota — redigir só
o parâmetro conhecido hoje (`q`) deixa a próxima rota sensível vazando por
padrão. Ver `apps/api/src/app.ts` no VuumBora para o padrão já aplicado
(aplicável a qualquer serviço Fastify novo).

**Pegadinha de tipagem (TS):** o tipo de retorno do serializer tem
`remotePort?: number` — passar `remotePort: x ?? undefined` quebra porque o
Fastify não aceita `undefined` explícito nessa posição (só "ausente" ou
`number`). Usar spread condicional: `...(x !== undefined ? {remotePort: x} : {})`.
Esse erro de tipo isolado derruba a inferência do overload de `Fastify(...)`
inteiro e produz ~6 erros aparentemente desconexos sobre `Http2SecureServer`
— se isso aparecer, olhar primeiro o tipo de retorno do serializer custom,
não a assinatura de `Fastify()`.

**Como provar (não só ler o código):** reproduzir a rota com um valor único
no parâmetro suspeito, depois `grep` o ARQUIVO DE LOG INTEIRO por esse
valor — zero ocorrências. Ler só a linha esperada não basta como prova.
