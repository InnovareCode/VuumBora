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

## 2. As migrações: nada a fazer

**A API cria o banco e aplica as migrações sozinha, no boot.** Não há SQL para
colar, console para abrir nem ordem para acertar.

Isto mudou em 19/11/2026, depois que a primeira tentativa manual quase colou o
SQL no banco `postgres` em vez do `vuumbora`: as tabelas teriam nascido no
lugar errado e a API falharia depois, com o banco existindo e vazio. Um passo
manual que precisa acertar o banco certo no console certo é um passo que vai
errar algum dia.

O que acontece quando o contêiner sobe, antes de a primeira requisição ser
aceita (`apps/api/src/migrate.ts`):

1. **Cria o banco** apontado pela `DATABASE_URL`, se ele não existir.
2. **Espera** o Postgres aceitar conexão (até `DB_BOOT_WAIT_SECONDS`, padrão 60):
   o banco costuma subir depois da API.
3. **Aplica** todo `.sql` de `apps/api/migrations/` que ainda não está
   registrado em `schema_migrations`, cada um na própria transação.

Se qualquer um dos três falhar, **o processo morre em vez de servir**. É de
propósito: reiniciar em loop visível é melhor que um formulário que aceita
candidatura e não grava nada.

É seguro repetir. Provado em 19/11/2026 contra um PostgreSQL 18 real, com
**quatro instâncias subindo ao mesmo tempo num servidor sem o banco**: as
quatro responderam `healthz 200`, sobrou um banco só e cada migração ficou
registrada uma única vez. Um `pg_advisory_lock` faz a fila. O mesmo teste
revelou um defeito que a leitura do código não revelaria: `CREATE DATABASE` em
paralelo devolve `23505`, não o `42P04` que a documentação sugere, e a primeira
versão matava três das quatro instâncias no boot.

Para conferir depois de subir, se quiser:

```sql
select table_name from information_schema.tables where table_schema = 'public';
```

Lista `waitlist_signups`, `driver_applications` e `schema_migrations`.

**Rodar sem subir a API** (conferência ou recuperação manual), de dentro do
contêiner ou com a `DATABASE_URL` no ambiente:

```
npm run migrate --workspace @vuumbora/api
```

Esse script chama o mesmo módulo do boot, de propósito: duas implementações de
migração é como uma delas fica para trás sem ninguém perceber.

`docs/sql/migracoes-completas.sql` continua no repositório só como saída de
emergência, para colar à mão se um dia o boot não puder rodar. No caminho
normal, ninguém precisa abrir esse arquivo.

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
| `ADMIN_ALLOWED_ORIGINS` | `https://admin.vuumbora.com.br` |
| `PORT` | `3000` |
| `TRUST_PROXY` | `true` |

⚠️ **`ADMIN_ALLOWED_ORIGINS` é obrigatória e nasceu em 20/11/2026** — a API
**não sobe sem ela**. Quem republicar o backend sem preenchê-la primeiro
derruba junto o formulário de candidatura do site, que depende da mesma API.
**Preencha antes de publicar**, não depois.

**As duas listas são separadas de propósito, e não devem se misturar:**
`ALLOWED_ORIGINS` é do site público, sem cookie e **sem credenciais**;
`ADMIN_ALLOWED_ORIGINS` é só do painel, a única família de rotas que usa
cookie de sessão. Juntar as duas foi exatamente o furo de CSRF que o Órion
encontrou: com o site na mesma lista que o painel e credenciais ligadas
globalmente, um XSS no site público conseguiria ler a resposta de
`/v1/admin/me`, roubar o token de CSRF e decidir candidaturas em nome de um
administrador. Nunca ponha o domínio do painel na lista pública, nem o do
site na lista do painel.

As três primeiras são obrigatórias: a API se recusa a subir sem elas, de
propósito, para nunca rodar com banco vazio nem com CORS aberto em silêncio. `TRUST_PROXY` importa
porque o limite de requisições conta por IP, e atrás do proxy do Easypanel todo
mundo chegaria com o mesmo endereço sem isso.

⚠️ A `DATABASE_URL` tem que terminar no nome do banco da aplicação, por exemplo
`.../vuumbora`. Se terminar em `/postgres`, é nesse banco que as tabelas vão ser
criadas — funciona, mas mistura os dados da aplicação com o banco de sistema.

O que **não** precisa mexer: os limites de requisição têm padrão de 5 tentativas
a cada 10 minutos, que é o que validamos. A migração automática também já vem
ligada. As três variáveis abaixo existem só para casos fora do comum:

| Variável | Padrão | Para quê |
|---|---|---|
| `RUN_MIGRATIONS_ON_BOOT` | ligado | `false` desliga o preparo no boot (migração manual controlada) |
| `CREATE_DATABASE_IF_MISSING` | ligado | `false` em Postgres gerenciado, onde o banco já vem pronto e o usuário não pode criar |
| `DB_BOOT_WAIT_SECONDS` | `60` | quanto esperar o Postgres aceitar conexão antes de desistir |

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
`apps/site/public/assets/js/config.js`:

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

## O que já foi provado contra Postgres real

Em 19/11/2026, contra um PostgreSQL 18.1 rodando de verdade (um cluster
temporário e isolado, em porta separada, apagado depois):

- **Banco criado do zero pelo boot**, as duas migrações aplicadas, `healthz 200`.
- **Segundo boot não repete nada:** "0 migração(ões) nova(s)".
- **Quatro instâncias ao mesmo tempo, banco inexistente:** as quatro saudáveis,
  um banco só, cada migração registrada uma única vez.
- **Deduplicação por e-mail:** quatro envios do mesmo endereço, incluindo em
  MAIÚSCULAS e com espaços em volta, viraram **uma linha** no banco. A resposta é
  sempre `{"ok":true}`, sem revelar que o e-mail já estava lá.
- **Normalização de telefone:** `(84) 9 8888-7777`, `84988887777` e
  `+55 84 98888-7777` gravaram todos como `+5584988887777`.

Antes disso a API só tinha sido exercitada com `app.inject()` — validação de
campo, 400 com todos os campos, 429 do limite, 503 sem banco.

## O que continua sem prova

A imagem Docker **nunca foi construída nesta máquina** (não há Docker aqui): o
que foi provado é a aplicação rodando com Node direto, mais a guarda
`check-docker-context.mjs`, que confere que os `COPY` dos Dockerfiles e o
`.dockerignore` não se contradizem. Build verde no servidor continua sendo o
primeiro teste real da imagem.
