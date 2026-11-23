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

Atualizado em 22/11/2026 (rodada 3b da Órion, achados B-5 e B-7): o fim da seção 3 ganhou cinco subseções, sobre os
Termos e a Política (sem versão publicada o cadastro responde 503), a CPU do contêiner e a pista do bcrypt, a chave do 2FA
e a senha do SMTP, uma conferência da trilha de auditoria e a ordem do primeiro deploy do S1.

Atualizado de novo em 22/11/2026 (F07 e F11, já mescladas na `main`): o conjunto do primeiro deploy do S1 passou de
"migrações 0010–0021" para **0010–0023** — a F11 trouxe a 0022 (exclusão de conta) e a F07 trouxe a 0023 (usuários e
papéis do painel). Conferido no código (`apps/api/src/env.ts` e os módulos de configuração por área): nenhuma das duas
fatias criou variável de ambiente nova — reaproveitam `ADMIN_LOGIN_RATE_LIMIT_MAX`/`_WINDOW_MINUTES` (rotas novas do
painel) e `GLOBAL_RATE_LIMIT_MAX` (exclusão de conta, `/v1/auth/me` e `/v1/legal/current`, achado F01-M1 da Órion). Nada
a acrescentar no passo 6 de `docs/producao-passo-a-passo-dono.md` por causa delas.

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
| `TRUST_PROXY` | `1` |

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

**`TRUST_PROXY` é o NÚMERO de proxies à frente da API, não "confiar em tudo"** (achado A-1 da
revisão S1). `1` = só o Traefik do Easypanel. Com CDN na frente dele (ex.: Cloudflare), ponha `2`.
Também aceita lista de IP/CIDR (`10.0.0.0/8,172.16.0.0/12`) ou `false`. Antes, `true` fazia a API
acreditar no `X-Forwarded-For` escrito pelo próprio cliente, e quem forjasse o cabeçalho escolhia o
IP e driblava todo limite por IP. O valor `true` antigo continua aceito, mas agora vale `1`.
Confira em produção: `curl -H "X-Forwarded-For: 1.2.3.4" https://api.vuumbora.com.br/health` — o IP
que a API registra no log **não** pode ser `1.2.3.4`.

⚠️ A `DATABASE_URL` tem que terminar no nome do banco da aplicação, por exemplo
`.../vuumbora`. Se terminar em `/postgres`, é nesse banco que as tabelas vão ser
criadas — funciona, mas mistura os dados da aplicação com o banco de sistema.

O que **não** precisa mexer: os limites de requisição têm padrão de 5 tentativas
a cada 10 minutos, que é o que validamos. A migração automática também já vem
ligada. As três variáveis abaixo existem só para casos fora do comum:

| Variável | Padrão | Para quê |
|---|---|---|
| `RUN_MIGRATIONS_ON_BOOT` | ligado | `false` desliga o preparo no boot (migração manual controlada) |
| `REQUIRE_SECRETS` | desligado | `true` faz o boot **falhar** se faltar/estiver fraco `AUTH_PEPPER`, `AUTH_JWT_SECRET` ou `ADMIN_TOTP_ENCRYPTION_KEY` (sem a flag a API sobe e **avisa alto** no log, com os nomes). Ligue em produção depois de provisionar os três |
| `CREATE_DATABASE_IF_MISSING` | ligado | `false` em Postgres gerenciado, onde o banco já vem pronto e o usuário não pode criar |
| `DB_BOOT_WAIT_SECONDS` | `60` | quanto esperar o Postgres aceitar conexão antes de desistir |

### Duas credenciais de banco: a da API (restrita) e a do dono (fora do contêiner da API)

Revisão de segurança S1 rodada 2, achado I-3. A API roda com o papel **`vuumbora_api`**, que a migração `0017`
reduz ao mínimo: ele **não** cria administrador, **não** emite token de ativação do 2FA e **não** apaga conta,
sessão, lista de espera nem candidatura. Isso só protege se a credencial **dona** do banco (a que cria
administrador e desliga trigger) **não estiver no mesmo contêiner**: quem vaza o ambiente da API leva as duas.

| Credencial | Onde fica | Para quê |
|---|---|---|
| `DATABASE_URL` → `vuumbora_api` | serviço da API (runtime) | atender requisições |
| `MIGRATION_DATABASE_URL` → dono | **só** em tarefa/terminal de operador | migrar, `create-admin`, `reissue-2fa-enrollment`, `waitlist:delete`, `driver-applications:delete`, `identity:retention` |

