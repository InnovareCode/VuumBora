# Produção: o que falta e é seu — passo a passo

> 🚨 **Achado de agora (22/11/2026, Vulcano) — confira isto primeiro, antes de qualquer outro passo.** Rodando o
> script da seção 11 contra os endereços de produção de hoje (só leitura, sem senha): `https://admin.vuumbora.com.br`
> já responde com `content-security-policy` (ou seja, já é o painel NOVO, do `main`), mas
> `https://api.vuumbora.com.br/v1/auth/me` e `/v1/legal/current` respondem **404** (rota inexistente — a API em
> produção ainda NÃO é a do S1). É exatamente o descasamento que o aviso abaixo descreve, e ele já está acontecendo:
> hoje, ninguém consegue entrar no painel admin de produção (o login não conclui contra a API antiga). Duas saídas,
> sem meio-termo: (a) publicar a API do S1 com as migrações 0010–0023 **agora** (`docs/publicar-o-backend.md`, seção
> 3) — e, com o F05 liberado pelo dono, é o caminho recomendado; ou (b) reverter `vuumbora-admin` para
> `producao-admin-estavel` enquanto isso não sai (roteiro logo abaixo). Não tomei nenhuma ação em produção — só li;
> quem decide e aplica é o dono, com este roteiro.

Escrito em 21/11/2026 (Vulcano). Tudo marcado **AÇÃO DO DONO** exige o painel do
Easypanel, o GitHub ou o provedor do servidor, onde a equipe não tem acesso.
Os nomes de menu do Easypanel mudam entre versões: onde eu não tinha como
confirmar o nome exato, escrevi "algo como". O que vale é o **teste de
verificação** de cada passo, que não depende do nome do menu.

## A lista curta: o que só você faz, nesta ordem

O dono decidiu (22/11/2026): a publicação sai assim que este roteiro estiver pronto — está. O cadastro dos apps nasce
**fechado** até o passo 5 (textos legais) estar feito; isso é esperado, não é bug. Cada item abaixo aponta para a
seção com o comando/clique exato — você não precisa pesquisar nada, só seguir.

1. **Escolher a data** (pode ser hoje). Os passos 2 a 7 cabem numa sessão só; o 8 e o 9 (textos legais, SMTP) exigem
   ter o texto jurídico e a conta de e-mail em mãos antes de começar.
2. **Preencher os segredos no Easypanel**, serviço `vuumbora-backend` > Ambiente — passo 6 e seção 3 de
   `docs/publicar-o-backend.md`: `AUTH_PEPPER`, `AUTH_JWT_SECRET` (gere os dois com `openssl rand -base64 48`, guarde
   num gerenciador de senhas), `ADMIN_TOTP_ENCRYPTION_KEY` (passo 5, `openssl rand -base64 32`),
   `ADMIN_ALLOWED_ORIGINS`, `LEGAL_DOCUMENTS_BASE_URL`, `AUTH_BCRYPT_CONCURRENCY`/`AUTH_BCRYPT_QUEUE_MAX` (passo 9.3).
   Acrescente também **`REQUIRE_SECRETS` = `true`** (Órion, rodada 3h): se um dos três segredos faltar num redeploy
   futuro, a API para de subir, em vez de responder 503 em silêncio.
   **Logo depois do primeiro boot, antes de abrir o cadastro:** passe a API para o papel restrito `vuumbora_api` (Órion,
   rodada 3h). No Console do contêiner (pasta `/app`), com `MIGRATION_DATABASE_URL` apontando para a credencial dona:
   `node scripts/ativar-papel-api.mjs` — troca a senha do papel e imprime a `DATABASE_URL` pronta para o
   `vuumbora_api` (nunca mostra a URL dona). Ainda no Console, confira a URL impressa **antes de mexer no ambiente**:
   `DATABASE_URL="<a URL impressa>" node scripts/conferir-papel-api.mjs` — sai só `OK` ou mostra exatamente o item que
   falhou, sem deixar efeito no banco. Com tudo `OK`, no `vuumbora-backend` troque **no mesmo salvamento** o
   `DATABASE_URL` pela URL impressa **e** `RUN_MIGRATIONS_ON_BOOT` para `false`, e só então faça o Deploy. Se subir com o
   papel restrito e a migração no boot ainda ligada, a API tenta o `CREATE TABLE IF NOT EXISTS schema_migrations` do
   `migrate.ts`, o papel não tem permissão de DDL e o boot falha.
   **Antes de trocar, faça um Deploy simples da main atual** (ainda com a credencial dona e a migração no boot ligada):
   ele aplica as migrações novas que a main já tem (0024 em diante, documentos do motorista). Confira no log a linha das
   migrações aplicadas; só então siga para a troca acima. Sem isso, o banco fica para trás da main sem ninguém notar
   (Órion, revisão M3-D1, 27/11/2026).
   Daí em diante, as migrações rodam por tarefa de operador, com `MIGRATION_DATABASE_URL` só durante o comando
   (`docs/publicar-o-backend.md`, "Duas credenciais de banco"). Sem esse passo, a API roda com a credencial dona do
   banco, e as proteções das migrações 0017 e 0023 deixam de valer na prática. (`docs/sql/ativar-papel-api.sql` tem o
   SQL equivalente, manual, se preferir não rodar o script.)
3. **Confirmar o HTTPS do painel do próprio Easypanel** (`painel.vuumbora.com.br`, passo 2) — sem isso a senha do
   Easypanel ainda viaja em texto claro quando você for preencher o passo 2.
4. **Publicar a API com as migrações 0010–0023 e, na mesma janela, o painel** (`docs/publicar-o-backend.md`, seção 3,
   "Ordem do primeiro deploy do S1") — veja o alerta no topo desta página: hoje a API de produção ainda está
   desatualizada.
5. **Configurar o SMTP do domínio**, no painel admin (Configurações > E-mail) — servidor, porta, usuário e senha do
   provedor de e-mail do `vuumbora.com.br`; confira SPF, DKIM e DMARC do domínio (sem isso os códigos de verificação
   dos apps não saem) e use "enviar e-mail de teste".
