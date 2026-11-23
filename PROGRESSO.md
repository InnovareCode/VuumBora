# PROGRESSO — VuumBora

Estado do projeto entre sessões. Atualizar ao fim de cada marco.

## Estado em 23/11/2026 (madrugada): S1 EM PRODUÇÃO e onda 5 na main

**Produção (publicada pelo dono em 22-23/11, conferida por `tools/producao/verificar-pos-deploy.mjs`):**
- API do S1 no ar com as migrações 0010-0023 aplicadas no boot, `REQUIRE_SECRETS=true`. `/healthz` 200;
  `/v1/legal/current` 503 `consent_unavailable` (esperado: textos legais ainda não publicados).
- Painel admin publicado a partir da main; admin de produção criado (`create-admin` + `reissue-2fa-enrollment`) e
  login do dono com 2FA funcionando. Banco só com dados de teste (o dono dispensou backup antes da publicação).
- Falta antes de abrir o cadastro (missão **F05c**): trocar os três segredos gerados na conversa (o dono adiou; refazer
  o 2FA junto), ativar o papel restrito `vuumbora_api` (scripts `ativar-papel-api.mjs`/`conferir-papel-api.mjs`, na main
  desde `ef4a5d0`; trocar `DATABASE_URL` e `RUN_MIGRATIONS_ON_BOOT=false` no MESMO salvamento), SMTP do domínio, textos
  legais revisados pelo advogado + `legal:publish`, Let's Encrypt do `painel.` (ainda autoassinado), desligar o
  Web Analytics da Cloudflare no `admin.` (a CSP já bloqueia o beacon) e o favicon do painel (404).

**Main em `a280d81`:** expo-dev-client (`aaa6fcc`), scripts do papel restrito (`ef4a5d0`) e **onda 5 do padrão premium**
nos dois apps (P11, P13, P14, M12, M13, M14; abas reais do motorista sem "Ganhos"; exclusão de conta real pelos dois
apps). Íris APROVADO em `a280d81` depois de reprovar o WhatsApp do motorista com um 9 a mais; agora
`scripts/check-support-channels.mjs` roda no `npm run check`.

**Pendências abertas pela onda 5** (detalhe em `docs/fichas-de-tela/README.md`): `me()` sem e-mail/telefone;
`deleteAccount` sem checar corrida ativa (resolver no S4); `expo-location` e `expo-clipboard` (PP-8); `BottomTabBar`
sem `aria-selected` no react-native-web (design system).

**Próximos passos:** F06 (build Android) espera só a conta Expo do dono. Onda 4 (corrida, PP-10 rota única) e onda 6
(painel pelo portão). Decisões do dono ainda abertas: tarifa (simulador entregue), gateway, textos legais e seguro
(advogado), conta Google Play.

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

## Estado em 22/11/2026 (noite): o que entrou desde a tarde

- **F07 completa**: tela de usuários e papéis do painel (`77a6315`), com a correção do 403 da senha errada no step-up
  (`21e0905`). Íris aprovou contra API e Postgres reais, com contas de teste autorizadas pelo dono.
- **F08 e F08b**: contratos da corrida com os ajustes R1 a R8 da Nova (`f753c75`); a corrida do passageiro roda sobre o
  adaptador mock, e a Home mostra só as categorias da cotação (`b171c87`). Embarque e destino na oferta só pelo bairro
  (decisões do dono). Íris 39/39, com mutação de prova.
- **F03 completa**: a rede estática pega o login do admin fora do pool (`b9fb483`).
- **Padrão premium**: ondas 0, 1 e 2 na main, todas aprovadas no portão. Notas: P01 8, P02a 8, P02b 7, P03 9, P04 8, M01 8,
  M02 8, M05 9 (era 4), perfil provisório do motorista 8. O botão do cadastro do passageiro ficou fixo no rodapé (`05c6a34`).
- **Ferramenta do portão**: captura pelo Metro vivo, sonda de contraste que compõe fundos translúcidos e login automático nas
  telas protegidas (`b046474`).
- **Em andamento**: ressalvas da onda 2 (endereço em 2 linhas, atalhos da Home, estado sem aprovação do motorista) e a sonda
  de geometria com overflow hidden.
- **Próximas ondas** (`docs/fichas-de-tela/README.md`): onda 3, pedido (P05, P06, P07). A onda 4 (corrida) depende do
  Mapbox nativo e do S4.
- **Esperando o dono**: F05 (publicação) e F06 (Android). As decisões abertas de categoria (D-08 Motorista mulher, D-09 Pet
  e Entrega) seguem com as categorias ocultas.

