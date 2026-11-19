# Lista de espera — como rodar, publicar, exportar e excluir

Esta é a primeira peça real de backend do VuumBora (`apps/api`). Até aqui
tudo no projeto era simulado (`mock`) nos apps; este serviço grava de
verdade, num banco de verdade.

**Aprovado pelo dono em 18/11/2026, com uma condição que ainda não foi
cumprida — ver a seção "Por que o formulário não vai ao ar ainda", no fim.**
Este documento serve para rodar, publicar e operar o serviço mesmo assim:
nada aqui depende da condição pendente.

## O que este serviço faz (e o que não faz)

Um único endpoint público: recebe e-mail e, opcionalmente, perfil
(`passenger` ou `driver`), e grava numa tabela. Não pede CPF, telefone,
endereço nem documento — para avisar do lançamento, e-mail basta (decisão do
dono, `docs/decisoes-do-dono.md` → "Lista de espera").

Não tem painel administrativo. Exportar e excluir são comandos de linha de
comando (seções abaixo) — a decisão aqui foi não construir uma superfície
de administração pra uma única tabela.

## Arquitetura em uma frase

Fastify (Node/TypeScript) + Postgres, rotas → validação (zod) → serviço →
repositório (SQL puro via `pg`), sem ORM. `apps/api` é standalone: não
importa `packages/domain` nem `packages/api-client` — o contrato com o
front mora em `packages/api-client/src/waitlist` (tipos + adaptador `http`),
mas o runtime do servidor não depende de nenhum pacote do monorepo.

## Suposição assumida: o motor do banco é Postgres

O dono já tem o serviço `vuumbora-banco` criado no Easypanel, mas vazio —
sem o motor escolhido ainda. Este backend foi escrito assumindo **Postgres**
(é a opção mais comum nos templates do Easypanel, e a mais robusta para o
que a Fase 5 vai precisar depois — corridas, pagamentos — não só esta
tabela). **Se o dono configurar `vuumbora-banco` com outro motor
(MySQL, MongoDB...), este código não funciona sem adaptação** — avise o
Vega/Cronos antes de publicar, para confirmar ou ajustar.

Dependência mínima: Postgres 13+ (usa `gen_random_uuid()`, nativo desde a
versão 13; a migração também tenta `CREATE EXTENSION pgcrypto` como reforço
de compatibilidade, idempotente e inofensivo em versões mais novas).

## 1. Rodar local

Pré-requisitos: Node 20+ (o monorepo já exige isso), e um Postgres
acessível (local, Docker, ou um banco de testes na nuvem — qualquer um).

```bash
# na raiz do monorepo
npm install                      # já deve estar feito, mas não tem problema repetir

cp apps/api/.env.example apps/api/.env
# edite apps/api/.env:
#   DATABASE_URL=postgres://usuario:senha@localhost:5432/vuumbora
#   ALLOWED_ORIGINS=http://localhost:3000   (origem do `apps/site` em dev)

npm run migrate --workspace @vuumbora/api   # cria a tabela (lê DATABASE_URL do .env? não —
                                             # ver nota abaixo, scripts leem do AMBIENTE)
npm run api                                 # inicia em modo watch (atalho na raiz)
# ou: npm run dev --workspace @vuumbora/api
```

**Nota importante sobre `.env` e os scripts:** o servidor (`npm run dev` /
`npm run start`) lê `apps/api/.env` sozinho (Node 20+ carrega `.env` do
diretório de trabalho automaticamente quando você roda `npm run <script>
--workspace @vuumbora/api`, porque o npm entra na pasta do workspace antes
de executar). Os scripts `migrate`/`waitlist:export`/`waitlist:delete`
fazem o mesmo, desde que executados do mesmo jeito (`--workspace
@vuumbora/api`, não chamando `node apps/api/scripts/...` direto da raiz sem
isso). Se preferir não depender disso, exporte `DATABASE_URL` manualmente
na sessão do terminal antes de rodar.

Teste rápido de que subiu:

```bash
curl http://localhost:3000/healthz
# {"status":"ok"}  (ou {"status":"unavailable"} se o Postgres não responder)

curl -X POST http://localhost:3000/v1/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@exemplo.com","profile":"passenger"}'
# {"ok":true}
```