6. **Criar o administrador de produção** (passo 5), com 2FA.
7. **Hospedar e publicar a primeira versão dos textos legais revisados** pelo jurídico (passo 9.1) — é o que destranca
   o cadastro dos apps (hoje responde 503 de propósito).
8. **Rodar `node tools/producao/verificar-pos-deploy.mjs`** (seção 11) e só considerar o deploy fechado quando a
   saída não tiver nenhuma `FALHA`.
9. **Só então divulgar o cadastro dos apps e do site.**

O suporte dentro dos apps usa o mesmo WhatsApp do site, (84) 3113-2584, atendimento todos os dias das 7h às 22h — nada
a configurar aqui, é conteúdo de tela (fora da minha parte); registrado para não inventar outro número depois.

Ordem recomendada do roteiro completo: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. O passo 3 (fechar o acesso
por IP) só depois do 2 funcionar, senão você se tranca para fora do painel. O
passo 7 só depois de republicar `vuumbora-admin` e `vuumbora-frontend` com o
`nginx.conf` novo (HSTS e cabeçalhos do site entraram em 21/11/2026). O passo 9
(textos legais, CPU e e-mail) vale **antes de divulgar o cadastro dos apps**, e o
10 (builds dos apps) na hora do primeiro build.

> **ATENÇÃO — não republique `vuumbora-admin` a partir do `main` antes de a API
> do S1 estar no ar.** O painel do `main` (a partir do commit `5273769`) só faz
> login contra a API do S1: ele exige `status: "authenticated"` na resposta, e a
> API antiga não manda esse campo. Com a API antiga e a senha certa, o login
> **não conclui** (a tela fica sem passo válido), e as telas de segurança e de
> e-mail dão 404. Achado de 21/11/2026, depois de um redeploy do painel com a
> API ainda antiga. Saídas: (a) publicar a API do S1 **e** as migrações
> 0010–0023 juntas e só então o painel (a ordem completa está em
> `docs/publicar-o-backend.md`, seção 3, "Ordem do primeiro deploy do S1"); ou (b)
> reverter o painel para a branch `producao-admin-estavel` (commit `f79b0fe`, o
> Admin v0 que combina com a API de produção; roteiro logo abaixo). **Não** use
> o `da9db50`: ele traz os botões de aprovar e recusar, e essas rotas não
> existem na API de produção (404). Esta restrição é do painel: o `nginx.conf`
> do site é estático e não depende da API.
>
> Atualizado em 22/11/2026: o painel do `main` de hoje (a partir do commit `77a6315`) também tem a tela "Usuários"
> (criar, desativar, reativar e trocar papel de outro administrador) — ela só funciona com a migração **0023** já
> aplicada. Sem ela, a tela carrega mas toda ação dá erro do banco. Como a API aplica as migrações sozinha no boot
> (seção 2 de `docs/publicar-o-backend.md`), isto resolve-se publicando a API: não há passo manual extra.

### Roteiro de reversão do painel — AÇÃO DO DONO (uns 5 minutos)

1. Easypanel > serviço `vuumbora-admin` > fonte do código (algo como **Source /
   GitHub**) > trocar a branch de `main` para `producao-admin-estavel` > salvar.
2. **Deploy** do serviço e esperar ele ficar saudável (o `/healthz` responde).
3. Conferir: `curl.exe -sI https://admin.vuumbora.com.br` **não** deve mais
   trazer `content-security-policy` (é o painel antigo). Abrir o painel e entrar
   com a senha de sempre (login antigo, sem 2FA).
4. Se o menu for diferente do descrito ou o deploy falhar, não improvise: chame
   o Vulcano com o painel do Easypanel aberto.
5. **Voltar ao painel novo** só depois de a API do S1 estar no ar: trocar a
   branch de volta para `main` e fazer o deploy.

### Compatibilidade entre painel e API (consultar antes de qualquer deploy)

| Painel (commit) | Exige na API | Situação em 22/11/2026 |
|---|---|---|
| `f79b0fe` (Admin v0) | a API de produção de hoje | combina; é a branch `producao-admin-estavel` |
| `da9db50` | aprovar e recusar candidatura, com CSRF (migração 0009) | a produção **não** tem |
| `5273769` até antes de `77a6315` | API do S1 (`40d78cb` em diante) e migrações 0010–0021 | a produção **não** tem |
| `77a6315` em diante (`main` de hoje, `0802e92`) | o mesmo de cima **mais** a migração 0023 (tela "Usuários", só papel `dono`) e a 0022 (exclusão de conta, usada pelos apps, não pelo painel) — ou seja, migrações **0010–0023** | a produção **não** tem |

---

## 1. CI no GitHub: PR vermelho tem de barrar — AÇÃO DO DONO (uma vez)

O repositório já tem `.github/workflows/ci.yml` (check do monorepo, API contra
Postgres e Redis reais, ensaio de backup). Mas um CI vermelho **não barra nada
sozinho**: é a proteção de branch que impede o merge.

1. GitHub > `InnovareCode/VuumBora` > **Settings** > **Branches** > **Add branch
   protection rule** (ou "Rulesets").
2. Branch name pattern: `main`.
3. Marque **Require a pull request before merging** e **Require status checks
   to pass before merging**.
4. No campo de busca dos checks, escolha **`ci-ok`** (só ele; ele já falha se
   qualquer outro job falhar, for cancelado ou pulado). O nome só aparece depois
   do workflow rodar uma vez: abra um PR de teste primeiro.
5. Marque também **Do not allow bypassing the settings**, senão o administrador
   (você) fura a regra sem perceber.

Verificação: abra um PR que quebre de propósito um tipo em `apps/api`. O botão
de merge deve ficar bloqueado, com `ci-ok` em vermelho.

⚠️ O job `api` **falha enquanto `apps/api/package.json` não tiver um script
`test`**. É de propósito: "sem testes" não pode aparecer como "testes verdes".
Quando a Íris entregar os testes, o script passa a rodar sozinho.

⚠️ Se o repositório for privado, o plano gratuito do GitHub **não aplica
proteção de branch**. Se a opção aparecer bloqueada, é isso.

