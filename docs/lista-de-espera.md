# Lista de espera e pré-cadastro de motorista — como rodar, publicar, exportar e excluir

Esta é a primeira peça real de backend do VuumBora (`apps/api`). Até aqui
tudo no projeto era simulado (`mock`) nos apps; este serviço grava de
verdade, num banco de verdade.

**Aprovado pelo dono em 18/11/2026.** Este documento serve para rodar,
publicar e operar o serviço, incluindo a ampliação de 19/11/2026 que
acrescentou o pré-cadastro de motorista (ver `docs/decisoes-do-dono.md` →
"DECISÃO: duas etapas").

## O que este serviço faz (e o que não faz)

Dois endpoints públicos, duas tabelas, dois públicos diferentes:

1. **`POST /v1/waitlist`** — lista de espera simples do **passageiro**: só
   e-mail (perfil sempre `'passenger'`). Avisa quando o app lançar, nada
   mais.
2. **`POST /v1/driver-applications`** — candidatura de pré-cadastro do
   **motorista**, etapa 1 de 2 (`docs/decisoes-do-dono.md` → "DECISÃO: duas
   etapas", 19/11/2026): nome completo, telefone (WhatsApp), e-mail, cidade,
   UF, e duas perguntas opcionais de elegibilidade. O dono **avalia cada
   candidatura** — não é inscrição automática.

Em nenhum dos dois se pede CPF, CNH, documento do veículo nem foto — isso é
a etapa 2 do cadastro de motorista, que só existe depois da aprovação e de
existir processo de verificação e guarda segura (decisão 9,
`docs/decisoes-do-dono.md`). Endereço residencial também não é coletado
antes da aprovação, pelo mesmo motivo.

Não tem painel administrativo. Exportar e excluir são comandos de linha de
comando (seções abaixo) — a decisão aqui foi não construir uma superfície
de administração pra duas tabelas pequenas.

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

> **Excluir (`waitlist:delete`, `driver-applications:delete`) exige a credencial DONA do banco**
> (`MIGRATION_DATABASE_URL`): o papel restrito da API (migração 0017) não apaga linhas. Exportar
> (`*:export`) continua funcionando com a `DATABASE_URL` da API. Ver `docs/publicar-o-backend.md`.

Teste rápido de que subiu:

```bash
curl http://localhost:3000/healthz
# {"status":"ok"}  (ou {"status":"unavailable"} se o Postgres não responder)

curl -X POST http://localhost:3000/v1/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@exemplo.com","profile":"passenger"}'
# {"ok":true}

curl -X POST http://localhost:3000/v1/driver-applications \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria Silva","phone":"(84) 99999-8888","email":"maria@exemplo.com","city":"Natal","state":"RN"}'
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
     `DRIVER_APPLICATION_RATE_LIMIT_MAX` (padrão `5`),
     `DRIVER_APPLICATION_RATE_LIMIT_WINDOW_MINUTES` (padrão `10`),
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

## 4b. Candidaturas de motorista — exportar e excluir

Mesmo padrão da lista de espera, em comandos próprios (tabela própria,
`driver_applications`):

```bash
# dentro do contêiner, ou localmente com o atalho do workspace
node scripts/export-driver-applications.mjs > candidaturas.csv
npm run driver-applications:export --workspace @vuumbora/api > candidaturas.csv

node scripts/delete-driver-application.mjs --email=pessoa@exemplo.com
npm run driver-applications:delete --workspace @vuumbora/api -- --email=pessoa@exemplo.com
```

O CSV exportado traz todas as colunas: `name, email, phone, city, state,
already_drives_for_app, has_own_vehicle, status, source, created_at`. A
exclusão apaga a candidatura **inteira** — todos os campos, não só o
e-mail — pelo mesmo motivo da lista de espera (direito de exclusão, LGPD).

**Sobre a coluna `status`:** toda candidatura nasce `'pending'`. Não existe,
nesta entrega, nenhum endpoint ou script para mudar isso — é uma decisão
deliberada (ver "Por que existe uma coluna `status` sem fluxo de aprovação"
mais abaixo). Mudar para `'approved'`/`'rejected'` hoje é manual, via SQL
direto no banco.

## 5. Contrato HTTP (para o site consumir)

Tipos e adaptador prontos em `packages/api-client/src/waitlist`
(`WaitlistPort`, `createWaitlistHttpAdapter`) e em
`packages/api-client/src/driver-applications` (`DriverApplicationPort`,
`createDriverApplicationHttpAdapter`) — quem for ligar qualquer um dos dois
formulários do site deveria importar daí, não reimplementar o `fetch` à
mão.

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

### `POST /v1/driver-applications`

Corpo (JSON):

```json
{
  "name": "Maria Silva",
  "phone": "(84) 99999-8888",
  "email": "maria@exemplo.com",
  "city": "Natal",
  "state": "RN",
  "alreadyDrivesForApp": true,
  "hasOwnVehicle": false
}
```

| Campo | Obrigatório | Normalização no servidor |
|---|---|---|
| `name` | sim | trim; mínimo 2, máximo 120 caracteres |
| `phone` | sim | qualquer formato que a pessoa digite (com/sem DDI, parênteses, espaço, hífen, com/sem o 9º dígito) é aceito e **normalizado para E.164** (`+55DDXXXXXXXXX`) antes de gravar |
| `email` | sim | trim, minúsculas |
| `city` | sim | trim; mínimo 2, máximo 120 caracteres |
| `state` | sim | sigla de UF (2 letras), maiúsculas; qualquer uma das 27 UFs brasileiras é aceita — o dono filtra por região (RN/Grande Natal) depois, isto não é regra de negócio do servidor |
| `alreadyDrivesForApp` | não | booleano |
| `hasOwnVehicle` | não | booleano |

| Situação | HTTP | Corpo |
|---|---|---|
| Sucesso (e-mail novo **ou** já candidatado — sempre igual, de propósito) | `200` | `{"ok":true}` |
| Um ou mais campos inválidos (TODOS reportados de uma vez, não só o primeiro) | `400` | `{"ok":false,"error":{"code":"validation_failed","message":"Verifique os campos destacados.","fields":{"name":"Informe o nome completo.","phone":"Celular inválido — informe um número de WhatsApp válido com DDD."}}}` — `fields` tem uma chave por campo inválido, valor é a mensagem em português daquele campo |
| Corpo da requisição malformado (JSON inválido, vazio, não é objeto, maior que 10 KB) | `400` | `{"ok":false,"error":{"code":"invalid_body","message":"Corpo da requisição inválido."}}` — sem `fields`: não há um campo específico para apontar |
| Limite de requisições atingido (padrão: 5 por IP a cada 10 min nesta rota) | `429` | `{"ok":false,"error":{"code":"rate_limited","message":"Muitas requisições. Tente novamente em alguns minutos."}}` |
| Banco fora do ar / erro interno ao gravar | `503` | `{"ok":false,"error":{"code":"unavailable","message":"Serviço temporariamente indisponível. Tente novamente em alguns minutos."}}` |
| Origem (domínio) não autorizada | — | bloqueado pelo navegador via CORS, mesmo mecanismo da lista de espera |

**O que o formulário deve mostrar em cada caso** (para a Lyra e a Íris):
- **Sucesso:** mensagem de candidatura recebida — nunca "aprovada": o dono
  ainda vai avaliar.
- **Campo(s) inválido(s):** erro inline em cada campo apontado em
  `error.fields`, um por campo — o formulário pode mostrar todos de uma vez
  numa única submissão.
- **Celular inválido:** mensagem pede DDD e número reais de WhatsApp — não
  é só "formato errado", é "isto não parece um celular brasileiro válido".
- **Limite atingido / falha de serviço:** mesmo tratamento da lista de
  espera (mensagem genérica de "tente de novo depois").

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
Duas tabelas pequenas, uma consulta de escrita e duas de leitura/exclusão
cada — um ORM inteiro (Prisma, TypeORM) seria peso desproporcional ao
problema agora. Quando a Fase 5 trouxer corridas, pagamentos e mais tabelas
relacionadas, vale reconsiderar.

### Por que `driver_applications` é uma tabela separada de `waitlist_signups`
São dois públicos e dois fluxos diferentes desde 19/11/2026: o passageiro
continua com inscrição simples (um campo, sem avaliação); o motorista
virou candidatura avaliada pelo dono (seis campos, com resultado). Juntar
os dois na mesma tabela exigiria todas as colunas novas aceitando `NULL`
pra sempre no caso do passageiro, e mais cedo ou mais tarde confundiria
"lista de espera" com "candidatura em análise" — dois conceitos que o
próprio site já separa em dois formulários e duas portas distintas
(`WaitlistPort` vs. `DriverApplicationPort`).

### Por que o celular é normalizado para E.164 no servidor
Uma pessoa digita o próprio WhatsApp de formas bem diferentes: com ou sem
`+55`, com ou sem parênteses/espaço/hífen, às vezes sem o 9º dígito (quem
decorou o número antes da universalização de 2016/2017). Aceitar qualquer
um desses formatos no campo e normalizar tudo para `+55DDXXXXXXXXX` antes
de gravar (`src/domain/phone.ts`) evita duas filas de erro: a pessoa não vê
"formato inválido" por causa de um hífen, e quem analisa a candidatura
depois sempre vê o número no mesmo formato, pronto pra discar ou abrir o
WhatsApp direto.

### Por que existe uma coluna `status` sem fluxo de aprovação
A candidatura de motorista tem um resultado possível (aprovada ou
recusada) desde que nasceu — o dono avalia cada uma. Criar a coluna
`status` agora (sempre `'pending'`, por `DEFAULT` do banco — ver migração
0002) evita uma migração dolorosa quando o fluxo de aprovação existir.
**Deliberadamente, nada mais foi construído:** nenhum endpoint, script ou
tela lê ou altera esse valor nesta entrega. Quem analisa as candidaturas,
em quanto tempo e com qual critério continua sendo pendência do dono
(`docs/decisoes-do-dono.md` → "Campos do pré-cadastro de motorista",
"Pendência que isso cria") — construir um fluxo de aprovação antes dessa
resposta seria inventar processo que pode não bater com o real.

## 7. Privacidade — o que falta para os formulários irem ao ar

A LGPD exige que a pessoa saiba **para quem** está entregando os dados, e
para onde escrever se quiser pedir exclusão depois. O aviso de privacidade
de cada formulário precisa cobrir as duas coisas — e, desde 19/11/2026,
**citar os campos reais que aquele formulário coleta**, não só "seu
e-mail" (`docs/decisoes-do-dono.md` → "Campos do pré-cadastro de
motorista", item 2 da lista de responsabilidades).

**Controlador e canal de exclusão — resolvidos em 19/11/2026:**
- Controlador: **Innovare Code**, CNPJ **09.813.446/0001-00**.
- Canal de exclusão: **contato@vuumbora.com.br**.

Os dois avisos mínimos (texto exato em `apps/site`, não deste repositório
de backend) já citam ambos. Nenhuma pendência de dado bloqueia mais a
publicação:

| Formulário | O que o aviso precisa citar | Mecanismo de exclusão |
|---|---|---|
| Lista de espera (passageiro) | só e-mail, finalidade única (avisar do lançamento) | `scripts/delete-waitlist.mjs` (seção 4) |
| Candidatura (motorista) | nome, telefone, e-mail, cidade, UF — e, se respondidas, as duas perguntas de elegibilidade | `scripts/delete-driver-application.mjs` (seção 4b) |

**Nome e telefone tornam a base da candidatura identificável de verdade** —
diferente de um e-mail solto, nome + telefone juntos permitem contatar a
pessoa fora do VuumBora, o que torna um eventual vazamento mais grave. Isso
não é motivo para não coletar (a finalidade — avaliar quem pode dirigir —
exige esses dados), mas é motivo para o canal de contato
(contato@vuumbora.com.br) **ser lido de fato**, porque agora existe gente
esperando resposta, não só um e-mail promocional futuro.
