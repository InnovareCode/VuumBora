# Plano mestre de execução — VuumBora

Nova, 22/11/2026. Pedido do dono (decisão 4 de 22/11/2026, `docs/decisoes-do-dono.md:945-947`): plano organizado e
orquestrado, com padrão premium e tratamento de layout tela a tela, com portão de qualidade antes de qualquer tela ser dada
como pronta.

**O que este documento é.** O plano de *execução* daqui até o lançamento: marcos, trilhas paralelas, o caminho de toda fatia,
as regras de orquestração e o calendário de decisões do dono. **Não reabre arquitetura.** A arquitetura, o modelo de dados e os
critérios de cada fase S0–S9 continuam em `docs/plano-sistema.md` (fonte de verdade do plano do sistema) e nos anexos
`docs/plano-sistema-arquitetura.md` §10 e `docs/plano-sistema-dados.md`; o detalhe das fatias dos apps continua em
`docs/plano-apps-execucao.md`. Onde este documento e aqueles falarem da mesma coisa: o conteúdo técnico vale lá, a ordem e o
processo valem aqui.

**Hipóteses de contexto** (as mesmas do plano do sistema, `docs/plano-sistema.md` §8 e §9): MVP, uma cidade (Natal), teto de
desenho de ~1.000 corridas/dia, um servidor Easypanel, squad pequena, **sem prazo fixado pelo dono** (D-02 aberta). Por isso
nada aqui tem data. Esforço é relativo: **P** (dias), **M** (1–2 semanas), **G** (2–4 semanas), **GG** (mais de 4 semanas),
na escala já usada em `docs/plano-sistema.md` §8. **Não é prazo.**

**Padrão premium de telas.** `docs/padrao-premium-telas.md` (Apolo) **ainda não existia** quando este plano foi fechado
(conferido em 22/11/2026). A seção 4.3 traz o portão mínimo de tela; quando o padrão chegar, ele manda nos critérios visuais e
este plano continua mandando no processo. Cruzar os dois é a primeira tarefa da fatia F09.

---

## 1. Onde estamos (conferido, com a fonte)

| Fato | Fonte |
|---|---|
| **Marco 1 fechado:** backend e apps prontos em modo de teste. Íris, passada 5, APROVADO sobre `6a3ff24`: CI 4/4, suíte da API 384/384 em 5 de 5, B2, A3, anel de foco e B-6 nos três motores | `PROGRESSO.md:102-111`; `docs/veredito-iris-s1-passada-5.md:3-5` |
| **Três commits depois do Marco 1 sem QA nem revisão:** `697bb6f` (Q4, `LinkButton` por Enter), `8719033` (limites por IP em duas classes, 400 próprio do refresh, caches), `818d655` (anel de foco WebKit, texto legal, senha sem autocorreção, perfil de build) | `git log`; nenhum veredito cita esses SHAs |
| Órion, rodada 3c (sobre `67ea9bd`, código de `6a3ff24`): produção **fechada** sem bloqueio de código; **abrir o cadastro ao público** bloqueado por um achado alto e um médio. Relatório **fora do git** (repositório público) | `docs/privado/revisao-seguranca-s1-rodada3c.md` (não versionado); `.gitignore:3` |
| O commit `8719033` endereça o achado alto da 3c, segundo a decisão registrada; **sem revalidação** da Órion nem da Íris | `docs/decisoes-do-dono.md:899-932` |
| **Produção:** API **antiga**; painel do S1 incompatível com ela; nenhuma migração 0010+ rodou em produção | `PROGRESSO.md:9-11, 64-72, 141-142` |
| O que impede a produção fechada: B4 (apps em `mock`), textos legais (sem eles o cadastro responde 503), publicação conjunta de migrações 0010–0021 + API + painel, Docker/`TRUST_PROXY`/papel restrito/SMTP sem prova | `PROGRESSO.md:105-109` |
| Os apps ainda usam identidade **simulada** (`IDENTITY_MODE` = `mock`) | `apps/passenger/src/identity/identityClient.ts:17-20`; `PROGRESSO.md:106` |
| **Aprovar e recusar candidatura já existe no código** (`da9db50`, migração 0009: rotas `/approve` e recusa com motivo, diálogos no painel, CSRF), mas **não está em produção** e **não achei veredito da Íris** sobre esse commit | `apps/api/src/routes/admin-driver-application-route.ts:159-175`; `apps/admin/src/components/ApproveDialog.tsx`; `docs/producao-passo-a-passo-dono.md:27,49` |
| **Não existe vínculo** entre a candidatura do site (`driver_applications`) e a conta de motorista do app: nenhum serviço de identidade lê essa tabela | `grep driver_applications apps/api/src` (só domínio, repositórios da candidatura e do admin) |
| Nenhuma rota de corrida, cotação, documento, exclusão de conta ou push existe | `ls apps/api/src/routes`; `docs/plano-apps-execucao.md:57-60` |
| Máquina de estados do domínio: cancelamento depois do aceite ainda **mata a corrida** (não volta para `searching_driver`, pendência do S0) | `packages/domain/src/passenger/rideStateMachine.ts:29-33`; `docs/plano-sistema.md:230-233` |
| `eas.json` existe nos dois apps; nenhum build EAS foi feito; zero prova em aparelho | `apps/passenger/eas.json`, `apps/driver/eas.json`; `docs/plano-apps-execucao.md:131-136` |
| **Contas Apple ficam para o fim do desenvolvimento** (decisão do dono, risco assumido) | `docs/decisoes-do-dono.md:942-944` |
| Auditoria premium das telas (18/11): notas de 3 a 8; `/buscando` e `/em-andamento` com 3; ordem de correção por impacto | `docs/auditoria-premium.md:37-54, 215-248` |
| Backlog da Íris aberto: Q1–Q3 (lacunas de teste da API), Q5 (contradição de copy na Home do motorista), Q6 (outliers do `/healthz` sem causa) | `docs/veredito-iris-s1-passada-5.md:168-173` |

### O que eu não consegui conferir