## 2. HTTPS no painel do Easypanel — AÇÃO DO DONO

Detalhe completo na seção 0 de `docs/deploy-easypanel.md`. Resumo:

1. No Registro.br, registro `A` `painel` apontando para o IP do servidor.
2. No Easypanel, nas **configurações do próprio painel** (engrenagem, fora de
   qualquer projeto; algo como "Settings > Panel Domain"), defina
   `painel.vuumbora.com.br` e ative o certificado Let's Encrypt.
3. Espere o DNS propagar (`nslookup painel.vuumbora.com.br`).

Verificação:

```
curl -sI https://painel.vuumbora.com.br        # 200 (ou 3xx para a tela de login), sem erro de certificado
curl -sI http://painel.vuumbora.com.br         # 301/308 com Location: https://...  (redireciona para HTTPS)
```

## 3. Painel inacessível por HTTP e por IP — AÇÃO DO DONO

Depois do passo 2, o painel ainda responde em `http://<IP>:3000`, porque o
Easypanel publica essa porta no servidor. Domínio com HTTPS **não fecha** a
porta antiga; só um firewall fecha. É esse o passo que acaba com a senha
trafegando em texto claro.

1. No painel do **provedor do servidor** (onde você paga a VPS), abra
   **Firewall** (ou "Security Groups"/"Cloud Firewall").
2. Regras de **entrada** permitidas, e só estas:
   - `80/tcp` e `443/tcp`: de qualquer lugar (site, API, painel via Traefik);
   - `22/tcp` (SSH): idealmente só do seu IP;
   - **nada em `3000`, `5432` (Postgres), `6379` (Redis)**.
3. Aplique o firewall ao servidor.

⚠️ **Não use só o `ufw` do servidor.** O Docker publica portas contornando o
`ufw`: a regra "negar 3000" parece ativa e a porta continua aberta. O firewall do
provedor fica **fora** da máquina e vale.

⚠️ Antes de aplicar, confirme que `https://painel.vuumbora.com.br` abre e que você
consegue logar por ele. Se o domínio falhar com a porta 3000 fechada, reabra a
regra para o seu IP e volte ao passo 2.

Verificação (rode de uma rede **de fora**, por exemplo o 4G do celular com
terminal, ou um site como `portchecker.co`):

```
curl -m 8 http://<IP-DO-SERVIDOR>:3000     # tem de dar TIMEOUT / conexão recusada
curl -m 8 http://<IP-DO-SERVIDOR>          # 80 só redireciona: 301/308 para https, nunca mostra o painel
nc -vz -w 5 <IP-DO-SERVIDOR> 5432          # fechada
nc -vz -w 5 <IP-DO-SERVIDOR> 6379          # fechada
```

Camadas extras no Easypanel, se a sua versão tiver (não bloqueiam nada acima):
2FA na conta do painel (algo como "Settings > Profile/Security") e lista de IPs
permitidos para o painel.

## 4. Monitor externo — AÇÃO DO DONO

Monitor **de fora do servidor**: se o servidor cair inteiro, um monitor dentro
dele cai junto e ninguém é avisado.

1. Crie conta gratuita em UptimeRobot ou BetterStack (Better Uptime).
2. Crie monitores HTTPS, intervalo de 5 minutos:

   | Monitor | URL | Esperado |
   |---|---|---|
   | API | `https://api.vuumbora.com.br/healthz` | 200 e palavra-chave `ok` |
   | Site | `https://www.vuumbora.com.br` | 200 |
   | Painel admin | `https://admin.vuumbora.com.br` | 200 |
   | Easypanel | `https://painel.vuumbora.com.br` | 200 ou 3xx |

3. Alerta para e-mail **e** WhatsApp/Telegram, não só e-mail (ninguém lê e-mail
   às 3 da manhã).
4. Ative o monitor de **certificado SSL** (aviso 14 dias antes de vencer), se houver.
5. O monitor do backup (healthchecks.io) está em `docs/backup-e-restauracao.md`, seção 5.

Observação: `/healthz` hoje responde 503 se o banco cair (de propósito), então
o monitor da API também avisa de queda de banco.

Verificação: pause o serviço `vuumbora-backend` por 6 minutos de propósito e
confira que o alerta chegou no seu celular. Monitor que nunca avisou é monitor
não testado. Religue o serviço.

## 5. Criar o administrador de produção — AÇÃO DO DONO

O admin só nasce por script; não existe cadastro pela internet, de propósito.
Antes, confira no `vuumbora-backend` (aba Ambiente) a variável do 2FA:

- `ADMIN_TOTP_ENCRYPTION_KEY`: gere com `openssl rand -base64 32` (no terminal
  do seu computador ou do servidor). **Guarde-a no gerenciador de senhas**; perder
  a chave invalida o 2FA de todos. Sem ela, quem exige 2FA (dono, financeiro)
  recebe erro 503 no login: o sistema recusa entrar sem segundo fator. **Nunca
  troque essa chave sem salvar de novo a senha do SMTP no painel:** a mesma chave
  cifra a senha do e-mail, e com outra chave o envio dos códigos dos apps falha sem
  aviso (passo 9.2).

Depois:

1. Easypanel > `vuumbora-backend` > **Console/Terminal** (abre um shell dentro do contêiner).
2. Rode (o contêiner de produção não tem o `npm run --workspace`, por isso é o `node` direto):

   ```
   node scripts/create-admin.mjs --email=seu-email@dominio.com.br --name="Seu Nome Completo" --role=dono
   ```

   Ele pede a senha **sem mostrar na tela** (mínimo 12 caracteres). Não use
   `--password=` no terminal: ela ficaria no histórico.

   > **Credencial dona (revisão de segurança S1, I-3):** a API roda com um papel de banco restrito
   > (`vuumbora_api`) que **não pode criar administrador**. Este comando precisa da credencial **dona** do banco,
   > na variável `MIGRATION_DATABASE_URL`, presente **só durante este comando** (por exemplo
   > `MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/create-admin.mjs ...`) — não a
   > deixe no ambiente permanente da API. Sem ela o script avisa e tenta com a `DATABASE_URL` (e o banco recusa).
   > Detalhes em `docs/publicar-o-backend.md`, seção "Duas credenciais de banco".
   No fim, o script imprime um **CÓDIGO DE ATIVAÇÃO DO 2FA** (formato `ABCDE-FGHIJ-KLMNO-PQRST`, uso único,
   vale 48 horas, **não aparece de novo**). Copie antes de fechar o console: o painel pede esse código antes de
   mostrar o QR. Perdeu, venceu, ou o script disse que o admin já existia? Emita outro no mesmo console:

   ```
   node scripts/reissue-2fa-enrollment.mjs --email=seu-email@dominio.com.br
   ```
