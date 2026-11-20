# Publicar o site no Easypanel — passo a passo

Este guia é para o dono seguir no painel do Easypanel, sem conhecimento
prévio da ferramenta. A primeira seção é **prioridade antes de qualquer
outra coisa** — faça ela primeiro, antes de publicar o site. DNS do site
(diferente do DNS do painel) fica numa seção própria, mais abaixo.

---

## 0. PRIMEIRO: proteger o próprio painel com HTTPS

Hoje o painel é acessado por `http://` direto no endereço IP do servidor —
o navegador mostra "Não seguro". Isso importa porque **é o painel que
controla o servidor inteiro** (este site, o banco de dados, o Redis, tudo).
Sem certificado, a **senha de login do painel viaja em texto claro na
rede** — qualquer um na mesma rede (um Wi-Fi público, por exemplo)
conseguiria capturá-la. Resolva isto antes de seguir para a publicação do
site.

1. **Criar um registro de DNS para o próprio painel**, no Registro.br (onde
   o domínio `vuumbora.com.br` está registrado):
   - **Tipo:** `A`
   - **Nome/Host:** `painel` (sugestão — resultado:
     `painel.vuumbora.com.br`)
   - **Valor:** o mesmo **endereço IP do servidor** que você usa hoje para
     acessar o painel.
   - **TTL:** padrão sugerido pelo Registro.br.
2. **Configurar esse domínio dentro do Easypanel**, mas atenção: isso é uma
   configuração **do painel em si**, não de um serviço/projeto. Procure nas
   **Configurações gerais do Easypanel** (ícone de engrenagem, geralmente
   fora de qualquer projeto — algo como "Settings" → "Domínio do Painel" /
   "Panel Domain" ou "Dashboard Domain"). Digite `painel.vuumbora.com.br` e
   salve.
3. O Easypanel deve oferecer (como oferece para os domínios de serviço) a
   emissão automática de certificado **Let's Encrypt** para esse domínio do
   painel. Ative essa opção se ela aparecer separada do campo de domínio.
4. **Esperar o DNS propagar antes de esperar o certificado funcionar** —
   mesma lógica da seção de DNS do site, mais abaixo: confira com
   `nslookup painel.vuumbora.com.br` ou em
   [dnschecker.org](https://dnschecker.org) até o IP aparecer certo. Só
   depois disso o Let's Encrypt consegue validar e emitir o certificado (ele
   testa o domínio pela internet, não vale só "já deu salvar no painel").
5. **Confirmar que funcionou:**
   - Acesse `https://painel.vuumbora.com.br` e confira o cadeado de HTTPS no
     navegador (sem aviso de "não seguro").
   - A partir daí, use **esse endereço** como o caminho normal de acessar o
     painel no dia a dia — pare de usar `http://<IP>` por hábito. O acesso
     por IP pode continuar tecnicamente disponível, mas não deve ser mais a
     rotina.
6. **Camadas extras, se esta versão do Easypanel oferecer** (vale a pena
   checar, mas não são bloqueio para o resto deste guia):
   - **Restrição de acesso por IP de origem** — normalmente em
     "Configurações" → algo como "Segurança"/"Firewall"/"Allowed IPs" — só
     libera o login do painel para os IPs que você escolher (ex.: sua casa/
     escritório). Útil se seu IP de internet for fixo ou pouco variável.
   - **Verificação em duas etapas (2FA)** na conta de usuário do painel
     (normalmente em "Configurações" → "Minha Conta"/"Segurança"). Se
     existir, ative — é a defesa mais simples contra senha vazada/capturada.

Com isso resolvido, siga para a publicação do site.

---

## 1. O que já existe no painel

Um projeto chamado `vuumbora` com quatro serviços já criados —
`vuumbora-backend`, `vuumbora-banco`, `vuumbora-frontend` e
`vuumbora-redis`. É o serviço **`vuumbora-frontend`** que vai receber o
site. Os outros três (`backend`, `banco`, `redis`) ficam reservados para
quando o backend da Fase 5 existir — ver "Serviços reservados para depois",
no fim deste documento. Não precisa (e não deve) tocar neles agora.

## 2. Repositório, branch e domínio do site (resumo)

