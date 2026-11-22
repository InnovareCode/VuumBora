# PROGRESSO — VuumBora

Estado do projeto entre sessões. Atualizar ao fim de cada marco.

## S1 (fundação do backend) e fecho do Admin v0 — NO REPOSITÓRIO, NÃO PUBLICADO (21/11/2026)

Tudo abaixo está commitado e enviado para `origin/main`. **A API e as
migrações não foram publicadas**: nenhuma migração rodou em produção e nenhuma
variável nova foi criada no Easypanel. O painel e o site foram republicados em
21/11/2026 (ver "Situação em produção" mais abaixo). As migrações 0010–0020 e o código novo **só podem ir
juntos** (o cadastro dos apps depende da 0019 e do código que envia a data de
nascimento).

**O que entrou**
- **Banco (0010–0020):** contas separadas (passageiro/motorista), credenciais,
  dispositivos, renovação rotativa com revogação de família, códigos de e-mail,
  `access_log`, 2FA do admin, SMTP do painel, trilha de auditoria inviolável,
  papel de banco com privilégio mínimo, idade mínima (18) e registro de aceite.
- **API:** `/v1/auth/*` (cadastro, verificação de e-mail com senha, login,
  renovação, logout, esqueci/redefinir senha) e, no admin, 2FA (TOTP, código de
  ativação, senha atual), configuração de SMTP com step-up. Atraso progressivo
  no login em vez de bloqueio duro. Log sem dado pessoal e sem `err.message`.
- **Painel:** telas do 2FA, tela "E-mail" (só dono), cabeçalhos de segurança
  (CSP etc.) e correção do foco em todos os diálogos.
- **CI e backup:** `.github/workflows/ci.yml` (rodou no GitHub em 21/11/2026:
  os 4 jobs passaram no `ff7af13`), backup cifrado com restauração provada,
  guias de produção e de emergência.

**Provado:** 255/255 testes da API em Postgres 18 recriado do zero (duas
vezes). **Íris, passada final: APROVADO** sobre `ff7af13`
(`docs/veredito-iris-s1-final.md`): banco do zero, 255/255, tela "E-mail" em
Chromium, WebKit e Firefox, CI verde. **Órion, três rodadas, 0 críticos**; a
rodada 3 (`docs/revisao-seguranca-s1-rodada3.md`) deixou 1 alto (A-1, teto de
concorrência do bcrypt), 5 médios e 7 baixos, em correção (A-1, B-1 e M-3 já
delegados; M-1, M-2 e M-5 dependem de decisão do dono).
**Não provado:** SMTP real com TLS; SPF/DKIM; imagem Docker (o `nginx -t` dos
dois `nginx.conf` entrou no CI); leitor de tela; aparelho físico; produção
(papel restrito, proxy, `TRUST_PROXY`).

**Decisões do dono (21/11/2026, em `docs/decisoes-do-dono.md`):** contas
separadas; e-mail verificado obrigatório; recuperação só por e-mail; e-mail
repetido avisa que já existe; SMTP do próprio domínio, configurado no painel;
bloqueio de 15 min do código do 2FA aceito, com procedimento de emergência;
atraso progressivo no login; sem CAPTCHA por enquanto; idade mínima 18 anos;
IP em claro na auditoria do admin. **Apps em React Native para Android e iOS**
(registrado em `docs/decisoes-do-dono.md`; confirma a base Expo que já existe,
e deixa a decisão 17, contas de loja da Apple e do Google, como bloqueio de iPhone real).

**Decisões em aberto (do dono)**
- Textos e versões dos Termos de Uso e da Política de Privacidade (o cadastro
  responde 503 sem `AUTH_TERMS_VERSION`/`AUTH_PRIVACY_VERSION`); documento
  único ou separado para motorista; prazo de guarda do hash do IP de aceite.
- Unicidade do e-mail por tipo de conta (hipótese em uso) e regra de 29/02.
- Taxa da plataforma (cortes exatos), gateway com split, cidade, orçamento e
  prazo: ver `docs/plano-sistema.md` §14.

**Situação em produção (21/11/2026, conferida por curl, só leitura):**
- **Site (`www`)**: `nginx.conf` novo no ar e correto. HSTS (max-age=300) uma
  só vez, nosniff, Referrer-Policy e X-Frame-Options também na home, no CSS e
  no `/healthz`; `.js` inexistente dá 404. A Cloudflare reescreve o `max-age` do
  CSS e do 404 para 14400 (4 h); o `?v=hash` dos links evita CSS velho.
- **Painel (`admin`)**: `nginx.conf` novo no ar (CSP, HSTS uma vez, demais
  cabeçalhos) e é o **código do S1**.