## 2. Publicar no Easypanel (`vuumbora-backend`)

O serviço `vuumbora-backend` já existe no painel, vazio (ver
`docs/deploy-easypanel.md`, que documenta o `vuumbora-frontend`/site — este
aqui é o mesmo painel, outro serviço).

1. **Fonte:** aba "Fonte" → GitHub → repositório `InnovareCode/VuumBora`,
   branch `main` (mesma autorização já usada pelo site, se já tiver sido
   feita).
2. **Build:** método **Dockerfile**.
   - Caminho do Dockerfile: `apps/api/Dockerfile`
   - Caminho de build/contexto: raiz do repositório (`/`) — não mude para
     `apps/api`, senão o build não acha `package.json`/`package-lock.json`
     da raiz.
   - Porta do contêiner: `3000`.
3. **Variáveis de ambiente** (aba "Variáveis de Ambiente"/"Environment" do
   serviço — nunca num arquivo commitado):
   - `DATABASE_URL` — string de conexão do `vuumbora-banco` (pegue no
     próprio painel do Easypanel, na aba de conexão do serviço de banco).
   - `ALLOWED_ORIGINS` — `https://www.vuumbora.com.br` (produção). Pode
     listar mais de um, separado por vírgula, se precisar liberar outro
     domínio depois.
   - `PORT` — `3000` (ou deixe no padrão; o `Dockerfile` já expõe 3000).
   - Opcionais, só se quiser mudar o padrão: `WAITLIST_RATE_LIMIT_MAX`
     (padrão `5`), `WAITLIST_RATE_LIMIT_WINDOW_MINUTES` (padrão `10`),
     `LOG_LEVEL` (padrão `info`).
4. **Domínio:** se o backend vai ter domínio próprio (ex.
   `api.vuumbora.com.br`), configure na aba Domínios do serviço, igual ao
   que `docs/deploy-easypanel.md` descreve pro site (registro `A` no
   Registro.br + certificado automático). Se preferir não expor domínio
   público ainda, o serviço roda só na rede interna do Easypanel — mas
   nesse caso o site (que é estático, roda no navegador de quem visita, não
   dentro da rede do Easypanel) não vai conseguir chamá-lo. Pra o formulário
   funcionar de fato, o backend precisa de um endereço público.
5. **Rodar a migração em produção** (uma vez, depois do primeiro deploy):
   abra o terminal do serviço `vuumbora-backend` no próprio Easypanel (ou
   `docker exec -it <container> sh`) e rode:
   ```bash
   node scripts/migrate.mjs
   ```
   (`DATABASE_URL` já está no ambiente do contêiner, vindo das variáveis
   configuradas no passo 3 — não precisa repetir.) Rode de novo a cada vez
   que uma nova migração for adicionada em `apps/api/migrations/`.

## 3. Exportar a lista de espera

Dentro do contêiner do `vuumbora-backend` (terminal do Easypanel ou
`docker exec`):

```bash
node scripts/export-waitlist.mjs > /tmp/inscricoes.csv
# ou, com o atalho do workspace (local, fora do contêiner):
npm run waitlist:export --workspace @vuumbora/api > inscricoes.csv
```

Gera um CSV com `email,profile,source,created_at`, ordenado pela data de
inscrição. Depois é só copiar o arquivo para fora do contêiner (o próprio
Easypanel costuma ter opção de "baixar arquivo" no terminal, ou `docker cp`
se tiver acesso direto ao servidor).

## 4. Excluir uma inscrição (direito de exclusão — LGPD)

Quem está na lista de espera pode pedir para ser removido. Quando isso
acontecer (por e-mail, pelo canal que o aviso de privacidade do formulário
indicar), rode, dentro do contêiner:

```bash
node scripts/delete-waitlist.mjs --email=pessoa@exemplo.com
```

O comando normaliza o e-mail (minúsculas, sem espaços) antes de procurar,
do mesmo jeito que a inscrição foi gravada, e informa se encontrou e
excluiu, ou se não havia nada com esse e-mail. Diferente da resposta da
API pública, este comando **pode** confirmar existência — é uma ação
administrativa que só o dono executa, não uma resposta a quem se inscreveu.

