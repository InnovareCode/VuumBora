---
name: project-admin-v0-vazamento-pii-log-querystring
description: Bug encontrado em 20/11/2026 na API do Admin v0 (busca vazava PII pro log) — CORRIGIDO e reconfirmado no mesmo dia, com prova por mutação
metadata:
  type: project
---

**STATUS: corrigido e revalidado em 20/11/2026.** `apps/api/src/app.ts` ganhou
`serializers.req` cortando a querystring antes de logar (função
`pathnameOnly`). Reconfirmei com `grep -a -c <valor único> <log> == 0` numa
API rodando de verdade, e PROVEI por mutação: removi o serializer de
propósito, rodei a mesma busca, o valor voltou a aparecer no log (1
ocorrência) — recoloquei o fix e revalidei zero de novo. `pathname` continua
logado (observabilidade preservada). Ver
[[feedback-tsx-watch-eaddrinuse-restart-falho]] — achadilha ao restaurar o
código depois da mutação.

O relato original do bug (como referência) fica abaixo.

`apps/api/src/app.ts` monta o Fastify só com `logger: { level: env.LOG_LEVEL
}` — sem `serializers` nem `redact`. O logger padrão do Fastify (pino) grava
`req.url` INTEIRO (com querystring) em toda linha "incoming request". A rota
`GET /v1/admin/driver-applications?q=...` é busca livre por nome, e-mail,
telefone e cidade (`admin-driver-application-repository.ts`) — então todo
termo que o admin digita na busca (que pode ser um nome ou telefone de
candidato de verdade) vai pro stdout/arquivo de log da API em texto puro.

Reproduzido: buscar `?q=84977000000` (telefone de teste) apareceu literal na
linha de log `"incoming request"`. Login (senha) NÃO vaza — o Fastify não
loga corpo da requisição por padrão, só a rota de busca é afetada, porque é
a única PII que viaja pela URL.

**Por quê isto importa:** é justamente o item que o Atlas pediu para
confirmar ("nenhum dado pessoal vaza para o log da aplicação") — e falhou.
Log de aplicação costuma ter retenção mais longa e acesso mais amplo
(agregador externo, disco do contêiner) que o banco — PII ali é um vazamento
de verdade, não só descuido.

**Correção esperada (para quem for consertar, provavelmente Vega):**
serializer customizado de `req` no Fastify que loga só o `pathname` (sem
querystring), ou uma lista de allowlist de params seguros — nunca ecoar `q`
bruto. Teste de regressão: buscar com `q` contendo um valor único (ex. um
telefone de teste) e grep no log de saída confirmando AUSÊNCIA do valor.

Ver [[project-admin-v0-ambiente-de-teste]] para como reproduzir rápido.