- **API: ainda a antiga** (`GET /v1/auth/me` = 404). **Problema:** o painel do
  S1 não conclui o login contra a API antiga (a resposta não traz `status`).
  **Decisão do Atlas (dono: "você decide"): reverter o painel agora** para a
  branch `producao-admin-estavel` (`f79b0fe`, o Admin v0 que combina com a API de
  produção; o `da9db50` NÃO serve, aprovar e recusar dão 404 na API de hoje) e
  **publicar API e painel juntos, uma vez**, depois das correções A-1, B-1 e M-3
  e da nova checagem. Roteiro e tabela de compatibilidade em
  `docs/producao-passo-a-passo-dono.md`. Não é consequência do nginx: é o painel
  novo contra a API antiga.
- **Correção estrutural do painel (Lyra, 21/11):** o painel agora **falha
  fechado**: resposta de login fora dos três `status` conhecidos nunca autentica
  e mostra "Este painel e a API estão em versões diferentes", sem criar sessão
  (validadores em `apps/admin/src/api/authResponses.ts`). Provado em navegador
  contra servidor falso; conferi por leitura que os campos batem com o código
  da API do S1. **Falta a Íris provar contra a API real do S1 antes de
  publicar.** Backlog: aplicar o mesmo validador a `driverApplications`,
  `emailSettings` e `twoFactor`, que ainda assumem o tipo da resposta.
- Observação menor, **corrigida no `main` (`ca9e6c1`) e válida no próximo deploy
  do painel**: um `.js` inexistente na raiz do painel respondia 200 com HTML
  (fallback de SPA); agora dá 404.

**Pendente para publicar (ordem em `docs/producao-passo-a-passo-dono.md` e
`docs/publicar-o-backend.md`)**
- Variáveis: `AUTH_PEPPER`, `AUTH_JWT_SECRET`, `ADMIN_TOTP_ENCRYPTION_KEY`,
  `TRUST_PROXY=1`, `ADMIN_ALLOWED_ORIGINS`, versões dos documentos; depois
  `REQUIRE_SECRETS=true`.
- Duas credenciais de banco (`MIGRATION_DATABASE_URL` fora do contêiner da API),
  `ativar-papel-api.sql`, migração por tarefa de operador, retenção agendada.
- HTTPS e firewall do painel do Easypanel, bucket e serviço de backup, monitor
  externo, admin de produção (com código de ativação do 2FA).
- Preencher a tela "E-mail" e conferir SPF, DKIM e DMARC do domínio.
- Achados do Órion ainda abertos (rodada 2): I-8 parcial (HSTS no proxy),
  S-3 (usuário SMTP em claro na auditoria) e demais sugestões.
- Apps móveis (quando forem ligados à API): serializar a renovação do token,
  porque duas renovações simultâneas com o mesmo token derrubam a sessão.

## Estado em 22/11/2026 (madrugada)

- **Íris, passada 2: APROVADO** sobre `79f41d8` (`docs/veredito-iris-s1-passada-2.md`): painel que falha fechado contra a API
  real do S1 (Chromium e Firefox), botão do Firefox, A1 nos dois apps e A2 (114/114 e fluxo real). Duas lacunas de teste do
  `SessionManager` (SF4 e SF10) com os testes prontos para incorporar. **Vale só para esse commit**: o `HEAD` andou depois.
- **Órion, rodada 3b** (`docs/revisao-seguranca-s1-rodada3b.md`): **0 críticos, 0 altos, 4 médios, 9 baixos.** API liberada
  para produção **fechada**. Médios: M-1 (pista de bcrypt sufocável por ~17 a ~35 IPv4 ou 1 bloco IPv6), M-2 (o cliente real não
  manda as versões dos Termos: o cadastro real daria 400), M-3 (perfil de build abre telas de dev por omissão e nada barra
  identidade simulada na loja), M-4 (o `SessionManager` apaga a sessão por status HTTP, sem olhar o `code`).
- **No `main`:** A-1 e B-1, API do M-3 com a migração 0021, A1, A2, B1 (identidade do passageiro sobre o cliente mock), painel
  que falha fechado, `nginx.conf` do admin e do site.
- **CI:** o `HEAD` estava vermelho no teste de tempo do pool de bcrypt (2 threads fixas num runner de 2 vCPUs); ajustado em
  `148dc8d` (pool dimensionado como em produção e limite de 250 ms; o defeito que o teste caça mede 606 ms). Não reproduzi a
  falha localmente: diagnóstico plausível, não provado. Um commit meu levou de carona uma remoção staged da Lyra e quebrou o
  `check`; corrigido em `0f6417a`. Regra nova: conferir `git diff --cached` antes de todo commit.
