# Produção: o que falta e é seu — passo a passo

Escrito em 21/11/2026 (Vulcano). Tudo marcado **AÇÃO DO DONO** exige o painel do
Easypanel, o GitHub ou o provedor do servidor, onde a equipe não tem acesso.
Os nomes de menu do Easypanel mudam entre versões: onde eu não tinha como
confirmar o nome exato, escrevi "algo como". O que vale é o **teste de
verificação** de cada passo, que não depende do nome do menu.

Ordem recomendada: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. O passo 3 (fechar o acesso
por IP) só depois do 2 funcionar, senão você se tranca para fora do painel. O
passo 7 só depois de republicar `vuumbora-admin` e `vuumbora-frontend` com o
`nginx.conf` novo (HSTS e cabeçalhos do site entraram em 21/11/2026).

> **ATENÇÃO — não republique `vuumbora-admin` a partir do `main` antes de a API
> do S1 estar no ar.** O painel do `main` (a partir do commit `5273769`) só faz
> login contra a API do S1: ele exige `status: "authenticated"` na resposta, e a
> API antiga não manda esse campo. Com a API antiga e a senha certa, o login
> **não conclui** (a tela fica sem passo válido), e as telas de segurança e de
> e-mail dão 404. Achado de 21/11/2026, depois de um redeploy do painel com a
> API ainda antiga. Saídas: (a) publicar a API do S1 **e** as migrações
> 0010–0020 juntas (`docs/publicar-o-backend.md`) e só então o painel; ou (b)
> reverter o painel para o commit `da9db50`, o último antes do S1. Esta
> restrição é do painel: o `nginx.conf` do site é estático e não depende da API.

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
  recebe erro 503 no login: o sistema recusa entrar sem segundo fator.

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
3. Abra `https://admin.vuumbora.com.br`, entre e faça o cadastro do app
   autenticador (Google Authenticator, Authy, 1Password) quando o painel pedir.
   Guarde os códigos de recuperação que ele mostrar.

Verificação: o login completo funciona e uma candidatura de teste aparece na
lista. Depois **apague** a candidatura de teste.

## 6. Variáveis do backend e do admin — AÇÃO DO DONO

Em `vuumbora-backend`, aba Ambiente (detalhes e o porquê em `docs/publicar-o-backend.md`, seção 3):

| Variável | Valor |
|---|---|
| `ALLOWED_ORIGINS` | `https://www.vuumbora.com.br,https://vuumbora.com.br` |
| `ADMIN_ALLOWED_ORIGINS` | `https://admin.vuumbora.com.br` |
| `ADMIN_TOTP_ENCRYPTION_KEY` | a chave do passo 5 |
| `TRUST_PROXY` | `1` (quantos proxies ficam na frente da API; `true` antigo vale como `1`) |

- **Preencha `ADMIN_ALLOWED_ORIGINS` antes de publicar**: a API não sobe sem ela e
  derrubaria junto o formulário do site.
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

---

## Checklist final

- [ ] `ci-ok` obrigatório na proteção da `main`; PR de teste quebrado foi bloqueado
- [ ] `https://painel.vuumbora.com.br` com cadeado; http redireciona
- [ ] `http://<IP>:3000`, 5432 e 6379 fechados vistos de fora
- [ ] Monitores criados; alerta de teste chegou no celular
- [ ] Admin de produção criado; login com 2FA funcionou
- [ ] `ADMIN_ALLOWED_ORIGINS` e `ADMIN_TOTP_ENCRYPTION_KEY` preenchidas, sem barra final
- [ ] Backup ativado e **restaurado de verdade uma vez** (`docs/backup-e-restauracao.md`)
- [ ] `BACKUP_PASSPHRASE` e `ADMIN_TOTP_ENCRYPTION_KEY` guardadas fora do Easypanel
- [ ] Cabeçalhos conferidos com `curl -sI` em admin e site; `strict-transport-security` aparece **uma vez** (passo 7.1)
- [ ] HSTS subindo por etapas (300 s → 1 semana → 1 ano), sem `includeSubDomains`/`preload` por enquanto (passo 7.2)
- [ ] Limite por IP na borda decidido e testado, ou a pendência A-1/M-1 registrada como aberta (passo 8)