Passo a passo (infraestrutura — Vulcano):

1. Ative o papel uma vez: `node scripts/ativar-papel-api.mjs` (com `MIGRATION_DATABASE_URL` = credencial dona). Ele
   gera uma senha, roda o `ALTER ROLE` e imprime a `DATABASE_URL` pronta — cole-a em `DATABASE_URL` da API (nunca
   imprime a URL dona). `docs/sql/ativar-papel-api.sql` tem o SQL equivalente, manual, se preferir não rodar o script.
2. **Retire `MIGRATION_DATABASE_URL` do ambiente do serviço da API.** Com `RUN_MIGRATIONS_ON_BOOT` ligado a API ainda
   migra no boot e, sem a credencial dona, usa a própria `DATABASE_URL` (o papel restrito não faz DDL): então, em produção,
   **desligue `RUN_MIGRATIONS_ON_BOOT`** e migre por uma tarefa de operador que tenha `MIGRATION_DATABASE_URL`:
   `npm run migrate -w @vuumbora/api`.
3. Os scripts de operador (`create-admin`, `reissue-2fa-enrollment`, `*:delete`, `identity:retention`) leem
   `MIGRATION_DATABASE_URL` e **avisam** se tiverem de cair em `DATABASE_URL` (com o papel restrito eles falham de propósito).
   Rode-os num terminal/tarefa do Easypanel em que a variável exista só durante a execução, e agende a retenção
   (`identity:retention`, diário) com a mesma regra.
4. Se for inevitável manter `MIGRATION_DATABASE_URL` no serviço da API (migração no boot), a API a **remove do
   `process.env` depois de migrar** e avisa no log a cada boot (`[server] AVISO ...`). Isso reduz, não elimina: o ambiente do
   contêiner continua legível por quem tem acesso ao contêiner.
5. Confira com `DATABASE_URL="<a URL da API>" node scripts/conferir-papel-api.mjs`: ele prova que `current_user` é
   `vuumbora_api`, que `SELECT 1` funciona e que `DELETE` em `admin_users`, `UPDATE` em `admin_audit_log` e qualquer
   DDL falham com `permission denied` — tudo dentro de uma transação com `ROLLBACK`, sem efeito no banco.
   **Atenção:** desde a migração 0023 (F07), o papel restrito PODE `INSERT`/`UPDATE` em `admin_users` (nunca
   `DELETE`) — a gestão de usuários do painel precisa escrever ali. `INSERT INTO admin_users ...` passar não é mais
   sinal de falha; a matriz completa de privilégios mora em `apps/api/test/runtime-role.test.ts`, que prova isso
   contra Postgres real a cada execução do CI.

⚠️ **Isto ficou mais estreito em 22/11/2026 (F07, migração 0023):** a credencial `vuumbora_api` passou a poder
`INSERT`/`UPDATE` em `admin_users` (nunca `DELETE`) e `INSERT`/`DELETE` em `admin_enrollment_tokens` — só para a rota
`/v1/admin/users/*`, atrás de papel `dono` + CSRF + senha (e TOTP nas mutações mais sensíveis). O passo 5 de
`docs/producao-passo-a-passo-dono.md` (criar o PRIMEIRO administrador por `create-admin.mjs`, com a credencial dona)
continua necessário do mesmo jeito: sem nenhum admin, não há sessão `dono` para abrir a tela de usuários. Detalhe
completo em `docs/contrato-admin-usuarios.md`, seção "Decisão de segurança registrada".

### Termos de Uso e Política: `LEGAL_DOCUMENTS_BASE_URL` e a primeira versão publicada

Achado B-7 da Órion (`docs/revisao-seguranca-s1-rodada3b.md`). **Sem isto o cadastro dos apps responde 503
`consent_unavailable`**, de propósito: o app não pode registrar "aceitei" de um texto que não conseguiu mostrar. Login,
renovação de sessão e o resto continuam funcionando, então no primeiro deploy parece só que "o cadastro não funciona".
Duas coisas têm de existir **antes do primeiro cadastro**: o endereço dos textos e uma versão publicada para cada um destes
4 pares:

| Par (documento e perfil) | Arquivo que tem de existir |
|---|---|
| Termos do passageiro | `<base>/terms/passenger/<versão>` |
| Política do passageiro | `<base>/privacy/passenger/<versão>` |
| Termos do motorista | `<base>/terms/driver/<versão>` |
| Política do motorista | `<base>/privacy/driver/<versão>` |