- **Produção:** API **antiga** e painel do S1 incompatível com ela. Reverter o painel para `producao-admin-estavel` (ação do dono,
  roteiro no guia) ou publicar API e painel juntos.
- **Próxima leva:** M-2 e M-4 no `api-client` mais as lacunas SF4 e SF10; M-1, B-1 a B-5 na API; M-3 do perfil de build e B-9 no
  painel; guias de produção e `eas.json`; depois B2 (identidade do motorista) e A3 (armazenamento seguro).

## Apps — estado real e plano (21/11/2026)

**Fonte: [`docs/plano-apps-execucao.md`](docs/plano-apps-execucao.md)** (Nova, com
18 fatias em 5 blocos). O bloco "Estado atual (2026-11-18)" mais abaixo está
**defasado**: o app do passageiro tem cerca de 18 telas de protótipo e o do
motorista é só esqueleto, mas **nenhum app fala com a API** (zero import de
`@vuumbora/api-client`, zero `fetch`): "tela pronta" aqui é desenho navegável.
Decisão do dono: React Native para Android e iOS.
**Em andamento:** A1 (higiene e rotas protegidas, Lyra) e A2 (identidade e
renovação de token em voo único no `api-client`, Vega). **Depois:** A5, telas de
identidade (B1/B2), versões dos Termos (B3). **Do dono:** conta Apple
Developer (empresa pede D-U-N-S), conta Expo, Google Play, textos legais.

## Admin v0 — ENTREGUE E APROVADO (20/11/2026)

Primeira fatia do painel da plataforma (fase **S2** do plano). Commits
`f4aece3` a `f79b0fe`, publicados. **Veredito da Íris: APROVADO**, provado
com API real e papéis reais — não com dado de demonstração.

**No ar em `https://admin.vuumbora.com.br`**, publicado pelo Easypanel a
partir de `apps/admin/Dockerfile` (serviço `vuumbora-admin`). Login no padrão
premium do ModaShop, com a logomarca oficial e a paleta só-escura do VuumBora
(decisão 8 em `docs/decisoes-do-dono.md`).

**O que existe agora:** `apps/admin` (React + Vite + Tailwind v4) com login,
lista e detalhe das candidaturas de motorista vindas do site, busca, filtro e
paginação; e no `apps/api` o login de administrador por cookie httpOnly,
cinco papéis com autorização por rota, teto absoluto de sessão e auditoria de
toda leitura. Migrações `0003`–`0007`.

**Decisões do dono que entraram:** papéis por setor (`dono`, `operacao`,
`revisor_documentos`, `financeiro`, `suporte` — matriz em
`docs/decisoes-do-dono.md`); painel no mesmo servidor, em
**`admin.vuumbora.com.br`**; casca no padrão do painel do ModaShop com a
paleta e a tipografia do VuumBora.

**Só leitura.** Aprovar e recusar candidatura é a fatia seguinte, com motivo
obrigatório, auditoria e token de CSRF.

### Três bugs reais encontrados e corrigidos (causa, não sintoma)
- **Dado pessoal vazando no log:** o pino gravava a query string inteira, e a
  busca é por nome/e-mail/telefone de candidato. Corrigido no nível do
  serviço — nenhuma query futura é segura por padrão. A Íris provou por
  mutação: removeu a correção, viu vazar de novo, recolocou.
- **Paginação perdia linha** quando duas candidaturas tinham `created_at`
  idêntico ao microssegundo (`Date` do JS trunca para milissegundo).
- **Foco escapava das sobreposições:** a gaveta do celular era desenhada
  antes de `header`+`main`, e **quem decide a ordem do Tab é a ordem do
  documento**, não a posição visual. A paleta de comandos tinha o mesmo
  defeito pelo Shift+Tab — só apareceu porque se testou os dois sentidos.

### Pendente antes de abrir documentos e financeiro
- **Infra (Vulcano):** separar a credencial de banco e revogar alteração e
  exclusão em `admin_audit_log` — hoje a trilha é inviolável pelo código, não
  pelo banco; HTTPS no painel do Easypanel; backup externo testado; criar o
  admin de produção; `admin.vuumbora.com.br` em `ALLOWED_ORIGINS`.
- **Segundo fator** de autenticação e **token de CSRF** (este último junto da
  primeira ação que aprova ou recusa alguém).
- Saneamento de `err.message` no log de requisição rejeitada.

## Plano do sistema real — escrito em 20/11/2026

