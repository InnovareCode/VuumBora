# Veredito da Íris, S1, passada 7

**VEREDITO: APROVADO, com ressalvas (nenhuma bloqueia a fatia; ver "Achados").**

**Vale só para o commit `8d7232c` (SHA completo `8d7232c04e8a59b7b73df1226e1469e4886fdccd`, "feat(api): exclusao de
conta, retencao de 6 meses do access_log, IP fora dos logs e limite proprio para legal/current e auth/me (F11, F03,
F01-M1)"), ponta da branch `fatia/f11`.**
Provado em cópia limpa (`git archive 8d7232c`, `npm ci` com Node 22.23.5, o do CI), sem `.env`, em 22/11/2026 entre
12:55 e 14:30 (horário da máquina). `main` andou durante a passada (`f2a4472` → `65dd212`, dois commits: a ferramenta
de qualidade de tela e a reconferência da Nova sobre a F08); `git diff 8d7232c..origin/main -- apps packages` só
mostra o que a `fatia/f11` tem e `main` ainda não (ela não foi integrada), e os dois commits novos de `main` só tocam
`docs/` e `tools/` — nada do que foi provado aqui deixou de valer por isso. A árvore de trabalho (`C:/Projetos/Web/Vuumbora`)
tinha arquivos de outras frentes modificados e não comitados: **não validei a árvore**, só a cópia do SHA, como pedido.

Ambiente: Postgres 18.1 próprio na porta **5470** (dentro da faixa reservada 5470–5479; nenhuma outra porta usada),
Windows 10, Xeon E5-2650 v4. A máquina tinha outras frentes rodando (a Vega na faixa 5490–5499 e mais sessões): toda
medição de tempo abaixo é rotulada com a condição. Node 22.23.5 (o do CI). Nenhum navegador necessário nesta
passada (escopo é só API). Tudo derrubado ao fim (Postgres da 5470 parado, cópia e banco de teste descartados).

## Resumo por item do escopo

| Item | Resultado |
|---|---|
| 1. `POST /v1/auth/delete-account` | **Liberado.** Senha errada, espera progressiva PRÓPRIA (par conta+IP, isolada do login), revogação de TODAS as sessões (não só a usada), e-mail livre para recadastro, `account_consents` e `access_log` intactos (com a linha nova `account_deleted`), rodando com o papel restrito `vuumbora_api` (só `UPDATE`, nunca `DELETE`). |
| 2. Retenção | **Liberado.** `access_log` 180 dias (fronteira exata: 181 dias apaga, 179 fica); candidatura (`driver_applications`) e lista de espera (`waitlist_signups`) na mesma rotina, mesmo prazo, mesma fronteira exata. |
| 3. IP fora de `/v1/auth` | **Liberado.** Nunca em claro; vai um hash de 16 hex (chave aleatória do processo). Dentro de `/v1/auth` nem hash nem claro. |
| 4. F01-M1 | **Liberado.** Esgotar `GET /v1/legal/current` ou `GET /v1/auth/me` (100/min cada) não derruba `refresh`/`logout` do mesmo IPv6 /64: contadores próprios, confirmados nos dois sentidos e contra o logout da classe sessão. |
| 5. Q2 | **Liberado** no lado do servidor (`text/plain` e POST sem corpo dão `invalid_body`, não `invalid_refresh_body`) e **confirmado por desenho** no cliente real (`packages/api-client`, inalterado nesta fatia): o código `invalid_body` nunca está no mapa de códigos que encerram sessão — só `invalid_refresh_token`/`invalid_refresh_body`. |
| 6. F03 — mutantes M5, M6, M8 | **Parcial.** M5 (login) e M6 (cadastro) **morrem**: a rede estática (`bcrypt-static-scope.test.ts`) pega qualquer bypass do pool nesses dois porque eles vivem num arquivo sem `bcryptjs` hoje. **M8 (login do admin) SOBREVIVE**: ver achado abaixo. |
| 7. F03 — as 7 formas escondidas do portão | **Parcial.** As 3 formas que dependiam de `schema` do Fastify morrem com a 2ª sondagem nova (corpo/consulta/parâmetro válidos). As outras 4 (código de recusa diferente, 403, portão "de mentira" por nome, portão escondido numa rota já isenta) **continuam vivas** — o próprio código do teste já registra isso como limitação, não é achado novo meu. |
| 8. CI da branch | **Verde.** Run `45040737350`, 4 de 4 jobs, `success`, 15:53:04Z–15:55:10Z (2 min 6 s). |

## 1. `POST /v1/auth/delete-account`

Suíte dedicada (`identity-account-delete.test.ts`, 15 testes) + a linha nova em `runtime-role.test.ts`, rodadas na
cópia limpa, banco próprio, **duas vezes** (ver seção 6): sem Bearer → 401; corpo sem senha → 400 `invalid_body` e a
sessão não cai; senha errada → 401 `wrong_password`, conta e sessão continuam vivas; senha certa → 200
`{accountDeleted:true}`, a própria sessão cai na hora, `access_log` grava `account_deleted` sem e-mail nem senha no
dump. Duas sessões (dois logins) da mesma conta: as duas caem, uma conta de outra pessoa não é afetada,
`refresh_token_families` com `revoke_reason='account_deleted'` nas duas. Anonimização: `email`/`full_name`/`phone`
viram texto genérico, `birth_date` NULL, `status='deleted'`, `deleted_at` preenchido, `account_type` e `public_id`
imutáveis — e um **recadastro com o e-mail original funciona como conta nova** (id diferente). `account_credentials`:
a linha continua (a API não tem `DELETE`), o hash é sobrescrito por um hash bcrypt válido (CHECK do banco) que nunca
autentica. `devices`: rótulo NULL, aparelho revogado. `account_consents`: **idêntico, byte a byte**, antes e depois —
a prova do aceite LGPD não é tocada. Espera progressiva: 2ª senha errada no mesmo par (conta+IP) dá 429
`too_many_attempts` com `Retry-After`, e o par é **próprio** da exclusão (errar aqui não atrasa o login da mesma
conta, e vice-versa, nos dois sentidos). `delete_account()` no banco: chamar duas vezes devolve `ok` e depois
`already_deleted` sem reescrever `deleted_at`; id desconhecido dá `not_found`; duas chamadas **simultâneas**
(`Promise.all`) nunca dão duas `ok` nem erro — uma vê `ok`, a outra `already_deleted` (lock serializando de verdade,
não só por `await` sequencial).

**Papel restrito:** o teste roda a API conectada COMO `vuumbora_api` (`options=-c role=vuumbora_api`) e confirma
200/`accountDeleted:true` e que o e-mail de verdade não mora mais em `accounts` — ou seja, a função SQL
`SECURITY INVOKER` funciona com os privilégios mínimos (só `UPDATE`), nunca precisando de `DELETE`.

## 2. Retenção

`identity-email.test.ts`: insiro linhas de `access_log`, `driver_applications` e `waitlist_signups` nos dois lados
da fronteira (181 dias apaga, 179 fica) e chamo `runIdentityRetention` com a política padrão. Os três apagam
exatamente a linha velha e preservam a nova; `accessLogDays/driverApplicationsDays/waitlistSignupsDays = 0` são
recusados (`retention_policy_invalid`). Rodado nas duas execuções completas da suíte (seção 6).

## 3. IP fora de `/v1/auth`

`log-sanitization.test.ts`: `GET /healthz` com `X-Forwarded-For` nunca mostra o IP em claro no log — aparece
`"remoteAddress":"<16 hex>"`. `POST /v1/auth/login` (dentro de `/v1/auth`) não grava `remoteAddress` nenhum, nem
claro nem hash. Isso é o **log do servidor** (pino/Fastify); a trilha estável do banco (`access_log`/`login_attempts`,
HMAC com `AUTH_PEPPER`) é outra coisa e não muda.

## 4. F01-M1

`ip-rate-limits.test.ts`, três testes novos contra a API real (harness `withApp`, requisições reais por rota):
esgotar `legal/current` (100 no mesmo /64) não faz `refresh` do mesmo endereço cair em 429 (continua 401 de token
inválido); o mesmo para `GET /v1/auth/me`; e os dois têm contadores **separados entre si** e do `logout` (sessão,
global). Isola exatamente o achado que motivou a fatia (achado do Órion, rodada 3d): `/me` é chamado toda vez que o
app abre, e sem isolamento esgotaria a cota de `refresh` dos vizinhos do mesmo /64.

## 5. Q2 (achado da passada 6)

Servidor: `text/plain` com corpo e POST sem corpo nem `Content-Type` em `/v1/auth/refresh` dão **400
`invalid_body`**, não `invalid_refresh_body` — confirmado no `ip-rate-limits.test.ts` novo. Cliente: não toquei
`packages/api-client` nesta fatia (não está no diff do commit), mas `session-manager.ts` só trata como "sessão
encerrada" os códigos `invalid_refresh_token` e `invalid_refresh_body` (mapa `DEFINITIVE_REFRESH_CODES`); qualquer
outro código — inclusive `invalid_body` — cai em `transientRefreshError` e mantém a sessão. Isso já tem teste próprio
(`session-manager.test.ts`, caso "400 invalid_body GENÉRICO"). A combinação das duas pontas (servidor sempre
classifica esses dois casos como `invalid_body`; cliente nunca encerra sessão por `invalid_body`) prova o item sem
precisar repetir o round-trip HTTP completo — a passada 6 já fez essa prova ponta a ponta para o `invalid_body`
genérico de outras origens (B5).

## 6. Suíte completa, duas vezes

`apps/api` (`npm test`, banco de teste próprio na 5470): **454/454** nas duas execuções (banco novo e, na 2ª, o mesmo
banco), **109 suítes, 0 falha** nas duas. Durações: 265 s (1ª, com outras frentes da máquina ativas) e 256 s (2ª).
CI (GitHub, run `45040737350`): 4 de 4 jobs verdes — `api` (2 min, passo "Testes do apps/api" 77 s), `check`
(inclui `api-client` e `packages/ui`), `backup`, `ci-ok`.

## 7. Mutação do F03 (M5, M6, M8 e as 7 formas do portão)

Mutei o código da cópia limpa (nunca o repositório), rodei o teste e **restaurei do backup**, conferido por `diff`
depois de cada rodada.

**M5 (login) e M6 (cadastro):** fazer a comparação de senha sem passar pela reserva da pista do bcrypt — o jeito que
`bcrypt-static-scope.test.ts` existe para pegar — **morre imediatamente**: a varredura estática falha porque o
arquivo de serviço da identidade dos apps não tem hoje nenhum import de `bcryptjs`, e a mutação precisa de um para
funcionar. Rede eficaz para os dois.

**M8 (login do admin) SOBREVIVE.** `admin-auth-service.ts` **já** importa `bcryptjs` por um motivo legítimo (o hash
descartável gerado uma vez no boot) — a varredura estática só olha QUAIS arquivos importam a biblioteca, não cada
chamada dentro deles, então um bypass do pool bem ali não acrescenta import novo e passa batido. Testei também se a
rede DINÂMICA (`bcrypt-ceiling.test.ts`, que mede o laço de eventos sob rajada de custo real) pegaria o efeito: rodei
a suíte completa duas vezes com a mutação aplicada — a mesma suíte dos **454/454** da seção 6, sem nenhuma mudança de
resultado. O teste de rajada existente mede a pista PÚBLICA sob carga; o login do admin nesse teste não é mantido sob
carga sustentada na mesma janela, então uma única comparação fora da pista não aparece no orçamento do laço. Não é
uma falha de produção (o código real usa a reserva corretamente) — é uma lacuna na rede de proteção: hoje nenhum
teste do repositório distingue "login do admin pela pista" de "login do admin direto". **F03 fecha 2 dos 3 mutantes
prometidos, não os 3.**

**As 7 formas escondidas do portão de consentimento:** reconstruí as 7 formas da tabela da passada 5
(`docs/veredito-iris-s1-passada-5.md`, seção 3) num app Fastify isolado, usando a MESMA função `requireAccount` real
e a MESMA lógica de duas sondagens que `consent-gate-coverage.test.ts` ganhou nesta fatia. Resultado: as 3 formas que
dependiam de uma rota com `schema` do Fastify (corpo, consulta ou parâmetro obrigatórios escondendo o 401 atrás de um
400) **agora morrem** — a 2ª sondagem (corpo/consulta/parâmetro genéricos, mas válidos) as alcança. As outras 4 —
autenticação própria que responde 401 com outro código, autenticação própria que responde 403, um "portão de
mentira" (função chamada `requireCurrentConsent` que não verifica nada de verdade) e um portão de aceite escondido
dentro de uma rota já declarada isenta — **continuam vivas**. Isto bate com o que o próprio comentário do teste
(linhas 24–40 de `consent-gate-coverage.test.ts`) já registra como limitação conhecida e não corrigida nesta fatia:
não é um achado novo meu, é a confirmação de que o texto do código está certo e completo sobre o que falta.

## Achados

- **Q7 (média, não bloqueia; lacuna de teste — mesma família do Q1 da passada 5):** o mutante M8 (login do admin
  comparando a senha fora da pista do bcrypt, na thread principal) sobrevive a toda a suíte do repositório, incluindo
  a rede dinâmica pensada para pegar justamente isso. Sugestão para a Vega: ou o `login do admin` do
  `bcrypt-ceiling.test.ts` passa a usar um hash de custo real (12) e entra DENTRO da janela medida da rajada (hoje as
  contas de teste do admin usam custo baixo), ou a rede estática ganha uma checagem por chamada (não só por arquivo)
  nos dois pontos permitidos de `admin-auth-service.ts`.
- **Q8 (baixa, já documentada no próprio teste, não corrigida nesta fatia):** 4 das 7 formas de esconder o portão de
  aceite continuam fora do alcance da sondagem (ver seção 7). Nenhuma rota real usa essas formas hoje; é rede para
  quando a primeira rota de compromisso (corrida, ficar online) nascer.

## Pendências (cenários que valem depois, não bloqueiam)

`reason=closing` do bcrypt em processo real; o `TRUST_PROXY` real de produção; a aplicação de verdade das migrações
0010–0022 em produção coordenada com API e painel (fora do escopo desta passada, que foi só código e testes).

## Limpeza

Postgres da porta 5470 derrubado ao fim; cópia limpa e banco de teste descartados; nenhuma porta fora da faixa
5470–5479 foi usada; nenhum arquivo do repositório foi alterado (as mutações da seção 7 foram só na cópia, restauradas
e conferidas por `diff` antes de eu seguir adiante).