- O **estado do CI** em `818d655` e `c6bacca` (não consultei o GitHub).
- Se `8719033` fecha **de fato** o achado alto da 3c, e se `818d655` fecha os baixos que cita: só a Órion e a Íris dizem.
- Se `da9db50` passou por QA em algum lugar que não seja um `docs/veredito-*.md`.
- O estado real do Easypanel (HTTPS do painel do servidor, variáveis, backup externo, monitor): só leitura de documento.
- O conteúdo e o estado dos rascunhos jurídicos: `docs/juridico/` (termos do passageiro, termos do motorista, política de
  privacidade) **apareceu, não versionado, enquanto este plano era escrito** (22/11/2026, ~11h29). Não li os textos; só
  registro que a F04 já começou e que a escolha por documentos separados por perfil (DN-02) parece ter sido tomada no rascunho.
- A conta Expo do dono, a conta Google Play e o número D-U-N-S.
- Se a imagem Postgres do Easypanel tem PostGIS (condição de `docs/plano-sistema.md` §13.1).
- Como o código trata o nascido em 29/02 (questão aberta em `PROGRESSO.md:53`).

---

## 2. Marcos e fases do que falta

Cada marco fecha com **veredito da Íris sobre um SHA** e, quando houver segurança, **revisão da Órion sem crítico aberto**. O
critério de aceite das fases S2–S9 é o de `docs/plano-sistema.md` §8 e do anexo de arquitetura §10; aqui ele está resumido e
acrescido do que a realidade de 22/11 exige.

| Marco | Conteúdo | Critério de aceite (objetivo) | Depende de | Esforço |
|---|---|---|---|---|
| **M1** | Backend e apps em modo de teste | **FECHADO** (`docs/veredito-iris-s1-passada-5.md`) | — | — |
| **M2** | **Publicação fechada do S1** | (1) Íris APROVADO e Órion sem crítico sobre o SHA publicado, incluindo o delta pós-M1 e a B4; (2) migrações 0010–0021, API e painel publicados **juntos**, uma vez; (3) `curl` do `/healthz` e de `GET /v1/auth/me` (401, não 404) em `api.vuumbora.com.br`; (4) `TRUST_PROXY` provado (IP real do cliente no log); papel restrito ativo (`docs/sql/ativar-papel-api.sql`); `REQUIRE_SECRETS=true`; (5) um cadastro de teste com e-mail real recebido (SMTP com SPF, DKIM e DMARC conferidos); (6) login do painel com 2FA em produção; (7) restauração do backup externo feita uma vez após a publicação; (8) um Android real fazendo cadastro → código → login → app morto e reaberto → logado (B5 Android) | F01–F06 | **M** |
| **M3** | **S2 restante: aprovar candidatura, cadastro do motorista etapa 2 e documentos** | Critério do S2: motorista de teste vai de candidatura a `approved` sem passo fora do app e do admin; toda visualização de documento no `audit_log`; URL de documento expira em ≤ 5 min (teste automatizado); papel `suporte` recebe 403 em documentos; documento vencido impede ficar online. **Acréscimos:** candidatura aprovada se liga à conta de motorista por regra explícita (hoje não há vínculo); gestão de usuários e papéis no admin antes de entrar gente da empresa; **gate público**: o cadastro só abre com as regras de taxa e repasse publicadas e os bloqueios da rodada 3c resolvidos ou aceitos | M2; decisões 9, D-13, D-08; lista de documentos da STTU; decisão 7 (só para **abrir**) | **G** |
| **M4** | **S3: geografia, categorias e preço** | Mesma rota gera sempre a mesma cotação; mudar tarifa não altera cotação emitida; cotação vencida dá `409 quote_expired`; arredondamento com casos de borda; ≥ 90% de 100 endereços reais de Natal, ou plano alternativo; nenhuma cifra de mockup no código dos apps (D2) | M2; decisão 7 (tarifa); D-04; D-06; D-09 (adicional de Pet) | **M** |
| **M5** | **S4: núcleo da corrida** | Zero atribuição dupla em 1.000 pedidos (50 motoristas, 20 simultâneos); oferta em p95 < 2 s; queda de rede de 30 s se recupera sozinha; favorito que recusa custa ≤ uma janela; Motorista mulher sem elegível **não** vai para outro sem consentimento; 10 corridas em ruas de Natal sem buraco de posição > 30 s. **Ajuste pela decisão Apple de 22/11:** o teste de campo deste marco é **só Android** (dois aparelhos comuns, um de fabricante com economia de bateria agressiva); a parte iPhone vai para o bloco iOS (M8i) | M3 (aprovação real), M4; D-05, D-12, D-15, decisões 10 e 15 | **GG** |
| **M6** | **S5: pagamentos e repasse** | 200 corridas em sandbox fecham ledger = relatório do provedor ao centavo; mesmo webhook 10 vezes gera 1 lançamento; assinatura inválida recusada e registrada; nenhum dado de cartão no servidor | M5; D-03 (gateway), decisões 6, 7, 15; contador | **G** |
| **M7** | **S6: operação no admin** | Toda ação de escrita tem teste que confere a linha no `audit_log`; roteiro de operação executado por quem não construiu o painel, sem ajuda; nenhuma tela carrega dado de papel que o usuário não tem (teste por papel) | M3, M5; M6 para o financeiro | **G** |
| **M8** | **S7: segurança, LGPD e prontidão legal** | Zero crítico ou alto aberto (Órion); retenção apagando dado vencido em homologação; exclusão de conta provada; checklist legal assinado pelo advogado; build Android aceito no teste interno do Google Play | M5, M6, M7; D-11; advogado e contador | **G** |
| **M8i** | **Bloco iOS concentrado** (consequência da decisão de 22/11) | Conta Apple ativa; development build iOS (A6); B5 no iPhone (Keychain sobrevivendo à desinstalação, decidido e provado); localização em segundo plano no iPhone com o mesmo critério do M5; push com APNs; build aceito no TestFlight | Conta Apple (decisão 17); M5 para a parte de corrida | **M a G** (não estimável antes do primeiro build: é o risco R-01) |
| **M9** | **S8: beta fechado em Natal** | ≥ 300 corridas pagas; conciliação 100% todo dia; ≥ 99% de sessões sem travamento; tempo até atribuição aceito pelo dono; nenhum incidente grave sem resolução em 24 h | M8; conta Google Play; M8i **se** o beta incluir iPhone (decisão nova, DN-08) | **M** |
| **M10** | **S9: lançamento** | Aprovado nas duas lojas; RPO ≤ 15 min provado com restauração; cada item pós-MVP vira missão com critério próprio | M9, M8i | contínuo |