3. Abra `https://admin.vuumbora.com.br`, entre com e-mail e senha, digite o **código de ativação** na tela
   "Ative a verificação em duas etapas" e só então cadastre o app autenticador (Google Authenticator, Authy,
   1Password). **No celular**, não dá para escanear o QR da própria tela: use "Copiar chave", logo abaixo do QR,
   e no app autenticador escolha "Inserir chave de configuração". Guarde os códigos de recuperação que ele
   mostrar, fora do celular.

Verificação: o login completo funciona e uma candidatura de teste aparece na
lista. Depois **apague** a candidatura de teste.

**A partir de agora, os PRÓXIMOS administradores (financeiro, operação, suporte, revisor de documentos) você cria
pelo próprio painel** — Usuários > Novo usuário — sem precisar do terminal de novo. Duas coisas pedem atenção:

- A tela mostra um **token de ativação de uso único** só nesse momento — não aparece de novo. Copie e entregue à
  pessoa por fora do painel (WhatsApp, e-mail, em mãos); ela usa o token para criar a própria senha. Perdeu o prazo
  (7 dias) ou o token: desative o usuário e crie de novo.
- Criar ou promover alguém para `dono`/`financeiro`, ou reativar um `dono` desativado, pede a sua senha **e** o
  código do seu autenticador (TOTP) na mesma tela — as outras ações pedem só a senha.

## 6. Variáveis do backend e do admin — AÇÃO DO DONO

Em `vuumbora-backend`, aba Ambiente (detalhes e o porquê em `docs/publicar-o-backend.md`, seção 3):

| Variável | Valor |
|---|---|
| `ALLOWED_ORIGINS` | `https://www.vuumbora.com.br,https://vuumbora.com.br` |
| `ADMIN_ALLOWED_ORIGINS` | `https://admin.vuumbora.com.br` |
| `ADMIN_TOTP_ENCRYPTION_KEY` | a chave do passo 5 |
| `TRUST_PROXY` | `1` (quantos proxies ficam na frente da API; `true` antigo vale como `1`) |
| `LEGAL_DOCUMENTS_BASE_URL` | endereço-base dos Termos e da Política, sem barra no fim (sugestão: `https://www.vuumbora.com.br/legal`); sem ela o cadastro dos apps responde 503 (passo 9.1) |
| `AUTH_BCRYPT_CONCURRENCY` | `1` ou `2`, pela cota de CPU do serviço (passo 9.3) |
| `AUTH_BCRYPT_QUEUE_MAX` | `8` |

- **Preencha `ADMIN_ALLOWED_ORIGINS` antes de publicar**: a API não sobe sem ela e
  derrubaria junto o formulário do site.
- **`AUTH_TERMS_VERSION` e `AUTH_PRIVACY_VERSION` não existem mais**: a versão
  vigente dos textos mora no banco. Se estiverem no ambiente, apague.
- **Sem barra no final** de nenhuma origem: `https://admin.vuumbora.com.br`, não
  `.../`. O navegador compara o texto exato e a barra faz o CORS recusar tudo.
- **Nunca** ponha o domínio do admin em `ALLOWED_ORIGINS` nem o do site em
  `ADMIN_ALLOWED_ORIGINS`: misturar as duas listas era o furo de CSRF já corrigido.
- No serviço `vuumbora-admin`, `admin.vuumbora.com.br` é o **domínio do serviço**
  (aba Domínios, HTTPS ligado), e o argumento de build `VITE_API_BASE_URL` aponta para a API
  (`https://api.vuumbora.com.br`, já é o padrão do Dockerfile). Lembrete: `painel.` é o Easypanel; `admin.` é o painel do VuumBora.

Verificação (de fora; a API separa as duas listas por rota, então o teste usa as duas origens):

```
# O painel PODE falar com as rotas de admin: tem de voltar access-control-allow-origin e allow-credentials
curl -si -X OPTIONS -H "Origin: https://admin.vuumbora.com.br"   -H "Access-Control-Request-Method: GET" https://api.vuumbora.com.br/v1/admin/me | grep -i access-control

# O site público NÃO pode: não pode voltar nenhum access-control-allow-origin
curl -si -X OPTIONS -H "Origin: https://www.vuumbora.com.br"   -H "Access-Control-Request-Method: GET" https://api.vuumbora.com.br/v1/admin/me | grep -i access-control
```

Depois, o teste que vale: entrar em `https://admin.vuumbora.com.br` e ver a lista
de candidaturas carregar (se o CORS estiver errado, o console do navegador mostra
o bloqueio e a tela fica vazia).

## 7. Cabeçalhos de segurança e HSTS em etapas — AÇÃO DO DONO

Achado M-4 da Órion (`docs/revisao-seguranca-s1-rodada3.md`). O HTTPS termina no
Traefik; o `nginx.conf` do admin e o do site mandam os cabeçalhos, e o Traefik os
repassa. **Só se confere de fora, em produção**: ler o arquivo não prova o que
chega ao navegador.

No PowerShell do Windows, `curl` é apelido de outro comando: use `curl.exe` e
troque `grep -i` por `Select-String`, ou rode tudo no Git Bash.

### 7.1 Conferir os cabeçalhos que de fato chegam (depois de republicar os dois serviços)

```
curl -sI https://admin.vuumbora.com.br | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer|permissions|cache-control"
curl -sI https://www.vuumbora.com.br   | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer|cache-control"
```

O que tem de aparecer:

| Cabeçalho | admin | site |
|---|---|---|
| `strict-transport-security` | `max-age=300` | `max-age=300` |
| `x-content-type-options` | `nosniff` | `nosniff` |
| `x-frame-options` | `DENY` | `DENY` |
| `referrer-policy` | `no-referrer` | `strict-origin-when-cross-origin` |
| `content-security-policy` | presente (`... frame-ancestors 'none'`) | **ausente, de propósito** (ver 7.4) |
| `permissions-policy` | presente | ausente (não foi pedido) |

`strict-transport-security` tem de aparecer **uma vez só** (`... | grep -ic strict-transport`
deve dar `1`). Duas vezes = o Traefik (ou a Cloudflare, se o HSTS dela estiver
ligado) também está mandando: o navegador usa só a primeira cópia, e fica um
valor que ninguém sabe qual é. Deixe um emissor só. Nenhuma linha = a imagem
nova ainda não foi publicada.

Confira também os caminhos onde um `nginx.conf` mal feito **perde** os cabeçalhos
(`add_header` dentro de `location` descarta os do `server`; foi a armadilha
corrigida neste mesmo arquivo):

```
curl -sI https://www.vuumbora.com.br/assets/css/style.css   | grep -iE "^HTTP|strict-transport|x-frame"   # 200 e os 2 cabeçalhos
curl -sI https://www.vuumbora.com.br/nao-existe.js          | grep -iE "^HTTP|strict-transport|x-frame"   # 404 (nunca 200 com HTML) e os 2 cabeçalhos
curl -sI https://admin.vuumbora.com.br/driver-applications  | grep -iE "^HTTP|strict-transport|content-security"  # 200 (rota do React) e os 2 cabeçalhos
curl -sI https://admin.vuumbora.com.br/healthz              | grep -iE "^HTTP|strict-transport"           # 200 e o HSTS
```

Verificação humana: abra o site e o painel num navegador, com o console aberto
(F12): não pode haver erro vermelho de "blocked"/"refused" a mais do que havia
antes da publicação.

### 7.2 Subir o HSTS por etapas

O HSTS faz o navegador **recusar HTTP** no domínio pelo prazo (`max-age`) que ele
recebeu, e **não há como desfazer de fora**: se o certificado vencer ou o HTTPS
quebrar, quem já recebeu o cabeçalho fica sem acesso até o prazo acabar. Por isso
ele nasceu com 5 minutos e sobe aos poucos:

| Etapa | Valor | Quando subir para a próxima |
|---|---|---|
| 1 (já no código) | `max-age=300` (5 min) | passo 7.1 conferido, e uns dias usando site e painel sem erro de certificado |
| 2 | `max-age=604800` (1 semana) | uma semana na etapa 1 sem incidente, e o monitor de certificado do passo 4 ativo |
| 3 | `max-age=31536000` (1 ano) | pelo menos 2 semanas na etapa 2 e um ciclo de renovação do certificado observado |

Para subir: troque o número na linha `add_header Strict-Transport-Security` de
`apps/admin/nginx.conf` **e** de `apps/site/nginx.conf`, abra PR (o CI roda),
republique os dois serviços e repita o 7.1. Cada navegador guarda o prazo **por
domínio**: `admin.` e `www.` são independentes.

Para recuar: publique `max-age=0` (o navegador esquece o HSTS na próxima visita
por HTTPS). Quem ainda não visitou não foi afetado. No **seu** Chrome, se se
trancar por teste: `chrome://net-internals/#hsts` > "Delete domain security
policies".

### 7.3 Por que ainda não tem `includeSubDomains` nem `preload`

- **`includeSubDomains`**: o mesmo `nginx.conf` do site pode responder no domínio
  raiz (`vuumbora.com.br`); ali a diretiva obrigaria **todos** os subdomínios
  (`painel.`, `api.`, `admin.`, `www.` e qualquer outro, como um painel de e-mail
  ou um teste sem certificado) a funcionar só por HTTPS durante o prazo inteiro,
  sem exceção possível. Só ligue depois de listar todos os registros `A`/`CNAME`
  no Registro.br e confirmar que cada um abre com HTTPS válido. No `admin.` ela
  nem teria efeito (não existem subdomínios dele).
- **`preload`**: coloca o domínio numa lista gravada **dentro dos navegadores**;
  exige `includeSubDomains` e 1 ano, e sair da lista leva meses (depende de cada
  versão de navegador). Não é decisão de pré-lançamento.

### 7.4 Pendência: CSP do site (não entrou, de propósito)

O site público ficou só com HSTS, `nosniff`, `Referrer-Policy` e proteção contra
enquadramento: são os que não mudam o que a página carrega. A **CSP não entrou**
porque o `index.html` usa fonte do Google Fonts, chama a API e tem vários
atributos `style="..."` embutidos (as partículas animadas); uma CSP sem
`'unsafe-inline'` para estilo os descartaria **sem erro de build**, e acertar
isso exige medir no navegador com o conteúdo real. Fica como pendência de
Lyra/Íris; quando entrar, leva `frame-ancestors 'none'` junto.

## 8. Limite de requisições por IP na borda (Traefik) — DECISÃO + AÇÃO DO DONO

Achados A-1 e M-1 da Órion. Antes de qualquer clique, o que isto **resolve e o que
não resolve**, sem enfeite:

- **Resolve:** enchente vinda de um IP ou de poucos, barrada **antes** de chegar
  no processo Node da API (hoje o limite da API roda dentro dela, na memória).
- **Não resolve A-1 por inteiro:** o ataque medido pela Órion usa ~70 IPs a
  0,03 requisição por segundo cada, abaixo de qualquer limite por IP razoável. O
  conserto de verdade (semáforo global para o `bcrypt`) é código da API.
- **Não resolve M-1:** adivinhar a senha de **uma** conta com muitos IPs. O
  conserto é código (lista de senhas comuns e detector de muitos IPs
  errando a mesma conta).

Cuidados antes de escolher os números:

- Operadoras de celular dividem **um IP entre centenas de motoristas** (CGNAT).
  Limite apertado por IP bloqueia gente honesta. Por isso o valor abaixo é
  **frouxo de propósito**, mais folgado que o da própria API (100 por minuto por
  IP): este só segura enchente, não adivinhação de senha.
