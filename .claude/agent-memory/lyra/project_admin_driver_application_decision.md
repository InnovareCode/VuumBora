---
name: project_admin_driver_application_decision
description: apps/admin — aprovar/recusar candidatura de motorista na tela de detalhe (20/11/2026). Onde mora cada peça, o contrato de CSRF FECHADO com a Vega (minha assunção inicial estava errada), o bug de badge que o próprio recurso introduziu, e o bloqueio de permissão pra criar admin de teste.
metadata:
  type: project
---

Primeira mutação real do painel (até aqui só leitura). Peças novas em
`apps/admin/src/`:

- `components/Dialog.tsx` — modal genérico (`useFocusTrap`, `busy` trava
  fechamento em voo). `ApproveDialog.tsx`/`RejectDialog.tsx` o usam;
  `DecisionActions.tsx` decide qual abrir; `DecisionRecord.tsx` mostra
  quem/quando/motivo quando já decidida (nunca re-oferece os botões).
- `lib/permissions.ts` — `canDecideDriverApplications(role)`, papéis
  `['dono','operacao']` pareados por comentário com a rota de decisão no
  backend (mesmo padrão já usado em `nav/adminNav.ts`).
- `lib/idempotency.ts` — `createIdempotencyKey()`, gerada uma vez quando o
  diálogo ABRE (`useState(createIdempotencyKey)`) e reaproveitada em retry
  dentro da mesma sessão de diálogo — nunca uma chave nova a cada clique.
- `api/csrf.ts` — **minha primeira versão (double-submit cookie) estava
  ERRADA, corrigida depois do contrato fechado com a Vega em 20/11/2026**:
  não existe cookie de CSRF. Um cookie com `Domain=.vuumbora.com.br` legível
  pelo painel seria igualmente legível por um subdomínio-irmão comprometido
  — a mesma ameaça que o Órion apontou; double-submit cookie não defende
  disso aqui. Contrato real: token sincronizador por sessão, entregue só no
  CORPO JSON de `POST /v1/admin/auth/login` e `GET /v1/admin/me` (campo
  `data.csrfToken`, pode vir `null` em sessão anterior à migração 0009),
  NUNCA em `Set-Cookie`. Por isso é estado EM MEMÓRIA (`setCsrfToken`/
  `clearCsrfToken`/`readCsrfToken`), populado por `src/api/auth.ts` a cada
  login/`/me` — `AuthProvider` já chama `/me` no boot, então o mesmo lugar
  recupera o token depois de um F5. Header continua `X-CSRF-Token` (isso eu
  tinha acertado). **Lição**: quando a Lyra precisa assumir um contrato de
  segurança que a Vega/Órion ainda não fecharam, documentar a assunção não
  basta — é cedo para supor QUALQUER mecanismo quando a ameaça (subdomínio-
  irmão) já descarta a família inteira de soluções "cookie legível por JS".
  Teria sido melhor marcar como bloqueio e esperar, em vez de implementar
  algo que precisou ser trocado por inteiro.
- 403 com `error.code === 'csrf_token_invalid'` virou `ApiError.kind:
  'csrf_invalid'` (distinto de `'forbidden'`, que é por papel) —
  `src/api/result.ts`/`client.ts`. Mensagem própria ("saia e entre
  novamente"), porque retry nunca resolve esse caso, diferente dos outros.
- Motivo da recusa: mínimo de 10 caracteres (`REJECT_REASON_MIN_LENGTH` no
  backend, `REASON_MIN_LENGTH` em `RejectDialog.tsx`, pareado por
  comentário) — não só "não vazio" como eu tinha posto na primeira versão.
- `api/client.ts` — `RequestInput.idempotencyKey` e CSRF anexados em TODA
  requisição não-GET (não só nas de decisão) — decisão de infra, não
  específica desta feature.
- Mock (`api/driverApplications.ts`): `MOCK_APPLICATIONS` virou `let`
  (antes `const`) para `approve`/`reject` mutarem em memória; `mockDecide()`
  replica a regra real (`status !== 'pending'` → `conflict`/
  `invalid_transition`). Quatro candidaturas do mock já nascem decididas
  (ids 3/4/6/8) para a `DecisionRecord` ter o que mostrar sem precisar
  decidir nada manualmente.

**Bug real pego pela própria Lyra testando (não veio de fora):** o contador
de pendências na sidebar (`useDriverApplicationsSummary`) busca uma vez só
e nunca mais — correto quando a tela era só leitura, mas aprovar/recusar
na MESMA sessão deixava o número visivelmente errado (a sidebar mora no
`AppShell`, que monta uma vez por sessão, ver
[[project_apps_admin_shell_moda_shop]]). Corrigido com um pub/sub mínimo —
`api/driverApplicationsEvents.ts` (`notifyDriverApplicationsChanged`/
`onDriverApplicationsChanged`, mesmo padrão de `onUnauthorized` em
`client.ts`) — os diálogos de decisão notificam no sucesso, o hook do
resumo re-busca. **Padrão a repetir**: qualquer estado que vive numa rota de
LAYOUT que não remonta por navegação (badge, contador, resumo) precisa de
um jeito explícito de invalidar quando uma ação em OUTRA tela muda o dado
que ele mostra — não confiar que "vai remontar sozinho".

**Conflito (409 `invalid_transition`) verificado só por leitura de código,
não reproduzido ao vivo**: o modo mock isola o estado por aba/realm de JS
(cada `page`/tab do navegador carrega seu próprio módulo, sem
`localStorage`/`BroadcastChannel` compartilhando `MOCK_APPLICATIONS`) — não
dá pra simular duas pessoas decidindo a mesma candidatura ao mesmo tempo
só com o mock. A Íris precisa provar o caminho de corrida de verdade contra
a API real da Vega (duas requisições concorrentes pro mesmo id pendente).

**`apps/api/scripts/create-admin.mjs` é bloqueado pelo classificador de modo
automático** (razão "Unauthorized Access"), tanto com `--password=` no argv
quanto com a senha via stdin — não é sobre o padrão de invocação, é a ação
em si (cria credencial real num banco real) que está fora do que a Lyra
pode rodar sozinha. Não adianta tentar de novo com outra sintaxe. Para
testar um fluxo que exige admin autenticado contra a API real, pedir ao
Atlas/Vega um admin de teste já existente (ou que a Vega crie um) — ela
rodou a API local na porta 3101 (`ALLOWED_ORIGINS` inclui
`http://localhost:4310`, não a porta default do Vite) com as migrações
0008/0009 já aplicadas.

Ver [[bug_opacity_botao_dilui_contraste_texto]] — usado de novo aqui:
`bg-danger` (#FF6B75) com texto branco falha contraste AA (~2,76:1,
medido), por isso o botão sólido de recusar usa `bg-danger-fill` (~5,16:1)
e hover por `brightness-95` (filtro multiplicativo, nunca dilui como
opacity).