- Repositório: `https://github.com/InnovareCode/VuumBora`
- Branch: `main`
- Domínio do site: `www.vuumbora.com.br` (diferente do domínio do painel,
  configurado na seção 0)
- O build precisa rodar a partir da **raiz do repositório** (é um monorepo
  com `npm workspaces`), não só da pasta `apps/site`. Isso aparece nos passos
  abaixo como "caminho de build" / contexto.

## 3. Configurar a Fonte do serviço `vuumbora-frontend`

1. No painel, abra o projeto `vuumbora` e clique no serviço
   `vuumbora-frontend` (ele já existe — não crie um novo serviço).
2. Vá na aba **Fonte**.
3. Escolha a opção **Github** (não "Upload", "Git" genérico, "Imagem Docker"
   nem "Dockerfile" direto — essas duas últimas ficam como plano B na seção
   4). Motivo de usar o Github: a cada `git push` na branch `main`, o
   Easypanel rebuilda e republica o site sozinho, sem ninguém subir arquivo
   manualmente nem rodar comando no servidor.
4. Se for a primeira vez conectando: o painel vai pedir para autorizar o
   **Easypanel na sua conta GitHub** — aparece como um botão do tipo
   "Conectar GitHub"/"Connect GitHub Account" na própria aba Fonte, que abre
   uma tela do GitHub (fora do Easypanel). Autorize o acesso **só ao
   repositório** `InnovareCode/VuumBora` (o GitHub deixa escolher "apenas
   repositórios selecionados" em vez de "todos os repositórios" — prefira
   essa opção).
   - Não tenho como confirmar, de onde estou, se `InnovareCode/VuumBora` é
     público ou privado — não importa muito para este passo: **nos dois
     casos** o caminho recomendado (Github com redeploy automático a cada
     push) passa por essa mesma autorização, porque é ela que dá ao
     Easypanel permissão para ser avisado de novos pushes (webhook), não só
     para ler o código. Se o repositório for privado, essa autorização é
     obrigatória antes mesmo de ele aparecer na lista para selecionar. Se for
     público, alguns painéis oferecem também um campo mais simples ("URL
     pública do repositório", sem passar pela lista autorizada) — se o seu
     Easypanel mostrar essa opção, ela funciona, mas em geral **não**
     redeploya automaticamente a cada push; prefira a autorização completa
     se quiser o redeploy automático.
5. Depois de conectado, selecione:
   - **Repositório:** `InnovareCode/VuumBora`
   - **Branch:** `main`

## 4. Configurar o Build

Esta é a parte mais sensível porque o repositório é um monorepo: o painel
precisa saber que o site mora em `apps/site`, mas o comando de build precisa
"ver" a raiz do repositório (onde estão os outros workspaces usados pelo
site). **Importante antes de escolher:** o `package.json` da raiz do
repositório **não tem** um script `build` (só tem `passenger`, `driver`,
`typecheck`, `check:boundaries`, `check`) — de propósito não acrescentei um
script genérico `build` ali, porque num monorepo que também tem dois apps
Expo (`passenger`/`driver`), um `build` na raiz confundiria qualquer pessoa
lendo o `package.json` depois ("build de quê?"). Isso quer dizer que **se o
Easypanel tentar rodar `npm run build` sozinho, direto na raiz, sem você
configurar nada, vai falhar na hora** com erro de "script não encontrado" —
não é bug, é esperado, e as duas opções abaixo resolvem isso.

Use a aba **Build** (pode aparecer junto da aba Fonte). Os nomes exatos dos
campos podem variar um pouco de versão para versão do Easypanel, mas o
sentido é este:

### Caminho A — recomendado desde já: Build por Dockerfile

Já deixei pronto um `Dockerfile` em `apps/site/Dockerfile` que resolve o
problema do monorepo (instala e builda a partir da raiz, mas gera uma imagem
final leve, só com os arquivos estáticos servidos por Nginx — sem Node
rodando em produção, e sem depender de nenhum script `build` da raiz). Use-o
assim, **mesmo que o painel não tenha reclamado de nada ainda** — é o
caminho a escolher desde o início, não só depois de um erro:

1. **Método de build:** escolha **Dockerfile** (não Nixpacks/Buildpacks/
   detecção automática).
2. **Caminho do Dockerfile:** `apps/site/Dockerfile`
3. **Caminho de build / contexto:** deixe como a **raiz do repositório**
   (`/`, que é exatamente o que você já preencheu na aba Fonte — não mude
   isso para `apps/site`, senão o build não acha os outros arquivos que ele
   precisa).
4. **Porta do contêiner:** `80` — é a porta que o Nginx, dentro da imagem
   que o Dockerfile gera, usa para servir o site (ver `apps/site/nginx.conf`
   e `EXPOSE 80` no `Dockerfile`). Não precisa expor outra porta.

Com o método Dockerfile, você **não digita** comando de build nem diretório
de saída em lugar nenhum do painel — tudo isso já está escrito dentro do
`Dockerfile` (`RUN npm run build --workspace @vuumbora/site`, que roda o
script `build` de dentro do workspace `apps/site`, não da raiz — por isso
não precisava de um `build` na raiz).

### Caminho B — se o método "Dockerfile" não aparecer, ou se preferir configurar manualmente

Se a tela só oferecer um método de detecção automática (Nixpacks/Buildpacks)
com campos de comando editáveis (geralmente chamados "Comando de Instalação"/
"Install Command", "Comando de Build"/"Build Command" e "Diretório de
Publicação"/"Output Directory"/"Publish Directory"), preencha exatamente
assim:

- **Comando de instalação:** `npm ci`
- **Comando de build:** `npm run build --workspace @vuumbora/site`
- **Diretório de publicação/saída:** `apps/site/out`

Esses três campos, preenchidos assim (comando de build rodando a partir da
raiz, mas visando o workspace do site), reproduzem o que o `Dockerfile` faz
— sem precisar de nenhum script `build` no `package.json` da raiz, porque
`--workspace @vuumbora/site` já aponta pro script `build` de dentro de
`apps/site/package.json`.

Se a tela **não tiver** esses três campos editáveis (detecção 100%
automática, sem nada para preencher) e insistir em rodar um `npm run build`
genérico na raiz, ela vai falhar — nesse caso não há o que ajustar manualmente
nela: troque o método de build para **Dockerfile** e siga o Caminho A.

### Por que não usei "Imagem Docker" nem "Upload"

- **Imagem Docker** exigiria publicar a imagem em algum registro (Docker
  Hub, GHCR etc.) manualmente antes — mais um passo manual a cada mudança.
- **Upload** não acompanha o `git push` — alguém teria que lembrar de subir
  um arquivo a cada atualização do site. Isso é exatamente o tipo de "passo
  manual que só alguém sabe" que queremos evitar.

## 5. Variáveis de ambiente

**O site institucional não precisa de nenhuma variável de ambiente hoje.**
Ele é totalmente estático (sem chamadas a API, sem mapa) — não há nada para
configurar na aba **Variáveis de Ambiente** / **Environment** deste serviço.

Duas coisas importantes mesmo assim:

- O token do Mapbox (`EXPO_PUBLIC_MAPBOX_TOKEN`, no `.env` da raiz do
  monorepo) é usado pelos **apps** (`passenger`/`driver`), não pelo site. Não
  precisa — e não deve — ir para este serviço.
- **Regra geral, vale para sempre:** o arquivo `.env` nunca é commitado (está
  no `.gitignore`) e, por isso mesmo, nunca chega ao servidor através do
  repositório. Se um dia o site precisar de uma variável de ambiente (uma
  chave de API, por exemplo), ela entra digitada direto na aba **Variáveis de
  Ambiente** do serviço no painel — nunca num arquivo commitado.

## 6. Domínio e certificado HTTPS do site

1. No serviço `vuumbora-frontend`, vá na aba **Domínios** (Domains).
2. Adicione o domínio: `www.vuumbora.com.br`
3. Ative a opção de certificado automático (geralmente aparece como "Gerar
   certificado SSL automaticamente" ou "Let's Encrypt"). O Easypanel emite e
   renova o certificado sozinho — não precisa comprar nem subir certificado
   manual.
4. **Importante:** o certificado automático só funciona depois que o DNS
   (seção 7, abaixo) já estiver apontando para o servidor. Se você adicionar
   o domínio aqui antes do DNS propagar, a emissão do certificado vai falhar
   — tudo bem, é só voltar nesta aba e tentar de novo (ou o próprio painel
   tenta de novo automaticamente) depois que o DNS propagar.

## 7. DNS do site — o que criar no Registro.br

Esta parte é feita **no painel do Registro.br** (onde o domínio
`vuumbora.com.br` está registrado), não no Easypanel. É um registro
diferente do que você criou na seção 0 para o painel (aquele foi `painel`;
este é `www`).

1. Entre no [Registro.br](https://registro.br), na área do domínio
   `vuumbora.com.br` → **DNS** (ou "Editar Zona"/"Gerenciar DNS").
2. Crie um registro:
   - **Tipo:** `A`
   - **Nome/Host:** `www`
   - **Valor:** o **endereço IP do servidor** onde o Easypanel está rodando
     (o mesmo IP das seções anteriores).
   - **TTL:** pode deixar o valor padrão sugerido pelo Registro.br.
3. (Opcional, mas recomendado) Se quiser que quem digitar `vuumbora.com.br`
   (sem o `www`) também chegue no site, crie um segundo registro `A` com
   **Nome/Host** `@` apontando para o mesmo IP, e configure no Easypanel um
   redirecionamento de `vuumbora.com.br` para `www.vuumbora.com.br` na aba
   Domínios. Isso não é obrigatório — o domínio oficial do projeto já é
   `www.vuumbora.com.br`.

### Quanto tempo leva para propagar

Na maioria dos casos o registro no Registro.br propaga em **minutos a poucas
horas**. Em casos raros (TTL antigo em cache de algum provedor de internet)
pode levar até 24-48h. Não é preciso esperar o prazo máximo "por garantia" —
é só conferir (próximo item).

### Como conferir se já propagou

- Rodar, em qualquer terminal: `nslookup www.vuumbora.com.br` (Windows/Mac/
  Linux) — se devolver o IP do servidor, propagou.
- Ou usar um site de checagem pública, por exemplo
  [dnschecker.org](https://dnschecker.org), digitando
  `www.vuumbora.com.br` — ele mostra a propagação em vários locais do mundo
  ao mesmo tempo, o que ajuda a ver se já é unânime ou ainda está parcial.
- Só depois de ver o IP certo (pelo menos na maioria dos locais) é que vale
  tentar emitir o certificado HTTPS no Easypanel (seção 6).

## 8. Depois de publicar

- Abra `https://www.vuumbora.com.br` no navegador e confirme que a página
  carrega com o cadeado de HTTPS (sem aviso de "não seguro").
- Teste uma rota inexistente (ex. `https://www.vuumbora.com.br/pagina-que-nao-existe`)
  para confirmar que aparece uma página de erro 404 normal, não uma tela em
  branco.

## 9. Publicar o painel administrativo (serviço `vuumbora-admin`)

Esta seção cobre o serviço `vuumbora-admin` (React + Vite), que o dono já
criou no painel do Easypanel. Mesmo esqueleto do site (Dockerfile, contexto
na raiz), com duas diferenças que importam: o admin **tem** um estágio de
compilação de verdade (TypeScript + Vite), e a URL da API entra em **tempo
de build**, não em tempo de execução — ver a seção de Argumentos de Build,
abaixo, antes de clicar em qualquer coisa.

### Fonte

- Repositório: `InnovareCode/VuumBora`, branch `main` (mesma autorização do
  Github já usada pelo `vuumbora-frontend` e pelo `vuumbora-backend` —
  não precisa reconectar).

### Build

- **Método de build:** Dockerfile (não Nixpacks/detecção automática — o
  motivo é o mesmo do site: monorepo com `npm workspaces`, sem script
  `build` genérico na raiz).
- **Caminho do Dockerfile:** `apps/admin/Dockerfile`
- **Caminho de build / contexto:** a raiz do repositório (`/`) — **não**
  `apps/admin`. O build precisa alcançar `tsconfig.base.json` e
  `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json`, que ficam fora
  da pasta do admin.

### Argumentos de build (⚠️ a armadilha nº 1 deste serviço)

`VITE_API_MODE` e `VITE_API_BASE_URL` são **Argumentos de Build**
("Build Args" — campo separado das Variáveis de Ambiente, geralmente na
mesma aba de Build), **não** Variáveis de Ambiente de execução. O motivo é
técnico e não tem como contornar: o Vite grava o valor dessas variáveis
dentro do JavaScript já compilado, no momento do `vite build`. Preencher
uma Variável de Ambiente comum no serviço depois de publicado **não muda
nada** — é preciso um novo build, com um novo Argumento de Build, e um novo
deploy.

| Argumento de Build | Valor em produção |
|---|---|
| `VITE_API_MODE` | `http` |
| `VITE_API_BASE_URL` | `https://api.vuumbora.com.br` (endereço do serviço `vuumbora-backend` — ver `docs/publicar-o-backend.md` §4) |

**Na prática, você não precisa preencher nada** (atualizado em 20/11/2026,
depois do primeiro build real): os dois `ARG` do `apps/admin/Dockerfile`
já têm **o valor de produção como padrão**. O que aconteceu no primeiro
deploy foi que o Easypanel passou **só** `--build-arg GIT_SHA=...` — não
entregou estes dois —, `VITE_API_MODE` chegou vazio, e a guarda abortou o
build corretamente, mas por uma causa que estava fora do repositório.
Depender de alguém preencher um campo, num painel, toda vez que o serviço
for recriado, é passo que falha calado meses depois.

Preencher os dois no painel **continua funcionando** e sobrescreve o
padrão — é o caminho para um ambiente que não seja produção (homologação,
por exemplo, apontando para outra API).

Se o build falhar com uma mensagem citando "VITE_API_MODE resolveu para
'mock'", é `apps/admin/vite.config.ts` recusando compilar o painel em modo
demonstração — esperado e correto, não é bug do Dockerfile. Com o padrão de
produção no lugar, isso só acontece se alguém **pedir** modo demonstração
explicitamente.

### Porta e domínio

- **Porta do contêiner:** `80` (Nginx servindo o `dist/` do Vite — ver
  `apps/admin/nginx.conf`).
- **Domínio:** `https://admin.vuumbora.com.br` (decisão do dono, registrada
  em `docs/decisoes-do-dono.md` §7 — **não confundir** com
  `painel.vuumbora.com.br`, que é o painel do próprio Easypanel, passo 0
  deste documento). Mesmo passo a passo de DNS/certificado da seção 6/7,
  trocando `www` por `admin`.

### Depois de publicar: liberar a origem na API

O painel só funciona se a API aceitar chamadas vindas dele. São **duas
listas separadas**, no serviço `vuumbora-backend`:

```
ALLOWED_ORIGINS=https://www.vuumbora.com.br,https://vuumbora.com.br
ADMIN_ALLOWED_ORIGINS=https://admin.vuumbora.com.br
```

⚠️ **Esta instrução mudou em 20/11/2026, e a versão anterior era insegura.**
Até aqui este guia mandava **acrescentar** o domínio do painel à mesma
`ALLOWED_ORIGINS` do site — e foi o que se fez na primeira publicação. O
Órion encontrou o problema ao auditar a primeira rota que muda estado: com as
duas origens na mesma lista e credenciais ligadas para todas as rotas de uma
vez, um XSS no **site público** (a maior superfície de ataque do sistema,
porque tem formulário aberto a qualquer pessoa) conseguiria ler a resposta de
`/v1/admin/me`, roubar o token de CSRF e aprovar ou recusar candidatura em
nome de um administrador.

**Ao atualizar o backend para a versão com as duas listas:**
1. Crie `ADMIN_ALLOWED_ORIGINS` com **apenas** o domínio do painel. Ela é
   **obrigatória** — a API não sobe sem ela, e o site cai junto, porque é a
   mesma API que atende o formulário de candidatura. **Preencha antes de
   publicar.**
2. **Remova** `https://admin.vuumbora.com.br` de `ALLOWED_ORIGINS`. O painel
   não é atendido por aquela lista, e deixar o domínio ali só reabre a
   confusão que causou o problema.

Nunca ponha o domínio do painel na lista pública, nem o do site na lista do
painel.

Sem isso, o navegador bloqueia o próprio painel por CORS — o sintoma parece
"o sistema caiu", não "faltou um domínio numa variável" (mesmo alerta já
registrado em `docs/decisoes-do-dono.md` §7).

**Aconteceu de verdade em 20/11/2026**, no primeiro acesso ao painel
publicado. Mensagem exata no console do navegador, que serve de assinatura
do problema:

```
Access to fetch at 'https://api.vuumbora.com.br/v1/admin/me'
from origin 'https://admin.vuumbora.com.br' has been blocked by CORS
policy: No 'Access-Control-Allow-Origin' header is present
```

⚠️ **Formato, onde a correção certa deixa de funcionar:** `env.ts` separa por
vírgula e **apara espaços**, mas **não normaliza barra no fim**. O navegador
envia a origem sempre **sem** barra, e a comparação é exata — então
`https://admin.vuumbora.com.br/` (com barra) **não casa** e o painel continua
bloqueado, com o mesmo sintoma de antes. Escreva sem barra, com `https://`.

Depois de salvar, **confirme que o serviço reiniciou**: variável de ambiente
só vale no processo novo. Para checar sem depender da tela do painel:

```
curl -i -H "Origin: https://admin.vuumbora.com.br" https://api.vuumbora.com.br/healthz
```

Se vier o cabeçalho `access-control-allow-origin` com o endereço do painel,
está resolvido. Se não vier, a variável não chegou ao processo — é reinício,
não é o valor.

**Por que o cookie de sessão continua funcionando:** `admin.vuumbora.com.br`
e `api.vuumbora.com.br` são subdomínios do mesmo `vuumbora.com.br` — para o
navegador, é cross-**origin** (por isso precisa do CORS com credenciais,
já ligado), mas não é cross-**site**. O cookie `SameSite=Lax` da sessão de
admin continua válido sem mudar nada. Isso deixaria de ser verdade só se o
painel um dia for publicado num domínio totalmente diferente.

### O que eu NÃO consegui provar (sem Docker nesta máquina)

Não há Docker nesta máquina para rodar `docker buildx build` de verdade.
Simulei o pipeline completo fora de contêiner (copiando só os arquivos que
o Dockerfile realmente copia, para um diretório temporário): `npm ci`,
depois `npm run build --workspace @vuumbora/admin` com os dois Argumentos de
Build, gerando `dist/index.html` + `assets/*.js|css` com hash, servidos por
`python -m http.server` com 200 em `/` e no asset com hash — e confirmei que
a URL da API fica de fato gravada dentro do JavaScript gerado. Também
confirmei que **sem** os Argumentos de Build o `vite build` falha com o
erro esperado da guarda. É prova do conteúdo e do pipeline de build, não do
`Dockerfile`/Nginx dentro de um contêiner real — o primeiro build no
Easypanel ainda pode revelar algo que essa simulação não captura.

## Serviços reservados para depois (não é deste deploy)

`vuumbora-banco` e `vuumbora-redis` já existem no painel, criados junto com
o projeto `vuumbora`. Eles **não são usados pelo site institucional** — ficam
reservados para quando a Fase 5 (backend/API) estiver pronta e o Vulcano
configurar o `vuumbora-backend` para falar com eles. O terreno já está
preparado; não é preciso (e não se deve) configurar nada neles agora.

---

## Publicado em 18/11/2026

O site entrou no ar em **https://www.vuumbora.com.br**, servido pelo
Easypanel, com HTTPS funcionando e redirecionamento de HTTP para HTTPS.

Confirmado de fora: resposta 200, certificado válido e a página renderizando
com a identidade correta.

O DNS resolve por Cloudflare (IPs 172.67.x e 104.21.x), ou seja, o domínio
passa por ela antes de chegar ao servidor. Isso traz cache e proteção, e
também significa que **mudanças podem demorar a aparecer** por causa do cache
da Cloudflare: ao publicar algo que não aparece, limpar o cache lá é o
primeiro lugar a olhar, antes de suspeitar do deploy.

**Continua pendente:** o painel do Easypanel segue acessível por HTTP e por
IP, sem certificado — ver seção 0. O dono optou por publicar o site primeiro.