**Trilha contínua de qualidade de tela.** Não é marco: corre junto de todos. Nenhuma tela entra num marco sem passar pelo
portão de tela (seção 4.3). As telas de protótipo que já existem e **não** são tocadas por uma fatia funcional passam pelo
mesmo portão na trilha de design (F09 e seguintes).

---

## 3. Trilhas paralelas e zonas de arquivo

### 3.1 Zonas (um dono por zona por vez)

A regra é física: **duas fatias simultâneas nunca escrevem na mesma zona.** Ela nasceu de um incidente medido: durante a
auditoria premium, outra frente editava `packages/ui` e os dois apps pararam de abrir no meio da medição
(`docs/auditoria-premium.md:31-32`).

| Trilha | Agentes | Zona que ESCREVE | Não toca |
|---|---|---|---|
| **Backend** | Vega (API, domínio, cliente), Cronos (migrações) | `apps/api/src/**`, `apps/api/test/**`, `packages/domain/**`, `packages/api-client/**`; **migrações `apps/api/migrations/**` só o Cronos** | telas, `packages/ui` |
| **App do passageiro** | Lyra (instância A) | `apps/passenger/**` (exceto `eas.json`, `app.config.ts`, `metro.config.js`) | `apps/driver`, `packages/*` |
| **App do motorista** | Lyra (instância B) | `apps/driver/**` (mesmas exceções) | `apps/passenger`, `packages/*` |
| **Design system** (zona de travamento) | Lyra, uma instância por vez | `packages/ui/**`, `packages/tokens/**` | apps |
| **Painel admin** | Lyra (instância C) + Vega para as rotas `admin-*` | `apps/admin/**` | apps móveis |
| **Infra e publicação** | Vulcano | `.github/**`, `apps/*/Dockerfile`, `apps/*/nginx.conf`, `apps/*/eas.json`, `apps/*/app.config.ts`, `apps/*/metro.config.js` (guarda de perfil), `scripts/backup/**`, `scripts/check-*.mjs`, `docs/sql/**`, `docs/deploy-*.md`, `docs/publicar-*.md`, `docs/producao-*.md`, `docs/backup-*.md` | código de produto |
| **Jurídico** | Atlas redige, Alexandria revisa; dono e advogado aprovam | `docs/juridico/**` (rascunhos, já iniciados) e os textos publicados por versão (caminho de `LEGAL_DOCUMENTS_BASE_URL`, a definir com o Vulcano) | código |
| **Design** | Apolo | `docs/padrao-premium-telas.md`, `docs/fichas/**` (fichas de tela, a criar), `docs/direcao-de-arte.md`, `tools/art-assets/**` | código |
| **Atlas (somente)** | Atlas | `PROGRESSO.md`, `docs/decisoes-do-dono.md`, `docs/plano-mestre.md`, commits e integração | — |

**Arquivos de fronteira** (mudam o contrato entre trilhas): `packages/api-client/src/**/index.ts` (tipos de contrato),
`package.json`/`package-lock.json` da raiz, `apps/api/src/env.ts`. Só uma fatia por vez, com o Atlas segurando a vez no quadro.
Instalar dependência é sempre fatia de uma pessoa só, nunca carona.

### 3.2 Dependências entre fatias e caminho crítico

```
                        F01 QA+Seg do delta ─┐
F02 B4 modo http ───────────────────────────┤
F03 Q1–Q3 (testes API) ─────────────────────┤
F04 Termos/Política (rascunho → advogado) ──┼─► F05 Publicação fechada ─► F06 Android real ─► [M2]
                                            │
F07 Admin: usuários/papéis ─────────────────┼────────────────────────────► S2 docs (F11+) ─► [M3]
F08 Contratos §6 + máquina de estados ──────┼─► UI da corrida em mock ─────────────────────┐
F09 DS premium (packages/ui) ───────────────┘                                              │
F10 Teste de 100 endereços + área ──► S3 preço (decisão 7) ─► [M4] ─► S4 ─► [M5] ─► S5 ─► [M6] ─► S6 ─► [M7] ─► S7 ─► [M8] ─► [M9] ─► [M10]
                                                                                    M8i (iOS) corre a partir do fim do M5
```

**Caminho crítico técnico:** M2 → M4 → **M5 (GG)** → M6 → M8 → M9. O M5 é o maior bloco e o que mais concentra risco (localização
em segundo plano, despacho concorrente); tudo o que puder ser adiantado em mock antes dele (F08 e a UI da corrida em mock)
encurta o caminho.

**Caminho crítico de decisões** (pode ser mais longo que o técnico): **decisão 7 com os cortes da taxa** → regras publicadas →
cadastro aberto ao público (gate do M3) e tarifa do M4; **D-03 gateway** → M6, e o cadastro do motorista como recebedor, que
começa já no M3 (R11 de `docs/plano-sistema.md` §11). Hoje essas duas decisões estão **mais perto do caminho crítico que
qualquer código**.

---

## 4. O pipeline de toda fatia

### 4.1 As etapas e os portões

Toda fatia percorre as etapas na ordem. Um portão é **binário**: tem evidência escrita ou não passou.