1. **Variável no serviço da API:** `LEGAL_DOCUMENTS_BASE_URL` = o endereço-base, **sem barra no fim**. Onde hospedar é decisão
   do dono (a API não tem valor padrão); a sugestão que já está no `.env.example` é `https://www.vuumbora.com.br/legal`.
   Regras: `https` em produção, sem usuário e senha, sem `?` nem `#`. Fora disso a API recusa a variável e responde 503 do
   mesmo jeito, e o boot avisa no log (`legal_unavailable`). **`AUTH_TERMS_VERSION` e `AUTH_PRIVACY_VERSION` saíram:** a
   versão vigente mora no banco (`legal_document_versions`) e o código não lê mais as duas (busca em `apps/api/src`, `test` e
   `scripts`, sem ocorrência). Se estiverem no ambiente de produção, apague.

2. **Hospedar os textos.** Se for no site, os arquivos ficam em
   `apps/site/public/legal/<terms|privacy>/<passenger|driver>/<versão>` e vão ao ar quando o `vuumbora-frontend` for
   republicado. O nome do arquivo **é** a versão, **sem extensão** (por exemplo `2026-12-01`; letras, dígitos e `. _ : + -`,
   até 64 caracteres). O arquivo é **imutável**: texto novo = versão nova. O mesmo texto pode servir aos dois perfis (dois
   arquivos com os mesmos bytes). Os textos e a versão são do dono e do jurídico (em aberto em `docs/decisoes-do-dono.md`);
   a equipe não os redige.

   **Atenção: o nginx do site não devolve 404 para arquivo que falta.** O `apps/site/nginx.conf` manda qualquer caminho sem
   arquivo para o `index.html`, com **status 200**. Versão digitada errada ou site ainda não republicado resulta na página
   inicial do site, não num erro. Por isso a conferência abaixo é pelo **hash do que o endereço devolve**, nunca pelo status.
   (Li o `nginx.conf`; não medi em produção.) Sem extensão, o arquivo provavelmente sai como `application/octet-stream`
   (padrão do nginx, também não medido): o app lê como texto, mas um navegador baixaria o arquivo em vez de abri-lo. Se
   quiser que o link abra na tela, peça um ajuste no nginx.

3. **Pegar o hash dos bytes que o endereço de fato serve**, depois de republicar o site. Não use o arquivo do seu computador:
   um espaço ou uma quebra de linha diferente muda o hash (o repositório normaliza para LF; um arquivo fora do git pode estar
   em CRLF).

   ```
   curl -s -o terms-passenger.txt https://www.vuumbora.com.br/legal/terms/passenger/2026-12-01
   head -c 100 terms-passenger.txt     # tem de ser o TEXTO; "<!DOCTYPE html>" é o index.html do site (arquivo não publicado)
   sha256sum terms-passenger.txt       # Git Bash/Linux/Mac. PowerShell: (Get-FileHash -Algorithm SHA256 .\terms-passenger.txt).Hash.ToLower()
   ```

   Guarde o hash (64 caracteres hexadecimais, minúsculos) e repita para os 4 arquivos. Se o texto é o mesmo nos dois perfis,
   os hashes saem iguais.

4. **Publicar a versão no catálogo, com a credencial dona.** O papel `vuumbora_api` só **lê** o catálogo, de propósito: quem
   vazasse o ambiente da API não poderia trocar o texto "aceito". No terminal do `vuumbora-backend`, com a mesma regra do
   `create-admin` (a `MIGRATION_DATABASE_URL` existe só durante o comando; o contêiner de produção usa `node` direto, que é o
   que o `npm run legal:publish` chama):

   ```
   # 1o, sem gravar nada (não conecta ao banco; mostra o hash e confere os argumentos):
   node scripts/publish-legal.mjs --document=terms --audience=passenger,driver --version=2026-12-01 --sha256=<hash-dos-termos> --dry-run

   # valendo: um comando por documento (a lista em --audience grava os dois perfis, com o mesmo hash):
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=terms   --audience=passenger,driver --version=2026-12-01 --sha256=<hash-dos-termos>
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=privacy --audience=passenger,driver --version=2026-12-01 --sha256=<hash-da-politica>
   ```

   São 2 comandos para os 4 pares quando o texto é o mesmo nos dois perfis. Se o do passageiro difere do do motorista, rode um
   comando por par (`--audience=passenger` e depois `--audience=driver`, cada um com o hash do seu arquivo): 4 comandos. A
   saída diz, por perfil, `PUBLICADA` e `é a vigente`.

   - A publicação é **imutável**: erro de texto ou de hash não se edita nem se apaga, publica-se a versão seguinte. Por isso o
     `--dry-run` e a conferência do passo 3 vêm antes.
   - Repetir o mesmo comando é inofensivo (mesma versão e mesmo hash: "nada mudou"); com hash diferente o script RECUSA.
   - Na primeira publicação não há conta para pedir novo aceite, então o padrão `--requires-reacceptance=true` não incomoda
     ninguém.