O site de pré-lançamento está no ar e a Fase 1 dele está fechada. O passo
seguinte — **o sistema de verdade** (os dois apps, o painel admin, o backend
transacional e a infra) — foi planejado de ponta a ponta e vive em:

> **[`docs/plano-sistema.md`](docs/plano-sistema.md)** — plano consolidado,
> **fonte de verdade**: escopo MVP × pós-MVP, arquitetura e stack justificada,
> modelo de dados, contratos de API, fases S0 a S9 com critério de aceite,
> matriz de funcionalidades por perfil, riscos, custo e decisões em aberto.

Anexos com o detalhe: [`docs/plano-sistema-arquitetura.md`](docs/plano-sistema-arquitetura.md)
(Nova) e [`docs/plano-sistema-dados.md`](docs/plano-sistema-dados.md) (Cronos).

**O `PLANO.md` continua valendo** para o protótipo navegável (fases 1 a 3) e
roda em paralelo até a fase S4, quando os apps trocam o adaptador `mock` pelo
`http`. Onde os dois falarem do mesmo assunto, vale o `plano-sistema.md`.

**Começo recomendado: S0** (congelar contratos). Nada foi implementado.

**Novidades de produto de 20/11/2026, já incorporadas ao plano:** as cinco
categorias de lançamento (VuumBora, Conforto, Motorista mulher, Entrega, Pet;
moto fora, sem data) e a funcionalidade **motorista favorito** — o passageiro
escolhe um favorito, que recebe oferta exclusiva de 15 s antes de a corrida ir
para a fila normal.

**Pendente no site, pedido pelo dono e ainda não feito:** acrescentar o cartão
de *motorista favorito* na seção de categorias e criar os ícones dos cartões.

## Estado atual (2026-11-18)

**Fase 0 — Fundação: scaffold criado, sem dependências instaladas.**

- Monorepo npm workspaces: `apps/passenger`, `apps/driver`, `packages/{tokens,ui,domain,api-client}`.
- Expo Router nos dois apps (entry `expo-router/entry`, `app/_layout.tsx` + marcador `app/index.tsx`).
- `@vuumbora/tokens` deriva o tema de `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` (fonte única).
- Guarda de arquitetura: `npm run check:boundaries` (HEX solto, import cruzado passageiro/motorista).
- Decisões e ambiguidades de produto: `docs/decisions.md`.

### O que foi provado e o que não foi
- Provado: `check:boundaries` passa no repo e falha numa violação de propósito; `tokens`, `domain` e `api-client` passam no `tsc --noEmit` estrito (TS 5.9); a conversão de tokens roda e devolve os valores do JSON.
- **Não provado** (falta `npm install`): typecheck de `ui` e dos apps; Metro resolvendo o JSON fora dos pacotes; `app.config.ts` importando o JSON; o app subindo em emulador.

## Plano em fases

| # | Fase | Dono | Depende de | Entrega |
|---|---|---|---|---|
| 0 | Fundação: arquitetura + scaffold | Nova | — | Feito (este marco) |
| 1 | Instalação e CI | Vulcano | 0 | SDK confirmado (D-07), `npm install`, `npx expo install --fix`, `expo config` e `expo start` nos dois apps, CI com `npm run check` |
| 2 | Paleta validada | Apolo | — (paralela) | JSON de tokens revisado; ícone/splash |
| 3 | Componentes transversais + catálogo | Lyra | 1 (2 desejável) | `@vuumbora/ui` (Etapa A), MockBadge, fontes |
| 4 | Adaptadores mock | Vega | 1 | Adaptadores `mock` das portas do `api-client` |
| 5 | Protótipo Passageiro P01–P14 | Lyra | 3, 4 | Etapa B |
| 6 | Protótipo Motorista M01–M14 | Lyra | 3, 4 | Etapa C (pode rodar em paralelo à 5) |
| 7 | Qualidade | Íris | 5, 6 | Etapa D: testes, a11y, telas pequenas |
| 8 | Contrato de backend | Nova + Cronos + Vega | respostas de produto | Etapa E: API HTTP, modelo de dados |

## Site de pré-lançamento — FASE 1 FECHADA (20/11/2026)

O site está **no ar e captando candidatura de verdade** em
`vuumbora.com.br`. O caminho inteiro foi provado de ponta a ponta:
formulário → API → Postgres, com uma candidatura de teste enviada pelo
navegador no endereço público.

**Um site só.** O Next.js que vivia em `apps/site` foi removido (117
arquivos) e a página estática tomou o lugar dele. Não existe mais "qual é
o site?": é `apps/site/public`, HTML, CSS e JS puros, sem build.