| # | Etapa | Quem | Portão de saída (objetivo) |
|---|---|---|---|
| **P0** | Entrada | Atlas | Fatia no quadro com missão aberta; decisões de que depende **respondidas ou com o padrão recomendado aceito** (seção 6); zona de arquivo livre; contrato escrito se cruza camadas (Nova) |
| **P1** | **Ficha de tela** | Apolo | Para cada tela tocada: arquivo em `docs/fichas/` com os itens do portão de tela (4.3) preenchidos *como especificação*: estados, larguras, copy, tokens. Fatia sem tela pula P1 (o Atlas registra "sem tela") |
| **P2** | Implementação | Lyra / Vega / Cronos, cada um na sua zona | `npm run check` com saída 0; testes do pacote verdes; export web dos dois apps verde; **medidas no navegador** em 320, 360, 390 e 430 px de largura e 568 px de altura para toda tela (skill `medir-antes-de-afirmar`); handoff com o que **não** foi provado. Quem escreveu não declara "validado" (skill `quem-valida-o-que`) |
| **P3** | Commit candidato | Atlas | Branch `fatia/<id>`, `git add` **por caminho explícito**, `git diff --cached --stat` conferido contra a zona da fatia, PR aberto e **CI `ci-ok` verde no PR**. O SHA do PR é o que vai para o QA |
| **P4** | **QA independente em cópia limpa** | Íris | `git archive <SHA>` + `npm ci` com o Node do CI, sem `.env`, banco do zero; os três motores (Chromium, Firefox, WebKit) para tela web; canário ou mutante para cada detector novo; teste de tempo em máquina quieta; `HEAD` conferido no começo e no fim; veredito em `docs/veredito-<fatia>.md` **valendo só para aquele SHA** |
| **P5** | Segurança | Órion | Obrigatória quando a fatia toca identidade, sessão, dado pessoal, documento, dinheiro, escrita do admin, infra ou dependência. Fatia só visual: entra no **lote visual** revisado a cada marco. Zero crítico para integrar; alto aberto impede **abrir ao público**. Relatório com achado aberto vai para `docs/privado/` |
| **P6** | Integração | Atlas | Merge do PR **só** se o veredito e a revisão são do SHA do PR (se o `HEAD` andou, o delta volta ao P4); missão fechada no painel no mesmo turno; `PROGRESSO.md` atualizado; aprendizado registrado |
| **P7** | Aparelho (fatias marcadas) | Íris + dono | A fatia que só se prova em aparelho (`docs/plano-apps-execucao.md` §6) **não fecha** no export web. Android desde o M2; iPhone só no M8i |

**Por que o commit vem antes do QA, e não depois:** a cópia limpa da Íris precisa de um SHA (`git archive`). O pedido do dono
("QA, segurança, commit") vale como **integração na `main` depois dos portões**; o commit candidato numa branch é o que
torna o QA reprodutível. Isto muda a prática atual (commit direto na `main`, que já fez a Íris reprovar um SHA com CI vermelho,
`PROGRESSO.md:130`): o CI roda em `pull_request` (`.github/workflows/ci.yml:6-7`), então o PR custa zero de infraestrutura.

### 4.2 Reprovação

Reprovou: a fatia volta ao P2 **só com o que foi reprovado**, e a Íris revalida o delta e o que ele pode ter quebrado. Defeito de
**teste** (não de produção) reprova igual: foi assim na passada 4 (`docs/veredito-iris-s1-passada-4.md`), e é o que impede
a suíte de virar decoração. Todo bug reprovado gera causa raiz na memória do agente que errou.

### 4.3 Portão de tela (o mínimo, até o `padrao-premium-telas.md` chegar)

Toda tela, nova ou existente, só é "pronta" com **cada** item medido (não lido no código):

1. **Larguras:** 320, 360, 390 e 430 px; alturas 568 e 844. Nada truncado (`scrollWidth > clientWidth`), nada sobreposto, CTA
   principal acima da dobra em 320×568 ou com rolagem óbvia.
