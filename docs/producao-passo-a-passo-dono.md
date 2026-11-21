# Produção: o que falta e é seu — passo a passo

Escrito em 21/11/2026 (Vulcano). Tudo marcado **AÇÃO DO DONO** exige o painel do
Easypanel, o GitHub ou o provedor do servidor, onde a equipe não tem acesso.
Os nomes de menu do Easypanel mudam entre versões: onde eu não tinha como
confirmar o nome exato, escrevi "algo como". O que vale é o **teste de
verificação** de cada passo, que não depende do nome do menu.

Ordem recomendada: 1 → 2 → 3 → 4 → 5 → 6. O passo 2 (fechar o acesso por IP)
só depois do 1 funcionar, senão você se tranca para fora do painel.

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