- Com CDN na frente (a Cloudflare serve o site), o IP que o Traefik enxerga é o
  da CDN: sem ajustar, o limite vira um balde único para todo mundo. Na API, se
  a Cloudflare passar a ficar na frente de `api.`, `TRUST_PROXY` muda de `1` para
  `2` (`docs/publicar-o-backend.md`).
- IPv6: quem tem uma faixa `/64` tem 18 quintilhões de endereços; limite "por
  endereço" não vale nada contra ele. Confira se `api.` nem aceita IPv6:

  ```
  nslookup -type=AAAA api.vuumbora.com.br      # sem resposta de endereço = só IPv4, o problema não existe
  ```

  Se existir AAAA, use no Traefik a opção que agrupa IPv6 por faixa
  (`ipStrategy.ipv6Subnet`, nas versões novas do Traefik v3; confirme na
  documentação da **versão que o seu Easypanel usa**).

Ponto de partida (exemplo no formato de configuração dinâmica do Traefik;
**não testado**: esta máquina não tem Traefik e a equipe não acessa o seu
servidor):

```yaml
http:
  middlewares:
    vuumbora-api-limite:
      rateLimit:
        average: 10      # requisições por segundo, por IP, em média
        period: 1s
        burst: 50        # rajada tolerada (abrir o app dispara várias de uma vez)
```

Onde isto entra no Easypanel **eu não consigo afirmar** (o menu muda entre
versões e o Easypanel monta o Traefik por baixo): procure na documentação do
Easypanel da sua versão como anexar um *middleware* do Traefik ao domínio do
serviço `vuumbora-backend` (algo como configuração avançada do domínio ou
arquivos de configuração do Traefik). Alternativa sem mexer no Traefik, se `api.`
já passar pela Cloudflare: regra de **Rate limiting** dela para `api.vuumbora.com.br`.
Se não achar o caminho em meia hora, **não improvise no servidor**: registre aqui
e peça uma sessão à Vulcano com o painel aberto.

Verificação (Git Bash/Linux/Mac). O alvo é o `/healthz` de propósito: a própria
API **não** limita essa rota (`rateLimit: false` em `health-route.ts`), então um
`429` ali só pode ter vindo da borda. **Nunca** teste contra `/v1/auth/login`: o
atraso progressivo da API passaria a punir contas de verdade.

```
seq 1 300 | xargs -P 60 -I{} curl -s -o /dev/null -w "%{http_code}\n" https://api.vuumbora.com.br/healthz | sort | uniq -c
```

Esperado com o limite ativo: a maioria `200` e um bloco de `429`. Só `200`: o
middleware não está valendo (ou o IP visto é o da CDN). Seu IP fica barrado por
alguns segundos; é normal. O monitor externo (passo 4) não é afetado: pede a cada
5 minutos.

## 9. Antes de divulgar o cadastro dos apps — AÇÃO DO DONO

Achados B-7 e B-5 da Órion (`docs/revisao-seguranca-s1-rodada3b.md`). Os comandos completos e o porquê de cada detalhe estão em
`docs/publicar-o-backend.md`, seção 3; aqui vão o roteiro e a verificação. Nada disto foi executado contra o seu servidor: a
equipe não o acessa.

### 9.1 Textos legais: hospedar e publicar a primeira versão dos 4 pares

Sem isto o cadastro dos apps responde **503 `consent_unavailable`**, de propósito (login e o resto seguem). Os 4 pares são
Termos e Política, cada um para passageiro e motorista.

1. `LEGAL_DOCUMENTS_BASE_URL` preenchida (passo 6).
2. Os 4 arquivos hospedados em `<base>/terms/passenger/<versão>`, `<base>/privacy/passenger/<versão>`,
   `<base>/terms/driver/<versão>` e `<base>/privacy/driver/<versão>`. O nome do arquivo é a versão, sem extensão (por exemplo
   `2026-12-01`). No site: pasta `apps/site/public/legal/` e republicar o `vuumbora-frontend`. Os textos e a versão são seus e
   do jurídico.
3. Pegue o hash do que o **endereço devolve** (`curl -s -o arquivo <endereço>` e depois `sha256sum arquivo`) e confira que o
   arquivo começa pelo texto, não por `<!DOCTYPE html>`: o nginx do site responde **200 com a página inicial** para arquivo
   que não existe, então o status não prova nada.
4. No terminal do `vuumbora-backend`, com `MIGRATION_DATABASE_URL` só durante o comando (credencial dona, como no passo 5), um
   comando por documento. Rode antes cada um com `--dry-run` no fim, que não grava nada:

   ```
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=terms   --audience=passenger,driver --version=2026-12-01 --sha256=<hash-dos-termos>
   MIGRATION_DATABASE_URL="postgres://dono:SENHA@host:5432/vuumbora" node scripts/publish-legal.mjs --document=privacy --audience=passenger,driver --version=2026-12-01 --sha256=<hash-da-politica>
   ```

   (É o que `npm run legal:publish` chama.) São 2 comandos para os 4 pares quando o texto é o mesmo nos dois perfis; se forem
   textos diferentes, 4 comandos, um `--audience=` por perfil. A publicação **não se edita nem se apaga**: errou, publica-se a
   versão seguinte.

Verificação, de fora:

```
curl -s "https://api.vuumbora.com.br/v1/legal/current?audience=passenger"
curl -s "https://api.vuumbora.com.br/v1/legal/current?audience=driver"
```

Esperado: `200`, com o `sha256` de cada texto igual ao hash do passo 3. `503 consent_unavailable` = falta a variável ou a
versão publicada daquele perfil.

### 9.2 Chave do 2FA e senha do SMTP

Trocar `ADMIN_TOTP_ENCRYPTION_KEY` quebra o 2FA de todos **e** a senha do SMTP salva no painel: o envio dos códigos de
verificação e de redefinição de senha dos apps passa a falhar sem aviso na tela. Se a chave precisar mudar, o roteiro está em
`docs/publicar-o-backend.md`, seção 3. A regra de bolso: depois de **qualquer** mudança de chave, entre no painel, salve a senha
do SMTP de novo e use **enviar e-mail de teste**.

