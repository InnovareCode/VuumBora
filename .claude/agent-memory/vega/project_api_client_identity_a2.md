---
name: project-api-client-identity-a2
description: Slice A2 do plano dos apps — packages/api-client/src/identity (cliente de identidade, SessionManager com refresh em voo único), decisões não óbvias e como provar contra a API real
metadata:
  type: project
---

Feito em 21/11/2026. Código em `packages/api-client/src/identity/`, testes em `packages/api-client/test/` (`npm test -w @vuumbora/api-client`, node --test + tsx). Uso e regras: README do pacote.

**Decisões que o código não explica sozinho**
- Falha do refresh se divide: DEFINITIVA = 1 logout local; TRANSITÓRIA (rede, 5xx, 429, resposta estranha) NÃO desloga e o mesmo refresh descansa 5 s (até 60 s com `retryAfterSeconds`). **CORRIGIDO em 22/11 (M-4): definitiva NÃO é "401/400/403" por status — só com `code` do contrato (ver [[project-api-client-m2-m4-b8]]).** **Why:** a API trata o 2º uso do refresh como reuso e mata a família; se a 1ª tentativa chegou ao servidor e só a resposta se perdeu, repetir na hora derruba a sessão (plano §4.5). Sem esse descanso, 401 que chegam depois do fim de um voo que falhou cada um dispara um `/refresh` novo (o teste achou isso: 5 refreshes em vez de 1).
- 401 só renova se o access token usado ainda é o atual (senão outro já renovou: repete sem renovar). E `epoch` muda em login/logout: resposta de renovação/401 de época antiga é descartada e a chamada não é repetida com o token de OUTRA conta. Há DUAS guardas de época que cobrem o mesmo risco (`accessTokenAfterRejection` e antes de repetir em `run`): mutar uma só sobrevive, mutar as duas mata (mesma lição de defesa em camada dupla).
- Refresh novo é gravado ANTES de liberar as pendentes; toda escrita no cofre passa por uma fila (a mais nova vence). Falha de escrita não derruba a sessão em memória (`onStorageError`).
- `ApiError = ApiErrorKind & { code?, attemptsLeft?, retryAfterSeconds? }`: `kind` vem do STATUS, `code` do envelope. Mock e http passam pela MESMA `apiErrorFromReply` (é o que garante "mesmos códigos").
- `AuthPort` antigo foi removido do index (nenhuma tela o usava). `platform` é obrigatório fora do navegador; sem `crypto` global o cliente exige `randomId` (sem Math.random de reserva).

**Armadilhas de ambiente (provar contra a API real)**
- Rodei a API real com um script FORA do repo: `buildApp({ mail })` com MailPort falso + Postgres 18 próprio (`initdb`/`pg_ctl` em porta livre, NÃO a 5434 da Íris) + `DOTENV_CONFIG_PATH` apontando para arquivo inexistente (cwd=apps/api carregaria o `.env` da Íris). 401 reais sem esperar 15 min: `fetch` injetado que troca o Bearer ainda não renovado por lixo.
- A migração `0021_create_legal_document_versions.sql` (untracked, de outra frente) cria FK de `account_consents` para um catálogo que o código do registro ainda não usa: com ela aplicada, TODO cadastro dá 503 (`23503`). Apliquei só 0001..0020 no meu banco. Se "register dá 503 num banco novo", olhe `ls migrations` e `git status` antes de depurar o cliente.
- `apps/api` tinha mudanças não commitadas de outros agentes durante o teste: a prova vale para aquele estado da árvore.

**Armadilhas de teste que custaram tempo**
- Servidor HTTP falso com respostas roteirizadas: limpe os scripts no `beforeEach` (um script permanente de `login` quebrou todos os testes seguintes).
- Atraso de armazenamento falso lido LAZY (quando a fila executa): setar e zerar na mesma linha não atrasa nada; dormir 5 ms entre os passos.
- Teste que depende de corrida (401 tardio) precisa afirmar que a corrida aconteceu (pré-condição), senão passa com o código errado.
- `package.json` do api-client ganhou devDependencies (`tsx`, `@types/node ^22`): o lockfile mudou (+21 linhas, `@types/node` 22 aninhado, igual ao `apps/api`); `npm ci` exige isso.
- Contrato `docs/contrato-identidade-apps.md` não escreve o `401 unauthorized` das rotas com Bearer (`/me`, `/logout-all`); a API devolve `code: 'unauthorized'`.
