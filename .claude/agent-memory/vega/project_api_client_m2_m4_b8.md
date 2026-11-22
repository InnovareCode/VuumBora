---
name: project-api-client-m2-m4-b8
description: Correcoes da Orion (M-2, M-4, B-8) e lacunas da Iris (SF4, SF10) no packages/api-client — decisoes nao obvias, contrato novo, o que ficou para o app, como provar contra a API real do HEAD
metadata:
  type: project
---

Feito em 22/11/2026 (HEAD 0fe8883 durante a prova), só em `packages/api-client` + remoção de `apps/passenger/src/types/api-client-globals.d.ts`. Revisão: `docs/revisao-seguranca-s1-rodada3b.md`; veredito: `docs/veredito-iris-s1-passada-2.md`. Uso e regras: README do pacote.

**Decisões que o código não explica sozinho**
- **M-4:** definitiva = `code` assinado pela API (`invalid_refresh_token` em 401/400/403; `invalid_body` só em 400), tabela em `session-manager.ts` (`Map`, não objeto: `constructor`/`__proto__` casam com o padrão de `code`). Recusa sem code reconhecido é transitória E o chamador recebe `kind: 'unavailable'` (nunca `unauthorized`/`forbidden`/`validation` de proxy: a sessão segue aberta e a tela leria "sua sessão acabou"), sem `code` inventado e preservando `retryAfterSeconds`. A API NÃO emite 403 em `/refresh` (só 401 `invalid_refresh_token`, 400 `invalid_body`, 429, 5xx); o 403 com `invalid_refresh_token` é tolerância, não contrato.
- **M-2:** `RegisterInput.termsVersion/privacyVersion` OBRIGATÓRIOS (breaking de propósito: o typecheck do passageiro quebra em `app/(auth)/cadastro.tsx` até a tela passar o que renderizou). `legalCurrent()` usa o `accountType` como `audience`; `acceptConsents` devolve o `consent` já desembrulhado; `error.current` só vale se a forma está completa E é do perfil do app (`apiErrorFromReply(reply, accountType)`); o cliente NUNCA reenvia sozinho com a versão nova. `me.consent` ausente = `unknown` (não "em dia"); `null` = API sem os textos. `upToDate` tem de concordar com `pending` (senão `unknown`). Mock tem catálogo próprio (`mock.legal`, mutável de propósito, padrão `mock-1`), sha zeros e url `.invalid`.
- **B-8a:** `adopt` revoga a sessão anterior em segundo plano com o refresh mais novo em memória (a API revoga a FAMÍLIA por qualquer refresh dela, inclusive rotacionado: `revokeFamilyByRefreshHash`). Por isso `login` faz `await restore()` antes: sem isso o login logo na abertura sobrescreve uma sessão ainda não lida (órfã no servidor). Nunca revoga o mesmo refresh que acabou de adotar.
- **B-8c:** fila `vuumbora.<tipo>.pending_revocations` no mesmo cofre (JSON v1, teto 10, dedupe, expira com o refresh). Entra só em falha RETRY-ÁVEL (network/unavailable/rate_limited/unknown); `restore()` repete em segundo plano, para na 1ª falha, e NÃO lê a fila se a leitura da sessão falhou (evita 2º erro de cofre). Atualização da fila é leitura-modificação-gravação DENTRO da fila de escritas. A fila guarda um refresh que ainda vale no servidor: Órion deve olhar.
- **B-8b:** `run` descarta o resultado de época antiga em TRÊS pontos (após a 1ª chamada, antes e depois da repetição), sucesso ou erro.
- **B-8d:** `allowInsecureHttp` (padrão false) no adaptador e no cliente; `http:` sem a flag falha na montagem em QUALQUER host (sem exceção para localhost: decisão deliberada, simples de auditar). O app liga a flag a `__DEV__`.
- **DOM:** em vez de `/// <reference lib="dom" />` (que vazaria DOM para os apps, que compilam com `lib: ["ES2022"]` de propósito) o pacote deixou de usar `window`/`document`/`Crypto` (lê `globalThis` com tipo local) e ganhou a passada `tsconfig.nodom.json` no `typecheck`. O d.ts do passageiro foi apagado sem erro novo; o motorista já compila.

**Prova contra a API real** (HEAD extraído com `git archive`, Postgres 18 na 5490, MailPort falso, `buildApp` + `listen` porta 0): 29/29. Controles negativos com cópia mutada do pacote: cadastro sem versões => a API real devolve 400 e o fluxo quebra; M-4 só por status => 4 falhas. Script fora do repo (scratchpad `vega/real-flow.mts` + `run-real.sh`); para forçar 401 real sem esperar 15 min, o fetch injetado troca o Bearer por lixo N vezes (contador, não booleano: com booleano o token renovado também virava lixo).

**Armadilhas**
- `apps/passenger/app/(auth)/cadastro.tsx:112` chama `identity.register(...consentPayload())` e `legal/legalDocuments.ts` ainda devolve só os booleanos: quem adaptar a tela (Lyra) precisa passar as versões de `legalCurrent()`.
- Fake server dos testes ganhou `legal`, `consents`, `register` e `consent` em `me`; o teste "baseUrl com prefixo" e o de `accountType` precisaram de `consent` na resposta (senão `unknown` por outro motivo e o teste prova a coisa errada).
- Teste de `mock x contrato` exige que todo `code` emitido esteja escrito em `docs/contrato-identidade-apps.md` (`consent_outdated` já está).