### 9.3 CPU do serviço e `AUTH_BCRYPT_CONCURRENCY`

Veja a cota de CPU do `vuumbora-backend` (limites de recursos do serviço no Easypanel). Até 2 CPUs: `AUTH_BCRYPT_CONCURRENCY=1`.
3 CPUs ou mais: `2`. `AUTH_BCRYPT_QUEUE_MAX=8` nos dois casos. Depois **meça**: o script de `docs/publicar-o-backend.md`
(seção 3, "CPU do contêiner e a pista do bcrypt") roda no console do contêiner e mostra o tempo do `/healthz` durante 30
logins ao mesmo tempo. Aceite: todos `200` e pior tempo abaixo de ~1 s. Os valores da tabela são ponto de partida; a medida de
verdade é a sua.

### 9.4 Uma conferência no banco: usuário SMTP antigo na trilha

Rode a contagem de `docs/publicar-o-backend.md` (seção 3, "Uma conferência no banco real"). `0` = nada a fazer. Maior que 0:
não apague nada; o texto de lá diz o que fazer (a trilha é imutável de propósito).

## 10. Builds dos apps no EAS: perfis e variáveis — AÇÃO DO DONO (no primeiro build)

`apps/passenger/eas.json` e `apps/driver/eas.json` (criados em 22/11/2026, iguais nos dois apps) têm três perfis. Cada um grava
`VUUMBORA_BUILD_PROFILE` **com o mesmo nome do perfil**, e o `metro.config.js` de cada app decide por essa variável o que entra
no pacote:

| Perfil | Para quê | `VUUMBORA_BUILD_PROFILE` | Telas de desenvolvimento no pacote | Ambiente das variáveis no EAS |
|---|---|---|---|---|
| `development` | cliente de desenvolvimento no aparelho (o Mapbox exige um; não roda no Expo Go) | `development` | dentro | `development` |
| `preview` | teste interno, APK | `preview` | dentro | `preview` |
| `production` | loja, `.aab` | `production` | **fora** | `production` |

- O valor de `VUUMBORA_BUILD_PROFILE` **tem de ser igual ao nome do perfil**. Perfil novo = copie e troque o valor. Um valor
  inválido (por exemplo `prod`) o `metro.config.js` recusa e aborta a build.
- **`EXPO_PUBLIC_*`: lembrete, nunca no git.** Essas variáveis entram **dentro do pacote** (qualquer pessoa lê), então só
  valor público. Hoje: `EXPO_PUBLIC_MAPBOX_TOKEN` (nos dois apps; token público `pk.`, nunca o secreto `sk.`) e
  `EXPO_PUBLIC_API_URL` (endereço da API; hoje só aparece em comentário, a fatia B4 a liga). Os valores ficam no **EAS**
  (expo.dev, projeto, variáveis de ambiente, ou `eas env:create`), **um por ambiente** (`development`, `preview`,
  `production`; o `eas.json` liga cada perfil ao ambiente de mesmo nome), para a build de loja nunca herdar o endereço ou o
  token de teste. O `.env` da raiz é só do seu computador e está no `.gitignore`: o EAS não o recebe, então sem a variável no
  EAS a build sai sem token do Mapbox. O valor é gravado na build: mudou, gere outra.
- **A build `production` aborta de propósito enquanto o app tiver identidade simulada** (no passageiro) **ou ainda não tiver
  cliente de identidade para a guarda ler** (no motorista). Não contorne trocando para `preview`: seria entregar à loja um app
  sem login real. A guarda estava na árvore de trabalho (não commitada) quando escrevi; o estado está no `PROGRESSO.md`.

**O que eu validei:** o JSON de cada arquivo; o schema com o validador oficial (`@expo/eas-json` 27.11.0, rodado offline): os 3
perfis resolvem para Android e iOS, nos dois apps; e carregando o `metro.config.js` real de cada app com as variáveis que cada
perfil define: `development` e `preview` mantêm as telas de desenvolvimento, e `production` não gera pacote porque a guarda de
identidade aborta antes, nos dois apps (controle: `prod` também aborta). Ou seja: o `eas.json` está certo, e quem barra a
build de loja hoje é a guarda, não ele.

**O passo a passo das contas (Expo, Google Play) e do primeiro `eas build` está em `docs/build-e-deploy.md`**, seções
"Antes de tudo: as duas contas" e "Primeiro build (desenvolvimento)" — escrito e atualizado em 22/11/2026, depois que o dono
confirmou os identificadores (`com.vuumbora.passenger`/`com.vuumbora.driver`, decisão DN-07 em `docs/decisoes-do-dono.md`) e
decidiu criar as contas Expo e Google Play agora.

**O que eu NÃO validei (ainda não há conta Expo):** nenhum `eas build` de verdade; que os ambientes `development`, `preview` e
`production` existem no seu projeto Expo (confira ao criar o projeto); que o EAS exporta `EAS_BUILD_PROFILE` com o nome do
perfil (está na documentação da Expo, não foi testado; o `metro.config.js` usa como segunda rede); e a versão do EAS CLI da sua
máquina, que pode ser outra e recusar um campo (nesse caso não improvise, chame o Vulcano). Pendências que dependem de você ou
de outra pessoa da equipe: `expo-dev-client` não está nas dependências dos apps e o perfil `development` pede cliente de
desenvolvimento (o EAS CLI vai avisar ou pedir para instalar; não mexi em `package.json`); o `projectId` do EAS entra em
`extra.eas.projectId` do `app.config.ts`, provavelmente à mão (o `eas init` não edita configuração em TypeScript; não testado);
identificadores de loja definitivos e contas, em `docs/build-e-deploy.md`.

---

## 11. Verificação pós-deploy — rode a qualquer momento, sem risco