## 5. Contrato HTTP (para o site consumir)

Tipos e adaptador prontos em `packages/api-client/src/waitlist`
(`WaitlistPort`, `createWaitlistHttpAdapter`) — quem for ligar o formulário
do site deveria importar daí, não reimplementar o `fetch` à mão.

### `POST /v1/waitlist`

Corpo (JSON):

```json
{ "email": "pessoa@exemplo.com", "profile": "passenger" }
```

- `email` — obrigatório. Normalizado no servidor (minúsculas, sem espaços)
  antes de validar/gravar.
- `profile` — opcional. Só `"passenger"` ou `"driver"` (em inglês, mesma
  convenção do resto do monorepo — `TripStatus`, `VerificationStatus` etc.
  também usam valores em inglês, mesmo em produto falado em português).

| Situação | HTTP | Corpo |
|---|---|---|
| Sucesso (e-mail novo **ou** já inscrito — sempre igual, de propósito) | `200` | `{"ok":true}` |
| E-mail ausente/mal formatado | `400` | `{"ok":false,"error":{"code":"invalid_email","message":"E-mail inválido."}}` |
| Perfil inválido (fora de `passenger`/`driver`) | `400` | `{"ok":false,"error":{"code":"invalid_profile","message":"Perfil inválido — use \"passenger\" ou \"driver\"."}}` |
| Corpo da requisição malformado (JSON inválido, vazio, maior que 10 KB) | `400` | `{"ok":false,"error":{"code":"invalid_body","message":"Corpo da requisição inválido."}}` |
| Limite de requisições atingido (padrão: 5 por IP a cada 10 min nesta rota) | `429` | `{"ok":false,"error":{"code":"rate_limited","message":"Muitas requisições. Tente novamente em alguns minutos."}}` |
| Banco fora do ar / erro interno ao gravar | `503` | `{"ok":false,"error":{"code":"unavailable","message":"Serviço temporariamente indisponível. Tente novamente em alguns minutos."}}` |
| Origem (domínio) não autorizada | — | bloqueado pelo navegador via CORS antes de qualquer resposta chegar ao JS da página; o servidor nem processa |

**O que o formulário deve mostrar em cada caso**, para a Lyra (ou quem
implementar a tela) e a Íris (quem testa):
- **Sucesso:** mensagem de confirmação positiva. Nunca diferenciar "e-mail
  novo" de "e-mail já estava na lista" — a API não distingue de propósito
  (anti-enumeração: ninguém de fora descobre quem já está inscrito).
- **E-mail inválido:** erro inline no campo, pedindo para corrigir o
  formato. Não é erro de sistema — é validação normal de formulário.
- **Perfil inválido:** não deveria acontecer num formulário normal (o
  campo deveria ser um seletor fechado com só essas duas opções, nunca
  texto livre) — se aparecer, é bug no front, trate como erro genérico.
- **Limite atingido (`429`):** mensagem de "tente de novo mais tarde", sem
  expor números técnicos. Não é erro do usuário.
- **Falha (`503`/erro de rede):** mensagem de "não foi possível agora,
  tente novamente" — nunca "e-mail inválido" nem nada que sugira que o
  problema é do dado digitado.

### `GET /healthz`

Sem autenticação, sem rate limit. `{"status":"ok"}` (200) ou
`{"status":"unavailable"}` (503) se o Postgres não responder. Usado pelo
`HEALTHCHECK` do Docker/Easypanel — não é para o site chamar.

## 6. Decisões de segurança e privacidade (o porquê)

### Por que a resposta de sucesso é sempre igual
Se a API dissesse "esse e-mail já estava cadastrado" para e-mails
repetidos, alguém poderia descobrir, um e-mail por vez, quem está na lista
de espera (um problema de privacidade chamado enumeração). A unicidade é
garantida no banco (`UNIQUE INDEX` em `email` + `ON CONFLICT DO NOTHING`),
não no código da aplicação — o que também resolve concorrência de graça:
duas requisições simultâneas com o mesmo e-mail nunca criam duas linhas,
sem precisar de lock nem fila.

