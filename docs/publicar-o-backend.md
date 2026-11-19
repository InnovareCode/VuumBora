# Publicar o backend (vuumbora-backend)

Escrito em 19/11/2026. Antes disto, a página de pré-lançamento ia ao ar sem
captar candidatura nenhuma: um `POST` em
`www.vuumbora.com.br/v1/driver-applications` devolvia **405 do nginx**, não da
API. Medido, não suposto.

Sem este passo, o formulário mostra o aviso honesto ("ainda não estamos
recebendo candidaturas aqui") em vez de fingir que enviou. Correto, mas é zero
motorista na lista.

O que já está pronto do nosso lado: `apps/api/Dockerfile` existe e é
autossuficiente (a API não depende de nenhum pacote interno, só de bibliotecas
externas), e `scripts/check-docker-context.mjs` confere os três Dockerfiles do
projeto a cada `npm run check`.

---

## 1. O banco

O serviço `vuumbora-banco` (PostgreSQL) já existe no painel, criado junto com o
projeto. Abra-o e copie a **string de conexão interna**, aquela que começa com
`postgres://` e aponta para o nome do serviço, não para a internet. Ela é o
`DATABASE_URL` do passo 3.

Use a interna de propósito: o banco não precisa ficar exposto para fora, e um
Postgres aberto na internet é varrido por robôs em questão de horas.

## 2. As migrações

Duas, nesta ordem, em `apps/api/migrations/`:

1. `0001_create_waitlist_signups.sql` — a lista de espera do passageiro
2. `0002_create_driver_applications.sql` — a candidatura de motorista

No Easypanel, abra o `vuumbora-banco`, entre no console de SQL e cole o conteúdo
de cada arquivo, um de cada vez, conferindo que o primeiro terminou sem erro
antes de passar ao segundo.

Para confirmar que deu certo:

```sql
select table_name from information_schema.tables where table_schema = 'public';
```

Tem que listar `waitlist_signups` e `driver_applications`.

## 3. O serviço do backend

No serviço `vuumbora-backend`, aba **Fonte**:

- Repositório: `InnovareCode/VuumBora`, branch `main`
- **Dockerfile Path:** `apps/api/Dockerfile`
- **Build Path / contexto:** a raiz do repositório, não `apps/api`

Na aba de **variáveis de ambiente**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string interna do passo 1 |
| `ALLOWED_ORIGINS` | `https://www.vuumbora.com.br,https://vuumbora.com.br` |
| `PORT` | `3000` |
| `TRUST_PROXY` | `true` |

As duas primeiras são obrigatórias: a API se recusa a subir sem elas, de
propósito, para nunca rodar com banco vazio em silêncio. `TRUST_PROXY` importa
porque o limite de requisições conta por IP, e atrás do proxy do Easypanel todo
mundo chegaria com o mesmo endereço sem isso.

O que **não** precisa mexer: os limites de requisição têm padrão de 5 tentativas
a cada 10 minutos, que é o que validamos.

## 4. O endereço da API

Exponha o serviço num domínio, por exemplo `api.vuumbora.com.br`, com HTTPS.

Para conferir que subiu:

```
GET https://api.vuumbora.com.br/healthz   →  200 e {"status":"ok"}
```

Enquanto o banco não estiver ligado, esse mesmo endereço responde **503**. Isso é
o comportamento correto: a API prefere dizer que está indisponível a aceitar
candidatura que não vai ser gravada.

## 5. Ligar o formulário

Com o endereço no ar, falta uma linha, em
`site-cine/public/assets/js/config.js`:

```js
window.VUUMBORA_CONFIG = { apiBaseUrl: 'https://api.vuumbora.com.br' };
```

Me avise quando o passo 4 estiver respondendo e eu preencho, publico e confiro
de fora. Enquanto estiver vazio, o formulário continua mostrando o aviso
honesto.

## 6. Conferir de ponta a ponta

Depois de tudo no ar, vale mandar uma candidatura de teste pelo site e checar
que ela chegou:

```bash
npm run driver-applications:export --workspace @vuumbora/api
```

Esse script lê o banco e lista as candidaturas. Se a sua aparecer ali, o caminho
inteiro está fechado: formulário, API, banco.

## O que continua sem prova

Nada disso rodou contra Postgres real ainda. A API foi exercitada com
`app.inject()` (validação de campo, erro 400 com todos os campos, 429 do limite,
503 sem banco), mas **a deduplicação por e-mail e a normalização de telefone com
entrada real de gente nunca foram testadas contra o banco**. É o primeiro
trabalho da Íris quando o backend subir.