## Estado em 22/11/2026 (tarde): plano mestre em execução, toda fatia passa pelo painel

**Processo:** cada fatia vira commit candidato numa branch `fatia/<id>` com CI. Ela só entra na `main` por merge que preserva o
SHA validado, depois da Íris (QA em cópia limpa) e, quando toca segurança, do Órion. Achado de segurança aberto fica em
`docs/privado/` (repositório público). Teto de cerca de 4 agentes simultâneos: 7 em paralelo estouraram o limite de uso da conta.

**Na `main` hoje:**
- **F01** (QA e segurança pós-M1): Íris passada 6 APROVADO; Órion 3d sem crítico nem alto, alto da 3c resolvido.
- **F11 + F03 + F01-M1** (`db821a3`): exclusão de conta (migração 0022), access_log 180 dias, retenção de candidatura e lista de
  espera (180 dias provisório, espera o advogado), IP fora dos logs, limite próprio de legal/current e auth/me. Íris passada 7
  APROVADO, Órion 3e sem achado.
- **F02** (`b9b4cfa`): apps em modo http em preview e production; simulação só em development, por troca de módulo no build; CI
  com export real de produção, marcador do mock ausente e 3 controles negativos. Íris passada 8 APROVADO (apps de verdade contra
  API e Postgres reais); Órion 3f, o médio foi corrigido em `35233d8`, e o 3c-B3 fechou.
- **F07 backend** (`7687c00`): usuários e papéis do painel (só dono, senha em toda mutação, senha + TOTP para dono e financeiro,
  último dono protegido, sessão derrubada na troca de papel), migração 0023 (escrita estreita em admin_users, classificada
  PARCIAL pelo Órion e aceita com o TOTP), limite próprio em toda rota com teste de inventário. Íris passada 9 e delta APROVADO.
- **F10** (`9ed6865`): 86/100 endereços de Natal no Mapbox; o plano alternativo (POIs próprios e pino com confirmação) é escopo do
  M4. PostGIS não está na imagem do banco.
- Ferramenta do portão de qualidade (`tools/qualidade-tela`, captura pelo Metro vivo desde `daeabf9`).
- Decisões do dono de hoje: papéis do painel aprovados; embarque na oferta só pelo bairro.

**Candidatas fora da `main`:**
- `fatia/f09-onda0` (`a03961e`): tokens, dependências e componentes C-01 a C-17. O portão reprovou pelo logo; logo e cabeçalho de
  login foram corrigidos, e a Íris está reabrindo o portão.
- `fatia/f08-v2` (`c5f8fa0`): contratos da corrida. A Nova pediu os ajustes R1 a R8, que esperam a decisão do dono sobre o destino
  na oferta.
- `fatia/f07b` (`bfba646`): tela de usuários do painel. A QA contra a API real espera o dono autorizar contas de admin de teste
  (o sistema de permissão bloqueou a Lyra).

**Esperando o dono:** F05 (publicação: data, segredos, SMTP; o roteiro agora inclui as migrações 0022 e 0023), F06 (conta Expo e
identificadores), destino na oferta, contas de admin de teste, limpeza de ~20 GB de pastas temporárias (disco a 99%), 3c-M1.

**Marco 2:** todas as fatias que dependiam da squad (F01, F02, F03, F04 em rascunho) estão prontas. Faltam F05 e F06, do dono.

## Estado em 22/11/2026 (madrugada)

- **Íris, passada 5: APROVADO** sobre `6a3ff24` (`docs/veredito-iris-s1-passada-5.md`): CI 4/4; suíte 384/384 em 5 de 5; o
  `bcrypt-ceiling` 120/120 em 6 condições (os mutantes dela morrem); teste do gate com 5 formas escondidas fechadas; B2, anel de
  foco, A3 e B-6 nos três navegadores; nenhum token em `localStorage`, `sessionStorage`, cookie, IndexedDB ou Cache Storage.
  **Marco 1 fechado: backend e apps prontos em modo de teste.** O que ainda impede publicar o S1 em produção fechada (nada de
  QA): **B4** (modo http dos apps com `EXPO_PUBLIC_API_URL` e TLS; hoje `IDENTITY_MODE` é `mock`); **textos dos Termos e da
  Política** (arquivo hospedado, `LEGAL_DOCUMENTS_BASE_URL` e a primeira versão no catálogo; sem isso o cadastro responde 503);
  **migrações 0010 a 0021, API e painel juntos** (hoje a produção é a API antiga com painel incompatível); Docker, `TRUST_PROXY`,
  papel restrito e SMTP com TLS, SPF e DKIM sem prova; para loja, EAS e as contas Apple e Google. Backlog da Íris: Q1 a Q3
  (testes do pool e do gate), **Q4** (`LinkButton` `role=link` não ativa por Enter nem Espaço no web), Q5 (Home do motorista, na
  M04), Q6 (outliers de 231 a 289 ms no `/healthz`, causa não provada). Rodada curta da Órion sobre o delta pós-3b em andamento.