### Por que não tem `idempotencyKey` como as portas de corrida
Nas portas de corrida (`PassengerRidePort.request`, por exemplo), o cliente
manda um `idempotencyKey` porque não existe outra chave natural para
deduplicar "pedir uma corrida" — duas tentativas de retry poderiam, sem
isso, criar duas corridas. Aqui o **e-mail já é** a chave natural: repetir a
mesma inscrição nunca duplica, então não precisa de chave extra.

### Por que não guardamos o IP junto do e-mail
O rate limit (seção abaixo) é feito em memória, no processo do servidor —
nunca grava o IP em lugar nenhum, nem no banco, nem em log. Isso significa
que, se o servidor reiniciar (deploy novo, por exemplo), o contador de cada
IP volta a zero — um preço aceitável para esta fase (baixo volume, sem
operação 24/7 crítica ainda) em troca de não precisar justificar guardar
dado de rastreamento junto ao e-mail das pessoas. Se um dia o volume exigir
rate limit persistente entre reinícios ou entre múltiplas réplicas (hoje
não é o caso — um único contêiner), a forma correta seria um Redis (que já
existe reservado no Easypanel, `vuumbora-redis`) guardando só
`IP → contagem`, **nunca** `IP → email`, e com expiração automática curta
(a própria natureza do rate limit já expira contadores sozinha).

### Por que o rate limit é por IP
"Limite de requisições por origem" foi lido como "por IP de quem está
pedindo" (o sentido mais comum do termo em proteção contra abuso/robô) —
não "por domínio que chama a API" (isso já é resolvido separadamente pelo
CORS, que restringe quais sites podem chamar, não quantas vezes). Padrão:
**5 requisições por IP a cada 10 minutos** nesta rota especificamente
(configurável por `WAITLIST_RATE_LIMIT_MAX`/`WAITLIST_RATE_LIMIT_WINDOW_MINUTES`),
mais um limite geral de 100 requisições/minuto por IP no servidor inteiro
(contra varredura/DoS genérico, não específico desta rota).

### Por que CORS com lista explícita de origens
`ALLOWED_ORIGINS` é uma lista fechada (não "aceitar qualquer origem") —
sem isso, qualquer site na internet poderia embutir um formulário chamando
esta API em nome de visitantes dele. Em produção, só
`https://www.vuumbora.com.br` deveria estar na lista.

### Por que Fastify + `pg` direto, sem ORM
Uma tabela, uma consulta de escrita e duas de leitura/exclusão — um ORM
inteiro (Prisma, TypeORM) seria peso desproporcional ao problema agora.
Quando a Fase 5 trouxer corridas, pagamentos e mais tabelas relacionadas,
vale reconsiderar.

## 7. Por que o formulário não vai ao ar ainda

A LGPD exige que a pessoa saiba **para quem** está entregando o e-mail, e
para onde escrever se quiser pedir exclusão depois. O aviso de privacidade
do formulário precisa cobrir as duas coisas.

**Controlador — resolvido em 19/11/2026:** a empresa é **Innovare Code**,
CNPJ **09.813.446/0001-00**. É esse nome e CNPJ que o aviso de privacidade
do formulário deve citar como quem controla os dados (ver
`docs/decisoes-do-dono.md` → "Lista de espera: aprovada em 18/11/2026, com
condições", item 1).

**Ainda pendente (19/11/2026): canal de contato para pedido de exclusão.**
Não existe, até agora, um e-mail ou canal definido para quem quiser pedir
a remoção do próprio e-mail da lista. Sem isso, o aviso de privacidade não
tem "para onde escrever" — e o item 2 da decisão do dono (aviso mínimo)
exige exatamente essa informação. **Isto continua bloqueando a publicação
do formulário no site.** O mecanismo de exclusão em si já existe e funciona
(seção 4, acima, `scripts/delete-waitlist.mjs`) — o que falta é só o
endereço para a pessoa pedir, não a capacidade técnica de atender o pedido.

**Isto bloqueia só a publicação do formulário no site, não o backend.**
Este serviço pode (e deve) ser publicado, testado e ficar no ar — só não
deve ser linkado/exposto no formulário público do `apps/site` até:
1. o dono passar o canal de contato para exclusão (pendência acima), e
2. o aviso de privacidade mínimo (controlador + finalidade + "não vende
   nem repassa" + canal de exclusão) entrar junto do campo no formulário.