2. **Estados:** carregando, vazio, erro de rede, erro de servidor (cada `code` do contrato com texto próprio, nunca "Algo deu
   errado" genérico), sucesso, sem permissão (localização, câmera, notificação), offline. A ficha diz quais se aplicam.
3. **Superfície premium:** cartões em `SurfaceRaised` com borda iluminada, não o "chapado" legado; amarelo **só em ação**;
   brilho de topo onde a direção de arte pede (`docs/auditoria-premium.md:20-27, 219-239`). Só tokens: o
   `check:boundaries` já barra HEX solto.
4. **Tipografia:** Plus Jakarta Sans nos apps e no painel (decisão do dono de 22/11/2026; o site usa Poppins), nas escalas do design system, com algarismos tabulares em todo número que muda; nenhum texto abaixo do corpo mínimo do kit.
5. **Acessibilidade:** alvo de toque ≥ 44 pt; contraste WCAG AA medido; anel de foco **de teclado** visível nos três motores;
   ordem de Tab igual à visual (lição do Admin v0, `PROGRESSO.md:192-195`); erro de campo anunciado.
6. **Copy:** "candidatura" ≠ "cadastro"; "conta" ≠ "cadastro" no motorista; nenhum percentual de taxa; suporte humano de
   Natal só no WhatsApp (`PROGRESSO.md:302-310`); dado de demonstração sempre com `MockBadge`, que nunca divide linha com
   título.
7. **Consistência:** a mesma peça (cabeçalho, botão de perigo, selo de status, estrelas) vem do `packages/ui`, nunca recriada na
   tela.
8. **Aparelho (quando a fatia tem P7):** teclado não cobre campo nem botão; área segura com entalhe; botão voltar do Android.

**Placar herdado:** a auditoria de 18/11 dá a fila de saída das telas existentes (`docs/auditoria-premium.md:39-51`). Nenhuma
tela com nota < 7 entra em marco funcional sem passar antes por este portão.

---

## 5. Regras de orquestração (aprendidas, não teóricas)

| # | Regra | De onde veio |
|---|---|---|
| R1 | **Um agente por zona de arquivo.** Duas instâncias da Lyra podem rodar ao mesmo tempo só em zonas diferentes da tabela 3.1; o `packages/ui` é de uma instância por vez | Os dois apps quebraram no meio da auditoria porque outra frente editava `packages/ui` (`docs/auditoria-premium.md:31-32`) |
| R2 | **Nunca `git add` amplo** (`-A`, `.`, pasta inteira). Adicionar por caminho e **conferir `git diff --cached`** antes de todo commit | Um commit levou de carona uma remoção staged de outro agente e quebrou o `check`; corrigido em `0f6417a` (`PROGRESSO.md:139-140`) |
| R3 | **Ler a mensagem do erro do CI antes de ajustar teste.** O CI publica o bloco TAP do erro; o diagnóstico sai dele, não de hipótese | O diagnóstico de "contenção de CPU" estava errado e `148dc8d` mexeu na asserção errada (`PROGRESSO.md:135-138`) |
| R4 | **Relatório com achado de segurança aberto fica fora do git** (`docs/privado/`), porque o repositório é público. Publica-se quando o achado fecha | `5415577`; cabeçalho de `docs/privado/revisao-seguranca-s1-rodada3c.md` |
| R5 | **Teste de tempo só em máquina quieta**, e afirmando proporções, não pisos absolutos em ms | `/healthz` flaky em 3 de ~107 com limite fixo (`docs/veredito-iris-s1-passada-4.md:15`); teste do pool corrigido para medir no próprio processo (`PROGRESSO.md:112-114`) |
| R6 | **Veredito vale para um SHA.** Se o `HEAD` andou, o delta volta ao QA | `docs/veredito-iris-s1-passada-2.md` ("vale só para esse commit"), `PROGRESSO.md:121-123` |
| R7 | **Relatório de agente aponta o sintoma, não a causa.** Abrir os dois lados antes de "uniformizar" | Erro `admin.`/`painel.` (`docs/decisoes-do-dono.md:767-790`) |
| R8 | **Mockup não é funcionalidade.** A matriz de `docs/plano-sistema.md` §7 é o contrato de escopo | R17 de `docs/plano-sistema.md` §11 |
| R9 | **Uma fatia = um PR verificável**, com critério provado por quem não escreveu o código | `docs/plano-apps-execucao.md` §2, item 4 |
| R10 | **Agrupar trabalho da mesma zona num agente só** (o custo fixo de delegar é alto); não delegar checagem de 1 a 3 chamadas | Regra de custo da squad (instruções do Atlas) |
| R11 | **Missão no painel acompanha cada fatia**: abre no P0, fecha no P6; `.missao-atual` aponta para a fatia que tem agente rodando | Protocolo do painel de missões |

---

## 6. Calendário de decisões do dono

Cada decisão tem um **padrão recomendado**: se o dono não responder até o ponto em que ela passa a bloquear, a squad segue com
o padrão **somente** quando a coluna "Se não responder" diz que isso é seguro; nos demais casos a fatia para e vira bloqueio
visível no painel. Recomendação é recomendação: não é decisão tomada.

"Bloqueia a partir de" é um **ponto do plano**, não uma data (D-02 está aberta).

### 6.1 As que estão no caminho crítico (responder primeiro)

| # | Decisão | Padrão recomendado | Bloqueia a partir de | Se não responder |
|---|---|---|---|---|
| **7** | **Tarifa (base, km, minuto, mínimo, dinâmica) e os cortes da taxa de 20–25%**: quantos dias, corridas e qual nota levam a cada faixa; frequência de recálculo; se a faixa pode piorar; motorista novo | Motorista novo no topo da faixa (25%), como já lido em `docs/decisoes-do-dono.md:669-672`; recálculo periódico com aviso antes de piorar; a squad entrega um simulador para o dono calibrar os números | Início da tarifa no M4; **abrir o cadastro ao público** (gate do M3) | M4 constrói a estrutura versionada com tarifa de teste marcada; **o cadastro não abre** (compromisso público de 18/11). Não há padrão seguro: os números são do dono |
| **D-03** | **Gateway** e meios (Pix, cartão, dinheiro) | Provedor com split que aceite **percentual diferente por transação** (requisito de 20/11); comparar custo do Pix no ticket de R$ 15–30; contador valida | Cadastro do motorista como recebedor (dentro do M3); M6 inteiro | M3 fecha sem recebedor; M5 roda só com "corrida de teste sem cobrança"; **M6 não começa** |
| **9** | **Verificação de documentos:** quem analisa, prazo de resposta, motivos de recusa | Revisão humana pelo papel `revisor_documentos`; prazo publicado ao motorista; motivos de recusa em catálogo fechado | Primeira fatia de documentos do M3 | A fila de revisão não é construída (seria desenho sem regra) |
| **D-13** | **Onde guardar documentos e backups** (Brasil ou exterior) | Armazenamento de objetos em região no Brasil, cifrado, URL assinada de 5 min | Primeira fatia de documentos do M3 | Documentos não começam; backup segue onde o M2 deixar |
| **STTU** | Lista de documentos exigidos em Natal (ação do dono, não escolha) | Procurar a STTU antes do beta, não depois (`docs/plano-sistema.md` §10) | Lista de documentos do M3 | Estrutura configurável sem a lista; o cadastro não abre |

### 6.2 As que travam um marco

| # | Decisão | Padrão recomendado | Bloqueia a partir de | Se não responder |
|---|---|---|---|---|
| D-01 | Orçamento mensal de infra por fase | Ordem de grandeza de `docs/plano-sistema.md` §9 (~R$ 30–90/mês até o M4) | Teste de carga do M5 em homologação | **Seguro seguir:** servidor único, carga rodada fora da produção |
| D-02 | Prazo para beta e lançamento | Sem data; ordem por dependência | Nunca bloqueia | **Seguro seguir:** nenhum prazo é prometido; sem prazo não se corta escopo |
| D-04 | Uma cidade ou região metropolitana | **Só Natal** | Polígono de área do M4 | **Seguro seguir** com Natal |
| D-05 | Corrida agendada no MVP | Pós-lançamento | M5 | **Seguro seguir:** fica fora |
| D-06 | Preço fechado na cotação ou pelo trajeto real | Fechado na cotação (é o que o contrato de cotação assinada com validade já supõe, `docs/plano-sistema.md` §6.4); recotar só se o destino mudar | M4 | Para a tarifa do M4 |
| D-08 | **Motorista mulher**: quem pode pedir, critério de elegibilidade da motorista, base legal do gênero autodeclarado | Elegibilidade por candidatura própria com revisão humana; base legal definida pelo advogado; categoria nasce pronta e **desligada** | Candidatura específica no M3; despacho no M5 | **Seguro seguir com a categoria desligada** no lançamento |
| D-09 | **Pet e Entrega**: adicional, regras, itens proibidos | Pet opt-in do motorista; **Entrega desligada até parecer jurídico** (`docs/plano-sistema.md` §13.3) | Adicional no M4; elegibilidade no M5 | **Seguro seguir:** as duas nascem desligadas |
| D-11 | Seguro APP: plataforma contrata ou exige do motorista | Decidir com advogado e corretor | M8 | **M8 não fecha** → não há beta |
| D-12 | Código de embarque (PIN) | Sim, em todas as categorias (recomendação da Nova, para não ter regra por categoria no MVP) | M5 | Para a transição "iniciar corrida" |
| D-14 | Homologação no mesmo servidor ou em outro | Mesmo servidor até o M8; segundo servidor no M10 (como prevê o S9) | M5 | **Seguro seguir** com o padrão |
| D-15 | Horário de atendimento da central | Horário publicado, sem prometer 24 h; emergência sempre aponta para o 190 | Tela de suporte do M5; atendimento no M7 | Para a copy de suporte (prometer horário errado é compromisso cobrável) |
| 6 | Saque do motorista | Repasse automático pelo split; saque sob demanda pós-MVP (`docs/plano-sistema.md` §7) | M6 | Para a tela de ganhos |
| 10 | Navegação | Abrir Waze/Google Maps por link | M5 (jornada do motorista) | **Seguro seguir** com o padrão |
| 11 | Canal de suporte no app | WhatsApp com pessoa de Natal (já decidido para o site); falta o número oficial | Fatia de perfil e ajuda (C1) | A linha "Ajuda" fica sem ação |
| 15 | Regras de cancelamento | Estrutura pronta, valores do dono; cancelamento do motorista volta a corrida para a busca, sem culpa do passageiro | M5 (regra), M6 (taxa) | Cancelamento sem cobrança no M5; M6 para |
| 17 | Contas de loja | **Google Play já** (conta de empresa); **Apple ao fim** (decidido em 22/11); conta Expo **já** | Expo: F06; Google: M8; Apple: M8i | Sem Expo, **não há prova em Android** e o M2 não fecha |

### 6.3 As que decidem desenho ou fecham pontas do S1

| # | Decisão | Padrão recomendado | Bloqueia a partir de | Se não responder |
|---|---|---|---|---|
| D-10 | Construir ou comprar (white-label) | Construir: a base está feita e provada (`docs/plano-sistema.md` §11, R19) | Nada novo | **Seguro seguir** (é o que está acontecendo) |
| 8 | Login com Google e Apple | Fora do MVP; botões ocultos (A1) | Nada | **Seguro seguir** |
| DN-01 | **Textos dos Termos e da Política** (Atlas redige, dono revisa com advogado) | Rascunho com tudo que depende de fato marcado; publicação só após revisão | F05 (sem versão no catálogo o cadastro responde 503) | M2 publica com cadastro **fechado** (503 por desenho), o que ainda prova a infra; o cadastro real espera |
| DN-02 | Termos únicos ou separados por perfil | Separados por `audience` (a estrutura já suporta) | F04 | Segue o padrão |
| DN-03 | Prazo de guarda do hash do IP do aceite | Definido pelo advogado | F04 (a Política precisa dizer) | A Política sai com o ponto marcado; não publica |
| DN-04 | Unicidade do e-mail por tipo de conta; regra do 29/02 | Manter a hipótese em uso (por tipo); 29/02 conforme a regra civil de contagem de prazo, a confirmar com o advogado | M2 | **Seguro seguir** com a hipótese atual |
| DN-05 | **Aceitar o risco residual do achado médio da rodada 3c** (relatório privado) | Aceitar para a produção fechada com o número registrado em `docs/decisoes-do-dono.md`; reavaliar antes de abrir ao público | Abrir o cadastro ao público | **Bloqueia abrir ao público**, não a produção fechada |
| DN-06 | Tolerância a refresh perdido em rede móvel (`docs/plano-apps-execucao.md` §4, item 5) | Decidir com o dado da B5 Android (contar `token_reuse_detected` sem ataque) | Depois do F06 | Segue sem tolerância (logout raro) |
| DN-07 | Identificadores de loja definitivos (`com.vuumbora.passenger` / `.driver`) | Confirmar os atuais | **Primeiro build EAS (F06)** | O build espera: trocar depois exige app novo na loja |
| DN-08 | **Beta só Android ou com iPhone** (consequência da conta Apple ao fim) | Beta Android primeiro; iPhone entra quando o M8i fechar | Planejamento do M9 | Beta Android, por padrão |
| DN-09 | Limites por IP da identidade (decisão do Atlas revisável) | Manter os números de `docs/decisoes-do-dono.md:905-910` e calibrar pelo log `rate_limited` depois do `TRUST_PROXY` provado | Abrir ao público | **Seguro seguir** |
| — | Motorista bloquear um passageiro específico | Pós-MVP | Nada | Seguro seguir |
| Ação | **HTTPS no painel do Easypanel** e **token do Mapbox restrito** por app e domínio (pendências desde 18/11) | Fazer já | HTTPS: F05. Mapbox: mapa nativo em produção | F05 não sai sem HTTPS do painel do servidor |

---

## 7. As próximas 10 fatias, em ordem

Ordem = dependência, depois risco. As fatias **F01 a F04, F07, F08 e F10 podem começar já**; F09 começa quando o padrão premium
existir. Respeitam as zonas da seção 3.1: nenhuma dupla simultânea escreve na mesma zona.

| # | Fatia | Trilha / agentes | Zona | Depende de | Aceite | Esf. |
|---|---|---|---|---|---|---|
| **F01** | **QA e segurança do delta pós-M1** (`697bb6f`, `8719033`, `818d655`): Íris passada 6 sobre o `HEAD`; Órion revalida o achado alto e os baixos da 3c que esse delta diz fechar | Íris ‖ Órion (só leitura) | nenhuma | — | Íris APROVADO sobre o SHA; Órion marca o alto da 3c resolvido ou devolve; Q4 conferido nos três motores | P |
| **F02** | **B4: apps em modo `http`** — `IDENTITY_MODE` por perfil, `EXPO_PUBLIC_API_URL` só `https` em `preview`/`production`, remoção do escape `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION`, CI com `expo export` e string-canário | Lyra (apps, identidade) + Vulcano (CI, `eas.json`, `metro.config.js`) | `apps/*/src/identity/**`; zona de infra | — | Build `production` aborta sem `https`; nenhum `allowInsecureHttp` em produção; fluxo completo contra a API local; Órion 3d revisa (classe A) | M |
| **F03** | **Q1–Q3 da Íris**: tirar o bcrypt do pool em login, cadastro ou login do admin tem de **quebrar** um teste; orçamento em ms trocado por proporção; sonda do gate pega as 7 formas escondidas | Vega | `apps/api/test/**` | — | Os mutantes M5, M6, M8 e as 7 formas do gate morrem (Íris confere) | P |
| **F04** | **Termos de Uso e Política de Privacidade** (rascunho já em `docs/juridico/`, em andamento): rascunho para revisão jurídica, por `audience`, com o que depende de fato marcado; hospedagem imutável por versão e primeira versão no catálogo (`legal_document_versions`, migração 0021) | Atlas redige, Alexandria revisa; Vulcano hospeda | Jurídico; infra | DN-01, DN-02, DN-03 | Rascunho entregue ao dono; após o "ok" do advogado: SHA-256 conferido pelo app (B-6) contra o texto publicado | M |
| **F05** | **Publicação fechada do S1** — roteiro de `docs/producao-passo-a-passo-dono.md` e `docs/publicar-o-backend.md`: HTTPS do painel do Easypanel, variáveis, duas credenciais de banco, papel restrito, migrações 0010–0021 por tarefa de operador, API e painel **juntos**, `TRUST_PROXY` provado, SMTP e tela "E-mail", backup e monitor externos, admin de produção com 2FA | Vulcano + **dono** | Infra | F01, F02 revisada, F03; F04 para o cadastro funcionar (sem ela publica com 503) | Itens (2) a (7) do M2 | M |
| **F06** | **Primeiro Android real** (A4 + B5 Android): development build EAS dos dois apps contra a produção fechada; cadastro com e-mail real → código → login → app morto → logado → 15 min em segundo plano gera **uma** renovação no `access_log` → modo avião → sair → esqueci a senha | Vulcano (build) + Íris (prova) + dono (conta Expo, aparelho) | Infra | F05; conta Expo; DN-07 | Item (8) do M2; primeiro dado para a DN-06. **Fecha o M2** | M |
| **F07** | **Admin: usuários e papéis** (criar, desativar, trocar papel; ninguém cria o próprio usuário) + validador "falha fechado" em `driverApplications`, `emailSettings` e `twoFactor` + **QA da aprovação de candidatura** (`da9db50` nunca teve veredito próprio) | Lyra C + Vega (rotas `admin-*`) + Cronos (migração) | `apps/admin/**`; `apps/api/src/routes/admin-*`; migrações | Proposta de papéis aprovada pelo dono (`docs/decisoes-do-dono.md:727-743`) | Cada ação de escrita com linha conferida no `admin_audit_log`; teste por papel (403 onde não cabe); Íris prova aprovar/recusar contra a API real | M |
| **F08** | **Contratos §6.2–§6.4 e máquina de estados** (pendência do S0 / A5): portas de cotação, corrida, oferta, disponibilidade e tempo real no `api-client` com mocks que reproduzem os erros; cancelamento do motorista volta para `searching_driver`; o simulador do passageiro vira o adaptador `mock` | Vega (Nova confere o contrato) | `packages/api-client/**`, `packages/domain/**` (arquivos de fronteira) | — | Toda rota com entrada, saída e erros tipados; teste da transição nova; telas atuais da corrida continuam iguais sobre a porta | M |
| **F09** | **Design system premium**: cruzar `docs/padrao-premium-telas.md` com o portão 4.3; aplicar a "Frente DS" da auditoria (itens 1, 3, 4, 5, 14 e `MetricCard`); depois reauditar as telas afetadas | Apolo (ficha) → Lyra (única no `packages/ui`) | `packages/ui/**` | Padrão premium do Apolo | Telas afetadas medidas nas 4 larguras; nenhuma nota < 7 entre as tocadas; Íris valida as **telas**, não só o componente | M |
| **F10** | **Área de serviço e teste de 100 endereços de Natal** (abre o M4 sem depender da tarifa): busca do Mapbox contra amostra real (bairros, praias, condomínios, shoppings); Vulcano confirma PostGIS na imagem e no backup/restore | Vega + Vulcano | `apps/api/scripts/**` (amostra e medição); infra | D-04 (padrão Natal); token Mapbox do ambiente | ≥ 90% encontrados, ou plano alternativo escrito (pino no mapa, POIs próprios); PostGIS sim/não registrado | P |

**Paralelismo possível hoje:** F01 (só leitura) ‖ F02 ‖ F03 ‖ F04 ‖ F07 ‖ F08 ‖ F10. São sete frentes sem zona em comum; o
limite real é custo de delegação, não colisão. Sugestão do Atlas pode ser F01 + F02 + F03 primeiro (fecham o M2) e F07 + F08 em
seguida.

### 7.1 O que fica bloqueado por decisão (e não deve começar)

| Trabalho | Bloqueado por |
|---|---|
| Fila de revisão e upload de documentos (M3, C2) | Decisão 9, D-13, lista da STTU |
| Abrir o cadastro de motorista ao público | Decisão 7 com cortes **publicada**; DN-05; textos legais em vigor |
| Candidatura a Motorista mulher (M3) e despacho da categoria (M5) | D-08 e a base legal do gênero autodeclarado |
| Tarifa real e cotação (M4) | Decisão 7, D-06 |
| Cadastro do motorista como recebedor, pagamentos (M3 parcial, M6) | D-03, decisões 6 e 15, contador |
| Entrega | Parecer jurídico (D-09) |
| Qualquer prova em iPhone, APNs, TestFlight | Conta Apple (decidido: ao fim) |
| Teste interno no Google Play | Conta Google Play (decisão 17) |
| Primeiro build Android | Conta Expo; DN-07 |
| Fechamento do M8 (prontidão legal) | D-11, advogado, contador |

---

## 8. Telas por marco (para o tratamento tela a tela)

Códigos das telas de `docs/plano-apps-execucao.md` §1.3. "Portão" = portão de tela da seção 4.3.

| Marco | Passageiro | Motorista | Admin |
|---|---|---|---|
| M2 | P01, P02 (login, cadastro, código, esqueci/redefinir) já reais sobre o `http` — portão em aparelho Android | M01, M02 (parte "conta") — idem | Login, 2FA, "E-mail" — portão contra a API de produção |
| M3 | — | M02 (etapa 2), M03 documentos, M04 análise (resolve o Q5: a copy "Cadastro em análise" contradiz o compromisso público hoje) | Usuários e papéis; candidaturas com aprovar/recusar; fila de documentos com visualizador auditado |
| M4 | P03 com mapa real e localização, P04 origem/destino, P05 categorias, P06 confirmação | — | Tarifas e categorias com versão; simulador de tarifa |
| M5 | P07 buscando, P08 a caminho, P09 em andamento, P10 concluída, P11 histórico, P14 ajuda/segurança (compartilhar e SOS) — **as piores notas da auditoria (3 a 4,5)** | M05 home, M06 oferta, M07–M10 corrida, M12 | Mapa de corridas ao vivo; linha do tempo da corrida |
| M6 | P12 pagamento | M11 ganhos | Financeiro, conciliação, estorno |
| M7 | — | — | Suporte, bloqueio, antifraude, fila LGPD, auditoria |
| M8 | P13 perfil com exclusão de conta | M13, M14 | — |

Telas de desenvolvimento (`(dev)`) não passam pelo portão: o portão delas é **não estar no build de produção** (A1 e M-3).

---

## 9. Registro de riscos

| # | Risco | Prob. / Impacto | Mitigação no plano |
|---|---|---|---|
| R-01 | **iOS só no fim** (decisão do dono): achado específico de iPhone (Keychain na reinstalação, localização em segundo plano, revisão da App Store, push) aparece tarde | Alta / Alto | Bloco M8i explícito; conta Apple pedida no início do M8 (o D-U-N-S leva dias); beta Android primeiro (DN-08); nenhuma API exclusiva de iOS sem porta com implementação Android |
| R-02 | **Gateway**: taxa fixa por Pix multiplica o custo ~10x no ticket do VuumBora; split com percentual por transação não é universal | Média / Alto | Requisito de eliminação na comparação; porta de pagamento permite trocar; decisão D-03 no caminho crítico |
| R-03 | **STTU / lei municipal**: Natal redige lei nova; documentos e exigências podem mudar; PLPs federais pendentes | Média / Alto | Documentos e taxa configuráveis por município; procurar a STTU antes do beta; lista de documentos não é construída antes da confirmação |
| R-04 | **Motorista mulher**: base legal do gênero autodeclarado; categoria de nicho com espera longa; risco de rebaixar categoria sem consentimento | Média / Alto | Categoria nasce desligada até D-08; nunca rebaixar sem consentimento (teste do M5); métrica de espera por categoria |
| R-05 | **Entrega e Pet**: enquadramento legal e seguro diferentes | Média / Alto | Ambas nascem desligadas; Entrega só com parecer |
| R-06 | **Escala do servidor único**: site, API, banco e painel na mesma máquina; segundo servidor só no M10 | Média / Muito alto | Backup externo com restauração provada no M2; monitor fora do servidor; teste de carga no M5 com a homologação definida em D-14 |
| R-07 | **Custo**: Mapbox sem token restrito; gateway; contas de loja; advogado e contador não estão na conta de infra | Média / Médio | Token restrito (ação pendente desde 18/11); rota no servidor com cache; custo por fase em `docs/plano-sistema.md` §9 |
| R-08 | **Repositório público** com achado de segurança aberto | Já existe / Alto | R4: relatório em `docs/privado/` até fechar; a Órion confere antes de publicar o relatório |
| R-09 | **Gargalo da squad**: Lyra cobre três apps e o design system; o `packages/ui` é zona de travamento | Alta / Médio | Instâncias por zona; F09 antes das telas da corrida para não mexer no DS no meio do M5 |
| R-10 | **Export web mascarando problema nativo** | Média / Alto | P7: fatia com prova em aparelho não fecha no navegador |
| R-11 | **Logout forçado por refresh perdido** em rede móvel | Média / Médio | Medido no F06; DN-06 |
| R-12 | **Tela inconsistente** entre a já tratada e a de protótipo ("parece de outro app") | Alta / Médio | Portão de tela em toda fatia; placar da auditoria como fila |
| R-13 | **Localização em segundo plano** cortada pelo Android | Alta / Alto | Teste de campo do M5 com aparelho de economia agressiva; critério de troca de biblioteca medido |
| R-14 | **Decisões do dono no caminho crítico** (7, D-03) | Alta / Muito alto | Calendário da seção 6; o painel mostra a fatia bloqueada e por quê |

---

## 10. Esforço relativo por marco (resumo)

| Marco | Esforço | Observação |
|---|---|---|
| M2 publicação fechada | M | Metade é ação do dono no Easypanel |
| M3 S2 restante | G | Depende de 4 decisões e de uma visita à STTU |
| M4 S3 | M | F10 adianta a parte de geografia |
| M5 S4 | **GG** | O maior; F08 adianta contratos e UI em mock |
| M6 S5 | G | Gateway define o tamanho real |
| M7 S6 | G | Parte do admin já existe (candidaturas, 2FA, e-mail) |
| M8 S7 | G | Com advogado e contador |
| M8i iOS | M a G | Não estimável antes do primeiro build |
| M9 S8 | M | Duração definida pelo dono |
| M10 S9 | contínuo | — |

Nenhuma linha acima é prazo.