- **CI verde em `33b2401`** (4 de 4 jobs): o teste do pool de bcrypt foi corrigido de fato (mede uma comparação no próprio
  processo e afirma proporções). **Íris, passada 4: REPROVADO só por 2 defeitos de TESTE** (`docs/veredito-iris-s1-passada-4.md`),
  com o código de produção provado: M-1 (titular recusado de 21 a 68% para 0%), B-1 e F4 (503 não grava tentativa), B-3, B-4,
  B-5, `api-client` (216/216, SF4 e SF10 agora morrem), B3 do passageiro, e F3 a F12 nos três navegadores. Defeitos: (N1) limite
  absoluto de 200 ms no `/healthz` do `bcrypt-ceiling` falhou 3 de ~107 vezes (223 a 233 ms); (N2) `uniqueEmail()` só é único por
  processo e o `bcrypt-ceiling` falha da 2ª execução no mesmo banco. Correção em andamento (Vega). **`d7e21e1` (B2 do motorista,
  anel de foco do `packages/ui`) ainda NÃO foi validado pela Íris.**
- **B2 no `main` (`d7e21e1`):** identidade do motorista sobre o cliente mock, copy "conta não é cadastro", lock regenerado.
- **A3 (armazenamento seguro e conferência do SHA-256 dos textos)** em andamento depois da passada 4.
- **Íris, passada 2: APROVADO** sobre `79f41d8` (`docs/veredito-iris-s1-passada-2.md`): painel que falha fechado contra a API
  real do S1 (Chromium e Firefox), botão do Firefox, A1 nos dois apps e A2 (114/114 e fluxo real). Duas lacunas de teste do
  `SessionManager` (SF4 e SF10) com os testes prontos para incorporar. **Vale só para esse commit**: o `HEAD` andou depois.
- **Órion, rodada 3b** (`docs/revisao-seguranca-s1-rodada3b.md`): **0 críticos, 0 altos, 4 médios, 9 baixos.** API liberada
  para produção **fechada**. Médios: M-1 (pista de bcrypt sufocável por ~17 a ~35 IPv4 ou 1 bloco IPv6), M-2 (o cliente real não
  manda as versões dos Termos: o cadastro real daria 400), M-3 (perfil de build abre telas de dev por omissão e nada barra
  identidade simulada na loja), M-4 (o `SessionManager` apaga a sessão por status HTTP, sem olhar o `code`).
- **No `main`:** A-1 e B-1, API do M-3 com a migração 0021, A1, A2, B1 (identidade do passageiro sobre o cliente mock), painel
  que falha fechado, `nginx.conf` do admin e do site.
- **Íris, passada 3: REPROVADO** sobre `1707546` (`docs/veredito-iris-s1-passada-3.md`). Motivos: CI vermelho no próprio SHA;
  testes de concorrência frágeis por construção depois do teto do A-1 (a fila do ambiente de teste é menor que o maior disparo
  de 12 requisições); botão "Mostrar senha" some no Firefox (373 px ou menos) e no WebKit (365 px ou menos) porque o `InputCore`
  não tem `minWidth: 0`. **Passou:** migrações 0001 a 0021 do zero, suíte 323/323 em 6 de 6 (inclusive presa a 2 CPUs), M-3 de
  ponta a ponta na API real, A-1 sob carga, guardas de rota e estados de identidade do B1. Correções em andamento (Vega e Lyra).
- **CI vermelho: causa real achada.** O teste do pool de bcrypt falhava na asserção `elapsed > 800` ("o trabalho de bcrypt tem
  que ter acontecido de verdade", 769 ms no runner): um piso fixo que depende da velocidade da CPU. **O diagnóstico que
  registrei antes (contenção de CPU, 2 threads num runner de 2 vCPUs) estava errado**, e o ajuste de `148dc8d` mexeu na
  asserção errada. Correção com a Vega (medir uma comparação no próprio processo e afirmar relações, não pisos fixos). O CI agora
  publica o bloco do erro em TAP. Um commit meu levou de carona uma remoção staged da Lyra e quebrou o
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