5. **Conferir, de fora** (um por perfil):

   ```
   curl -s "https://api.vuumbora.com.br/v1/legal/current?audience=passenger"
   curl -s "https://api.vuumbora.com.br/v1/legal/current?audience=driver"
   ```

   Esperado: `200`, com `terms` e `privacy` trazendo `version`, `sha256` e `url`. Têm de bater: (a) o `sha256` igual ao hash do
   arquivo; (b) baixar a `url` devolvida e refazer o hash (passo 3). `503 consent_unavailable` = faltou a variável (ou está
   inválida) **ou** não há versão publicada para aquele perfil.

6. **Conferir que o papel da API só lê o catálogo** (credencial dona):

   ```sql
   SELECT has_table_privilege('vuumbora_api', 'legal_document_versions', 'SELECT') AS le,
          has_table_privilege('vuumbora_api', 'legal_document_versions', 'INSERT') AS insere,
          has_table_privilege('vuumbora_api', 'legal_document_versions', 'UPDATE') AS altera,
          has_table_privilege('vuumbora_api', 'legal_document_versions', 'DELETE') AS apaga;
   ```

   Esperado: `t`, `f`, `f`, `f`.

**O que não foi provado:** os argumentos e a lógica do `legal:publish` vêm do código (`apps/api/scripts/publish-legal.mjs`,
`apps/api/src/lib/legal-publish.ts`). Eu não rodei o comando contra um banco (não há Postgres nesta máquina) nem os `curl`
contra produção.

### CPU do contêiner e a pista do bcrypt

Achado B-5 da Órion. Login, cadastro, verificação de e-mail e redefinição de senha dos apps passam por uma **pista** de bcrypt,
em threads separadas do resto da API. Duas variáveis opcionais a regulam:

| Variável | Padrão no código | O que faz |
|---|---|---|
| `AUTH_BCRYPT_CONCURRENCY` | `min(2, max(1, núcleos - 1))` | quantos hashes rodam ao mesmo tempo (1 a 8). Cada um ocupa **uma CPU inteira** enquanto roda |
| `AUTH_BCRYPT_QUEUE_MAX` | `8` | quantos esperam vaga (0 a 64); o seguinte recebe `503 server_busy` com `Retry-After: 3` |

`núcleos` é o que o Node enxerga (`os.availableParallelism()`). Num contêiner com cota de CPU isso pode ser o número de
núcleos do **servidor** e não a cota; não medi como o Node 22 lê a cota do Easypanel. Valor ilegível ou fora da faixa **volta
ao padrão sem erro**: confira a grafia depois de salvar.

Por isso, em produção, **preencha `AUTH_BCRYPT_CONCURRENCY` de forma explícita**, a partir da cota de CPU do serviço
`vuumbora-backend` (nos limites de recursos do serviço no Easypanel; se o serviço não tem limite, conte os núcleos do
servidor):

| Cota de CPU | `AUTH_BCRYPT_CONCURRENCY` | `AUTH_BCRYPT_QUEUE_MAX` |
|---|---|---|
| menos de 1, 1 ou 2 CPUs | `1` | `8` |
| 3 CPUs ou mais | `2` | `8` |

É a regra do próprio código (concorrência = CPUs menos uma, que fica para o laço principal e o banco), aplicada à **cota** e
não ao servidor, com teto 2. A espera máxima de quem entra na fila é de uns fila ÷ concorrência × 0,5 s (custo 12): 4 s com 1
vaga, 2 s com 2, abaixo do limite de 15 s do app. A pista do painel é separada (1 vaga, fila de 4), então com `1` podem rodar
até 2 hashes ao mesmo tempo, e com `2` até 3. Estes números são **ponto de partida, não medida de produção**: meça.

`AUTH_BCRYPT_COST`: não preencha (padrão 12). O código aceita de 4 a 15, e um valor baixo enfraqueceria todos os hashes novos
sem avisar; em produção use 12 ou mais. O piso no código é pendência da Vega (B-5 da Órion).