Script novo, só leitura e sem credencial nenhuma: `tools/producao/verificar-pos-deploy.mjs`. Ele faz as mesmas
requisições que um navegador faria contra os endereços públicos (`/healthz`, `/v1/legal/current`, a home do painel
admin e do site) e confere os cabeçalhos de segurança — nunca mexe no banco, nunca pede senha. Rode depois de
qualquer deploy, ou sempre que quiser conferir se tudo continua no ar:

```
node tools/producao/verificar-pos-deploy.mjs
```

Precisa só de Node instalado (o mesmo que já usa para o projeto) — não precisa estar na pasta do projeto nem ter o
`.env`. A saída é uma lista com `OK`, `AVISO` ou `FALHA` em cada linha, e um resumo no final. **Qualquer `FALHA` quer
dizer que algo que deveria funcionar não está funcionando** — não avise ninguém do lançamento até a lista só ter `OK`
e, no máximo, `AVISO` esperados (por exemplo, textos legais ainda não publicados, passo 9.1). Exemplo de leitura:

```
[✔] OK    /healthz respondeu 200 com status "ok".
[!] AVISO /v1/legal/current?audience=passenger respondeu 503 (consent_unavailable) — ...
[✘] FALHA strict-transport-security aparece MAIS DE UMA VEZ ...
```

Se quiser testar contra outro endereço (por exemplo antes do domínio definitivo), três variáveis de ambiente
opcionais mudam o alvo — o comentário no topo do próprio arquivo explica (`VUUMBORA_API_BASE`, `VUUMBORA_ADMIN_BASE`,
`VUUMBORA_SITE_BASE`).

## Checklist final

- [ ] `ci-ok` obrigatório na proteção da `main`; PR de teste quebrado foi bloqueado
- [ ] `https://painel.vuumbora.com.br` com cadeado; http redireciona
- [ ] `http://<IP>:3000`, 5432 e 6379 fechados vistos de fora
- [ ] Monitores criados; alerta de teste chegou no celular
- [ ] Admin de produção criado; login com 2FA funcionou
- [ ] `ADMIN_ALLOWED_ORIGINS` e `ADMIN_TOTP_ENCRYPTION_KEY` preenchidas, sem barra final
- [ ] `REQUIRE_SECRETS=true` no `vuumbora-backend`
- [ ] **Trocar os três segredos antes de abrir o cadastro** (`AUTH_PEPPER`, `AUTH_JWT_SECRET`,
      `ADMIN_TOTP_ENCRYPTION_KEY`). Os da primeira publicação, em 22/11/2026, foram gerados na conversa com a equipe
      porque o dono estava no celular, e ficaram no histórico. Gere os novos com
      `tools/producao/gerar-segredos.ps1` no computador. Enquanto o banco só tiver dados de teste, trocar não custa
      nada. Depois que houver usuários reais: trocar `AUTH_JWT_SECRET` desloga todo mundo (as sessões são assinadas
      com ele) e trocar a chave do TOTP invalida o 2FA e a senha do SMTP salva. **Trocar o `AUTH_PEPPER` NÃO invalida
      senha** (o hash da senha é bcrypt puro, sem pepper — confira em `apps/api/src/services/identity-service.ts`):
      o que ele invalida é o código de e-mail PENDENTE (quem estiver no meio da verificação de cadastro ou da
      redefinição de senha precisa pedir um código novo) e a correlação dos hashes de IP já gravados na trilha de
      acesso com os de depois da troca (perde histórico de correlação, não é falha de segurança).
- [ ] API no papel restrito `vuumbora_api` (antes de abrir o cadastro): `node scripts/ativar-papel-api.mjs`
      (credencial dona) seguido de `DATABASE_URL="<a URL impressa>" node scripts/conferir-papel-api.mjs` só mostra
      `OK` — `current_user` é `vuumbora_api`, `DELETE` em `admin_users`, `UPDATE` em `admin_audit_log` e qualquer DDL
      continuam recusados. (Desde a migração 0023 o papel PODE `INSERT`/`UPDATE` em `admin_users`, de propósito, para
      a gestão de usuários do painel — isso não é mais sinal de falha.) `RUN_MIGRATIONS_ON_BOOT` está desligado
- [ ] Backup ativado e **restaurado de verdade uma vez** (`docs/backup-e-restauracao.md`)
- [ ] `BACKUP_PASSPHRASE` e `ADMIN_TOTP_ENCRYPTION_KEY` guardadas fora do Easypanel
- [ ] Cabeçalhos conferidos com `curl -sI` em admin e site; `strict-transport-security` aparece **uma vez** (passo 7.1)
- [ ] HSTS subindo por etapas (300 s → 1 semana → 1 ano), sem `includeSubDomains`/`preload` por enquanto (passo 7.2)
- [ ] Limite por IP na borda decidido e testado, ou a pendência A-1/M-1 registrada como aberta (passo 8)
- [ ] `LEGAL_DOCUMENTS_BASE_URL` preenchida, 4 pares publicados, e `GET /v1/legal/current` devolve 200 nos dois perfis com o `sha256` do arquivo (passo 9.1)
- [ ] `AUTH_TERMS_VERSION` e `AUTH_PRIVACY_VERSION` removidas do ambiente da API
- [ ] E-mail de teste do painel feito depois de qualquer mudança de `ADMIN_TOTP_ENCRYPTION_KEY` (passo 9.2)
- [ ] `AUTH_BCRYPT_CONCURRENCY` definida pela cota de CPU e `/healthz` medido sob rajada (passo 9.3)
- [ ] Contagem de linhas antigas com usuário SMTP na trilha: 0, ou aceite registrado (passo 9.4)
- [ ] API no ar com as migrações **0010 a 0023** (painel de hoje, a partir de `77a6315`, exige a 0023 para a tela de Usuários)
- [ ] `node tools/producao/verificar-pos-deploy.mjs` rodado depois do deploy: só `OK` e avisos esperados, nenhuma `FALHA` (passo 11)
- [ ] `EXPO_PUBLIC_*` só no EAS, um ambiente por perfil, nada no git (passo 10)
- [ ] Conta Expo e conta de desenvolvedor Google Play criadas (`docs/build-e-deploy.md`); `expo-dev-client` instalado pela equipe antes do primeiro `eas build --profile development`
