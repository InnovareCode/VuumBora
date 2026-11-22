---
name: project_admin_csrf_sessao_nova_b9
description: apps/admin/src/api/authResponses.ts (B-9, 22/11/2026) — csrfToken é texto OBRIGATÓRIO em sessão nova (login autenticado, 2fa/verify, enroll/confirm) e `null` só em GET /me; por que dois validadores, o que foi provado no Chromium contra API falsa e o que não foi (API viva).
metadata:
  type: project
---

**Regra:** sessão NOVA = o servidor acabou de emitir o cookie e `sendSessionStarted` (`apps/api/src/routes/admin-auth-http.ts`) SEMPRE
manda `csrfToken: grant.csrfToken` (string, `randomBytes(32).toString('base64url')`, 43 car.). Então
`parseNewSession`/`parseNewCsrfToken` falham (`contract_mismatch`) em ausente, `null`, vazio e não-texto. `GET /me` usa
`parseExistingSession`: aceita string e `null` (sessão anterior à migração 0009) e CONTINUA aceitando a chave ausente como `null`
(comportamento antigo, mantido porque o pedido era só sessão nova; a API real sempre manda a chave: `?? null`). Falha em vazio e
não-texto. Tipos: `ParsedNewSession.csrfToken: string` × `ParsedSession.csrfToken: string | null`.

**Por que importa:** antes, ausente/`null` num login valia como sessão aberta e o painel ficava logado com TODA mutação em 403
(estado confuso) em vez da mensagem de incompatibilidade.

**Provado (Chromium, bundle minificado, API falsa que espelha o formato lido do código da API):** 18 cenários (+4 checagens de log sem valores) no bundle novo —
login/verify/confirm com `missing|null|empty|number` → `contract_mismatch` com motivo no console SEM valores; `ok` → sessão; `/me`
string/null/ausente → sessão, vazio/número → incompatível; logout depois de login novo manda `X-CSRF-Token` de 43 car. Controle
negativo no bundle do `git archive HEAD`: `missing`/`null` ENTRAM como sessão nos três caminhos (o bug), `empty`/`number` já falhavam.
**NÃO provado:** contra a API VIVA (a Lyra não pode rodar `create-admin.mjs`, ver [[project_admin_driver_application_decision]]); o
"formato real" veio de ler `sendSessionStarted` e do teste `two-factor.test.ts:390` (chaves exatas), nível "lido".

**Receita reaproveitável:** [[feedback_prova_api_falsa_e_controle_negativo]]. Armadilhas novas desta rodada: no passo de enrolamento o
botão "Continuar para o painel" fica desabilitado até marcar o checkbox "guardei os códigos" (`getByRole('checkbox').check()`);
`page.waitForFunction` não enxerga variável do Node — passe o valor como 2º argumento.
