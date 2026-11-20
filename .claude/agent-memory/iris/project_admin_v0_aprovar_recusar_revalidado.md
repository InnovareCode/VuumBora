---
name: project-admin-v0-aprovar-recusar-revalidado
description: Revalidação independente (não de confiança) do roteiro de aprovar/recusar candidatura do Vega — todos os casos confirmados, incluindo concorrência real e UI de duas abas, em 20/11/2026
metadata:
  type: project
---

Refiz do zero (não li e confiei) o roteiro documentado em
`.claude/agent-memory/vega/project_admin_v0_aprovar_recusar.md`. Ambiente
próprio: Postgres local (porta 5434) + API (3101) com as migrações 0008/0009
aplicadas no boot, candidaturas de teste inseridas direto via SQL (mais
rápido que passar pelo rate limit público de 5/10min).

**Confirmado por curl (nível: rodado de ponta a ponta, servidor real):**
aprovar e recusar caminho feliz; recusar sem motivo e com motivo curto (400,
mesma mensagem); transição inválida decidindo duas vezes (409
`invalid_transition`); 404; papel sem permissão (`suporte`, 403, bloqueia
ANTES do CSRF); sem `X-CSRF-Token` (403); CSRF errado (403); sessão com
`csrf_token` NULL simulada via UPDATE direto (403 — próprio caso que o Vega
não tinha testado explicitamente, só descrito); sem `Idempotency-Key` (400);
mesma chave repetida (replay — `decidedAt` idêntico, só 1 linha em
`admin_audit_log`); motivo de recusa com valor único **não aparece** no log
de aplicação (`grep -a -c` = 0) mas **aparece** em `admin_audit_log.after`
(prova que o teste não é falso-negativo por o dado nunca ter sido
processado).

**Concorrência real (o item que mais importava):** rodei 3 vezes, sempre com
dois `curl` disparados em paralelo (`&` + `wait`) contra a MESMA candidatura
pendente — em todas as 3, uma ganhou (200) e a outra perdeu (409), e
`admin_audit_log` tinha exatamente 1 linha por candidatura. Testei também o
par aprovar-vs-recusar concorrentes (não só aprovar-vs-aprovar) no mesmo
teste.

**Concorrência real NO NAVEGADOR (duas abas, mesmo contexto Playwright =
mesma sessão/cookie):** abri a mesma candidatura em duas abas, uma com o
diálogo de Aprovar pronto, outra com Recusar preenchido, e disparei os dois
cliques de confirmação quase simultaneamente (`Promise.allSettled`).
Exatamente UMA aba viu o banner de conflito ("Esta candidatura já foi
decidida..."); a outra teve sucesso direto. As duas, depois do reload,
convergiram pro MESMO estado final real (reprovada, com o motivo
certo) — nenhuma ficou mostrando um status desatualizado ou otimista. Esse
caminho a Lyra só tinha verificado por leitura de código (mock isola estado
por aba, não dá pra simular) — ver
`.claude/agent-memory/lyra/project_admin_driver_application_decision.md`.

**Pendência desta rodada:** durante o teste, o Vega começou a corrigir um
achado do Órion no CORS (hoje um único registro global com
`credentials:true` pra TODA origem, inclusive o site público — um XSS no
site conseguiria ler `/v1/admin/me` e roubar o `csrfToken`). A correção
segrega em duas variáveis de ambiente (`ALLOWED_ORIGINS` só pro site,
`ADMIN_ALLOWED_ORIGINS` novo só pro painel) e dois registros separados de
`@fastify/cors` em `app.ts` — confirmei que `env.ts` já tem a validação nova
mas `app.ts` ainda tinha só o registro antigo (único) no momento em que
parei, então não testei o caso novo ("origem do site não recebe resposta
com credenciais em `/v1/admin/*`, e as rotas públicas continuam
funcionando") — ficaria testando um meio-termo quebrado. Retestar quando a
dupla `env.ts`+`app.ts` estiver consistente.

Ver [[project-admin-v0-ambiente-de-teste]] e
[[project-admin-v0-vazamento-pii-log-querystring]] (mesmo padrão de
vazamento de PII em log, agora no motivo de recusa — desta vez sem bug).