### Infraestrutura (Easypanel)

- **Banco e migrações são automáticos no boot** (`apps/api/src/migrate.ts`):
  a API cria o banco se faltar, espera o Postgres e aplica as migrações
  pendentes sob advisory lock. Não há mais SQL para colar à mão. Provado com
  quatro instâncias subindo ao mesmo tempo contra um PostgreSQL 18 real.
- **API no ar** em `api.vuumbora.com.br`, com certificado válido e CORS
  liberado só para o site. Armadilha anotada: o domínio precisa estar
  cadastrado como `https://` no painel, senão o Let's Encrypt nunca é
  chamado e o navegador recusa a chamada do site (que é https).
- **Publicação aparece na hora.** A Cloudflare sobrescreve o `max-age` do
  nginx por 4 horas em CSS e JS; `scripts/carimbar-assets.mjs` carimba os
  endereços com o hash do conteúdo no build, então cada publicação muda o
  endereço e a Cloudflare não tem como servir o antigo.
- **Versão visível no rodapé**, vinda do `package.json` da raiz, com a data
  real do build (`scripts/gerar-versao.mjs`). Publicar versão nova é mudar
  um número.

### Conteúdo e layout

Ordem da página, montada na sequência das perguntas do visitante: hero com
o formulário → **QUEM SOMOS** → **ONDE ESTAMOS** → motivos → **categorias
de carro** → carrossel → perguntas → simulador. Duas **faixas de respiro**
com as artes do dono em tela cheia quebram os blocos densos.

Direção em `docs/direcao-apresentar-a-marca.md`; revisão final de copy em
`docs/revisao-copy-fase-1.md`.

Regras de texto que valem daqui em diante:
- **"Candidatura" e "cadastro" nunca se trocam** — a primeira existe hoje, o
  segundo abre depois, com as regras.
- "Taxa menor" e "repasse mais rápido" podem, **sem número**, sempre junto do
  compromisso de publicar as regras antes de o cadastro abrir.
- O suporte por pessoa de Natal vale **só para o WhatsApp**.
- As fotos são ilustrativas: nenhum texto, nem o `alt`, pode chamar o modelo
  de "motorista da VuumBora".

### O que continua sem prova

- A imagem Docker nunca foi construída nesta máquina (não há Docker aqui): o
  build no servidor segue sendo o primeiro teste real dela.
- Nada foi aberto em aparelho Android ou iOS real, nem em leitor de tela,
  nem em Safari ou Firefox.
- Dedup por e-mail e normalização de telefone foram provados contra
  PostgreSQL real **local**, não contra o banco de produção.

### Pendências conhecidas do site

- A linha do tempo do ONDE ESTAMOS é **estática abaixo de 900px** — sem o
  desenho progressivo que o desktop tem. Motorista acessa de celular.
- `carrossel-repasse-rapido.jpg` tem texto da arte original cortado na borda
  esquerda. É imagem, não CSS: precisa recortar de novo a partir de
  `Imagens_Site/`.

## Reforma anterior do formulário (19/11/2026)

Reforma do formulário de candidatura e das seções pós-jornada
(`docs/especificacao-formulario-e-secoes.md`, Apolo → Lyra, 19/11/2026).
Duas decisões do dono, resolvidas, não reabrir:
- **Aviso de privacidade resumido no cartão**: uma linha curta visível
  (`<details><summary>`) com o texto literal completo abrindo num clique.
  É o que mantém o cartão inteiro na tela mesmo em notebook baixo
  (1366x768, 1280x720) com a rede de segurança da seção 1.7 da especificação.
- **Rodapé**: a frase "A marca é real, então não existe aviso de marca
  fictícia..." era anotação de bastidor do pacote de design, não texto do
  site — removida. Ficou só "As imagens são ilustrativas." na barra inferior.

## Decisões em aberto (dependem do dono)

**Lista atualizada e priorizada: [`docs/plano-sistema.md`](docs/plano-sistema.md) §14**
— separa as que travam uma fase inteira (orçamento, prazo, gateway, cidade,
agendamento, tarifa) das que só decidem desenho. O que está abaixo é o registro
anterior, mantido por histórico.

Lista completa em `docs/decisions.md` → "Ambiguidades de produto". As que mais pesam para o MVP:
- Login por código (celular) ou senha.
- Uma conta com dois papéis ou contas separadas.
- Métodos de pagamento e existência de carteira.
- Taxa da plataforma/repasse e regras de cancelamento.
- SDK de mapa (D-11) e cidade de lançamento.
- Identificadores de loja (provisório `com.vuumbora.passenger` / `com.vuumbora.driver`).