**Medir o `/healthz` sob rajada.** O `/healthz` é o que o Docker e o Easypanel usam para decidir se o serviço está vivo (o
`HEALTHCHECK` da imagem dá 3 s de limite e reprova depois de 3 falhas seguidas). Rode **dentro do contêiner** (Easypanel >
`vuumbora-backend` > Console), onde a CPU é a da cota de verdade e o IP é o de loopback: não gasta a cota de login do seu IP
nem a dos usuários.

```
node -e '
const base = "http://127.0.0.1:" + (process.env.PORT || 3000);
const medir = async (url, opcoes) => { const t0 = performance.now(); const r = await fetch(url, opcoes); await r.arrayBuffer(); return { status: r.status, ms: Math.round(performance.now() - t0) }; };
const login = (n) => medir(base + "/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountType: "passenger", identifier: "carga-" + n + "@example.com", password: "senha-qualquer-123" }) });
const contar = (xs) => xs.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
(async () => {
  const antes = await medir(base + "/healthz");
  console.log("healthz sem carga:", antes.status, antes.ms + " ms");
  const rajada = Promise.all(Array.from({ length: 30 }, (_, i) => login(i)));
  const saude = [];
  for (let i = 0; i < 15; i++) saude.push(await medir(base + "/healthz"));
  const logins = await rajada;
  console.log("30 logins ao mesmo tempo:", JSON.stringify(contar(logins)));
  console.log("healthz durante a rajada:", JSON.stringify(contar(saude)), "| pior tempo:", Math.max(...saude.map((x) => x.ms)) + " ms");
})();
'
```

Como ler:

- **"30 logins ao mesmo tempo"** deve ter `401` (o bcrypt rodou: o e-mail não existe) e `503` (a pista encheu; com o padrão,
  uns 20 dos 30). Só `400`: o corpo foi recusado antes do bcrypt e o teste não mediu nada (o contrato mudou). `429`: limite por
  IP, vale uma rajada por 15 minutos. Nenhum `503`: a pista não encheu, o teste foi fraco, não conclua nada.
- **"healthz durante a rajada"**: todos `200`. Pior tempo **abaixo de ~1 s** é confortável (regra minha); perto de **3 s** o
  `HEALTHCHECK` começa a reprovar o contêiner. Acima de ~1 s: baixe `AUTH_BCRYPT_CONCURRENCY` uma vaga (mínimo 1), salve, espere
  reiniciar e meça de novo. Já em `1` e ainda lento: falta CPU ao serviço, suba a cota; não há como proteger o laço
  principal dividindo menos de uma CPU.
- **Efeito colateral:** grava até 30 tentativas de login falhas (e-mails fictícios `carga-N@example.com`, só como HMAC); a
  retenção diária (`identity:retention`) as limpa. Faça fora do horário de pico.

**O que não foi provado:** o script foi provado só contra um servidor falso local (sintaxe, contagem por status, e o caso de
corpo recusado aparecendo como `400`). **Não foi executado contra a API real nem contra o contêiner do Easypanel:** esta
máquina não tem Postgres nem Docker, e a equipe não acessa o seu servidor. Os números de verdade saem da sua execução.

### `ADMIN_TOTP_ENCRYPTION_KEY`: nunca troque sem salvar de novo a senha do SMTP

A mesma chave cifra **duas** coisas no banco: os segredos do 2FA de dono e financeiro **e a senha do SMTP** salva no painel
(Configurações > E-mail). Com uma chave diferente nenhuma das duas decifra:

- **2FA:** dono e financeiro não conseguem entrar (`docs/break-glass-admin.md`, seção 6).
- **E-mail:** o envio dos códigos de verificação e de redefinição de senha dos apps **falha, e a tela não avisa**. No log da
  API só aparece `EmailDeliveryError`; no cadastro o app recebe `emailSent: false`. A Íris viu o e-mail não sair numa API que
  lia a configuração do painel cifrada por outra chave (`docs/veredito-iris-s1-passada-2.md`, limite 7). Ela não isolou a
  causa, mas o código se comporta exatamente assim: `apps/api/src/services/mailer.ts` trata a senha ilegível como falha de
  entrega (`password_unreadable`, "chave de cifra trocada? Salve a senha de novo").

Se a chave **tiver** de mudar, ou mudou sem querer, nesta ordem:

1. Ainda tem a chave antiga? Volte com ela: resolve as duas coisas de uma vez.
2. Senão: ponha a chave nova, cada pessoa com 2FA refaz o enrolamento (`docs/break-glass-admin.md`, seção 3; sem o 2FA
   ninguém abre o painel), entre no painel, **Configurações > E-mail > salve a senha do SMTP de novo** (pede a senha atual e um
   código do autenticador) e use **enviar e-mail de teste**.
3. Toda vez que a chave mudar, o e-mail de teste do painel faz parte da checagem.

Guarde a chave fora do Easypanel (gerenciador de senhas).

### Uma conferência no banco real: usuário SMTP antigo na trilha de auditoria

Achado B-1 da Órion, resolvido no código (commit `16c147a`): a API passou a gravar na auditoria só se há usuário SMTP
(`userConfigured`) e se ele mudou (`userChanged`). **Mas** linhas gravadas **antes** daquele commit levam o usuário em claro
(chave `user` em `before` e `after`, ação `email_settings.updated`), e a trilha é imutável: o banco recusa `UPDATE`, `DELETE` e
`TRUNCATE`, até para a credencial dona (gatilho da migração 0012; só quem desliga o gatilho consegue). Se a API do S1 nunca
salvou SMTP pelo painel em produção antes do `16c147a`, o resultado abaixo é `0`. Eu não sei se aconteceu: só o banco de
produção diz. Com a credencial dona, **só contando, sem mostrar o valor**:

```sql
SELECT count(*) AS linhas_com_usuario
FROM admin_audit_log
WHERE action = 'email_settings.updated'
  AND ((before ->> 'user') IS NOT NULL OR (after ->> 'user') IS NOT NULL);
```

- `0`: nada a fazer.
- Maior que 0: não "limpe" por impulso. O que vazou é um nome de usuário, nunca a senha (a senha nunca foi para a trilha). Se
  for um nome comum, aceite e registre em `docs/decisoes-do-dono.md`. Se o provedor usa o próprio **token como usuário**
  (alguns relays), gire a credencial no provedor: é isso que de fato desfaz a exposição. Apagar o valor da trilha é alterar um
  registro imutável (desligar o gatilho com a credencial dona, `UPDATE`, religar): só com a Vega ou o Cronos, com backup antes,
  anotando o que foi feito.

### Ordem do primeiro deploy do S1 (API com migrações e painel juntos)

A API nova, as migrações **0010 a 0023** e o painel novo formam um conjunto. O painel do `main` só funciona com a API nova (o
aviso no topo de `docs/producao-passo-a-passo-dono.md` explica), e a API nova sem as migrações não atende a identidade. A
0022 (exclusão de conta) e a 0023 (usuários e papéis do painel) não pedem nenhuma variável nova — sobem com o mesmo boot
automático da seção 2 deste documento, junto com as demais. Em ordem:

1. **Backup do banco**, restaurado ao menos uma vez (`docs/backup-e-restauracao.md`).
2. **Variáveis** no `vuumbora-backend`, antes de publicar: `ADMIN_ALLOWED_ORIGINS`, `ADMIN_TOTP_ENCRYPTION_KEY`, `AUTH_PEPPER` e
   `AUTH_JWT_SECRET` (diferentes entre si; `openssl rand -base64 48`), `LEGAL_DOCUMENTS_BASE_URL`, `AUTH_BCRYPT_CONCURRENCY` e
   `AUTH_BCRYPT_QUEUE_MAX`. Apagar `AUTH_TERMS_VERSION` e `AUTH_PRIVACY_VERSION`.
3. **Textos hospedados:** republicar o `vuumbora-frontend` com os 4 arquivos e conferir os hashes (passos 2 e 3 da seção dos
   Termos). Não depende da API.
4. **API e migrações no mesmo deploy.** Conferir `GET /healthz` = 200. Se for usar o papel restrito, siga "Duas credenciais de
   banco" acima. Nunca deixe a API antiga com o banco já migrado, nem a nova sem as migrações: não provei a compatibilidade da
   API antiga com o esquema novo.
5. **`legal:publish`** dos 4 pares e conferir `GET /v1/legal/current` nos dois perfis.
6. **Painel** (`vuumbora-admin`, branch `main`) logo em seguida, **na mesma janela**: o painel antigo
   (`producao-admin-estavel`) foi feito para o login da API antiga, sem 2FA, e eu não o provei contra a API nova. Depois, o
   passo 5 de `docs/producao-passo-a-passo-dono.md` (administrador com 2FA) e o e-mail de teste do painel.
7. **Só então** divulgar o cadastro.

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
