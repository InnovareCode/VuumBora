# Plano do sistema VuumBora — do protótipo ao app em operação

Consolidado por Atlas em 20/11/2026, a partir de dois estudos feitos em paralelo:

| Anexo | Autoria | Conteúdo |
|---|---|---|
| [`plano-sistema-arquitetura.md`](plano-sistema-arquitetura.md) | Nova | Arquitetura, stack com opções, regras de backend, contratos de API, infra, custo, legal, fases S0–S9, riscos |
| [`plano-sistema-dados.md`](plano-sistema-dados.md) | Cronos | Modelo de dados, tabelas, índices, retenção, trade-offs de banco, ordem das migrações |

**Este documento é a fonte de verdade do plano.** Onde os dois anexos
divergiram, a arbitragem está na §13 e vale sobre o anexo. Os anexos continuam
valendo para o detalhe que aqui está resumido.

**Nada foi implementado.** Este é um plano.

---

## 1. O ponto de partida real

O VuumBora **não começa do zero.** Quem planejar em cima de "não existe nada"
vai refazer trabalho pago e já provado. O que existe hoje, versionado e no ar:

| Peça | Estado | Onde |
|---|---|---|
| Monorepo npm workspaces (Expo SDK 58, RN 0.88, React 19.3, TS 6) | funcionando | raiz |
| **API em produção** (Fastify 5 + Postgres + zod), migrações automáticas no boot sob advisory lock | **no ar** em `api.vuumbora.com.br` | `apps/api` |
| Site de pré-lançamento captando candidatura real de motorista | **no ar** em `vuumbora.com.br` | `apps/site/public` |
| App do passageiro: ~16 telas navegáveis com dado de demonstração | protótipo | `apps/passenger` |
| App do motorista: dashboard | protótipo | `apps/driver` |
| Design system (17+ componentes) e tokens derivados do JSON do kit | em uso | `packages/ui`, `packages/tokens` |
| Núcleo de domínio (dinheiro em centavos, ids com marca, `TripStatus`) | em uso | `packages/domain` |
| Portas tipadas UI↔dados, com `origin: mock \| real` obrigatório | em uso | `packages/api-client` |
| Guarda de arquitetura que quebra o build (HEX solto, cruzar perfis) | em uso | `scripts/check-boundaries.mjs` |

**O que isso muda no plano:** o backend não nasce — ele **cresce**. A API de
produção já tem formato de erro, CORS, limite de requisição, migração
automática e deploy. O trabalho é expandir esse serviço, não substituí-lo.

O protótipo (`PLANO.md`, fases 1 a 3) continua valendo e roda **em paralelo** a
este plano até a fase S4, quando os apps trocam o adaptador `mock` pelo `http`.

---

## 2. Escopo: MVP e pós-MVP

**MVP é o mínimo para uma corrida real acontecer em Natal, com dinheiro real,
de forma legal, segura e auditável — e para o dono operar isso sem abrir o
banco na mão.** Esta última parte é o que costuma ser esquecido: sem painel
admin não há MVP, há um app que só o programador consegue operar.

| Área | MVP | Pós-MVP |
|---|---|---|
| Conta | Login por celular com código; perfil; exclusão de conta | Google/Apple; conta única com dois papéis |
| Motorista | Cadastro etapa 2, aprovação manual, ficar online, oferta com destino visível, corrida completa, ganhos | Portal web, informe de rendimentos, navegação interna |
| Passageiro | Cotação, pedido, acompanhamento ao vivo, cancelamento, avaliação, histórico, recibo | Agendamento, carteira, indicação, cupom |
| Categorias | VuumBora, Conforto, Motorista mulher, Entrega, Pet | Moto (fora do lançamento, sem data) |
| Motorista favorito | Janela exclusiva com volta para a fila normal | Mais de um favorito, horário recorrente |
| Pagamento | Um provedor com split | Saque sob demanda, antecipação |
| Operação | Admin: candidaturas, documentos, corridas ao vivo, financeiro, suporte, tarifas, bloqueio, auditoria | Painéis analíticos, regras automáticas, B2B |
| Segurança | Compartilhar viagem, emergência, contato mascarado, antifraude básico | Prova de vida, gravação de áudio, pontuação de risco |
| Legal | Termos, privacidade, registro de acesso 6 meses, requisitos federais e de Natal | Módulo fiscal, outros municípios |

**Fora do MVP por decisão já tomada:** transferência de saldo entre usuários
(não fazer), carteira, indique e ganhe, agendamento — todos adiados em
`docs/decisoes-do-dono.md`.

---

## 3. Arquitetura

```
  App Passageiro   App Motorista   Admin web (SPA)   Site estático   Página de viagem compartilhada
   (Expo/RN)        (Expo/RN)       (React+Vite)      (HTML puro)      (link público)
        │ HTTPS+WSS      │ HTTPS+WSS       │ HTTPS+WSS      │ HTTPS           │ HTTPS
        └────────────────┴────────┬────────┴────────────────┴─────────────────┘
                                  ▼
        ┌──────────── apps/api — monólito modular (Fastify 5) ─────────────┐
        │ identidade · contas · motoristas · geografia · preço · corrida   │
        │ despacho · tempo real · pagamentos · ledger · notificações       │
        │ suporte · antifraude · admin · auditoria · LGPD                  │
        │ processo HTTP+WS   │   processo trabalhador de fila (mesmo código)│
        └──────────┬─────────┴────────┬──────────────┬─────────────────────┘
                   ▼                  ▼              ▼
            PostgreSQL(+PostGIS)    Redis       Armazenamento de objetos
            verdade: dinheiro,      efêmero:    documentos criptografados,
            corrida, auditoria,     posição,    backups
            FILA DE TRABALHOS       pub/sub,
                                    limites
  Externos: Mapbox · provedor de pagamento (a decidir) · WhatsApp/SMS · Expo Push · e-mail
```

### Três princípios inegociáveis

1. **O servidor é a fonte da verdade da corrida e do dinheiro.** O app propõe,
   o servidor decide. O app nunca calcula preço final, nunca muda estado de
   corrida sozinho, nunca confia no próprio cronômetro de oferta.
2. **Redis pode sumir sem perder dinheiro.** Dinheiro, estado de corrida,
   auditoria e trabalho agendado moram no Postgres. Redis guarda só o que se
   reconstrói em segundos.
3. **Um código, dois processos.** O mesmo `apps/api` sobe como servidor HTTP/WS
   e como trabalhador de fila. Separar processo é barato; separar código em
   microserviços, não — e não há problema aqui que justifique o custo.

### Stack, e por quê

| Camada | Escolha | Por que, e o que foi descartado |
|---|---|---|
| Apps mobile | **Expo + React Native**, Expo Router | Já é o stack do protótipo, com 17 telas prontas. Trocar jogaria fora trabalho provado. Nativo puro daria melhor localização em segundo plano, ao custo de dois times |
| UI dos apps | **`packages/ui` + tokens do design system** | Reaproveitamento total; o design system é a fonte de verdade (regra do projeto) |
| Admin | **SPA React + Vite** em `apps/admin` | Admin é dado denso, tabela e mapa — não é app de celular. **Não usa `packages/ui`** (componentes React Native); reaproveita tokens como variáveis CSS, mais `domain` e `api-client`. Next.js foi descartado: SSR não agrega em painel atrás de login |
| Backend | **`apps/api` cresce como monólito modular** (Fastify 5) | Já está em produção e provado. Módulos com fronteira clara; se um dia um módulo precisar escalar sozinho, ele sai — não antes |
| Fila de trabalhos | **Postgres** | Permite enfileirar na **mesma transação** que muda a corrida. Fila em Redis perderia trabalho num crash e exigiria conciliação |
| Tempo real | **WebSocket nativo** | Regra de ouro: *o WebSocket só avisa; quem dá o estado é o REST* |
| Banco | **PostgreSQL**, PostGIS para área de serviço (ver §13.1) | Já em produção, com migração automática |
| Mapa | **Mapbox** (já decidido pelo dono) | Rota e matriz calculadas **no servidor**, com cache — token do app não paga a conta de ninguém |

---

## 4. Modelo de dados de alto nível

Detalhe completo (colunas, índices, retenção) em
[`plano-sistema-dados.md`](plano-sistema-dados.md).

```
accounts ─┬─< account_roles
          ├─1:1─ drivers ──< vehicles ──> ride_categories (kind='base_tier')
          │         ├──< driver_documents
          │         ├──< driver_category_eligibility ──> ride_categories (kind='modifier')
          │         └──< driver_payouts ──< driver_payout_batches        [pós-MVP]
          ├──< places · notifications · fare_quotes
          ├──< passenger_favorite_drivers ──> drivers
          └──< trips
                   ├──> drivers · vehicles · ride_categories · fare_quotes
                   ├──< trip_events          (append-only: toda transição)
                   ├──< trip_location_pings  (trilha amostrada, 10–15 s)
                   ├──< trip_price_components(base, km, min, surge, taxa, repasse)
                   ├──1:1─ payments
                   └──1:1─ trip_ratings

admin_users ──< admin_audit_log        fraud_signals [pós-MVP]
support_tickets ──< support_messages   [pós-MVP]
```

**Cinco decisões de modelagem que carregam o sistema:**

1. **`admin_users` fica fora de `accounts`.** É fronteira de segurança: um bug
   de autorização em conta de passageiro nunca deve alcançar privilégio
   administrativo.
2. **Categoria não é coluna de preço, é filtro de quem pode atender.**
   `ride_categories.kind` separa `base_tier` (VuumBora, Conforto — elegibilidade
   automática pelo veículo) de `modifier` (Motorista mulher, Entrega, Pet —
   elegibilidade própria em `driver_category_eligibility`, por candidatura ou
   opt-in). A categoria pedida na corrida é independente do tier do veículo:
   um Pet pode ser atendido por um Conforto.
3. **Tarifa é versionada e imutável** (`fare_rule_versions`). Corrida concluída
   não pode ter preço recalculado porque a tabela mudou depois: o preço final
   referencia a **versão** usada na cotação, nunca "a regra atual".
4. **Atributo sensível mora na candidatura, não na entidade.** O gênero
   autodeclarado de quem se candidata a "Motorista mulher" fica isolado em
   `driver_category_eligibility.attributes`, nunca numa coluna de `drivers` que
   valeria para todo mundo. Minimização por desenho de schema.
5. **Dinheiro em centavos inteiros, data com fuso explícito, id UUID** — já
   fixado em `packages/domain` e seguido pelo banco.

**Armadilha registrada para a implementação:** "FK que só é válida se outra
coluna tiver certo valor" (veículo só referencia categoria `base_tier`;
candidatura só referencia `modifier`) **não** se expressa como FK simples no
Postgres. Resolver com trigger `BEFORE INSERT/UPDATE` — não confiar que o
código da aplicação respeite sozinho.

---

## 5. Contratos de API principais

Formato comum, **o mesmo já usado pela API em produção**:

```
sucesso: { "ok": true,  "data": { ... } }
erro:    { "ok": false, "error": { "code", "message", "fields"?, "reason"? } }
```

| HTTP | `code` | `ApiError.kind` no app |
|---|---|---|
| 400 | `invalid_body`, `validation` | `validation` |
| 401 / 403 / 404 | `unauthorized` / `forbidden` / `not_found` | idem |
| 409 | `conflict` + `reason` | `conflict` |
| 429 | `rate_limited` (+ `Retry-After`) | `rate_limited` |
| 503 / 500 | `unavailable` / `unknown` | idem |

`reason` de 409 previstos: `invalid_transition`, `offer_taken`, `offer_expired`,
`quote_expired`, `active_trip_exists`, `not_eligible`, `driver_not_approved`,
`payment_pending`.

**Regras transversais:** prefixo `/v1` (incompatível vira `/v2`);
`Idempotency-Key` **obrigatório** em pedir, cancelar, aceitar, chegar, iniciar,
concluir, cobrar e estornar; datas ISO 8601 com fuso; dinheiro como
`{ amountCents, currency: "BRL" }`; listas por cursor; `X-App-Version` com
`426` abaixo da versão mínima.

**Famílias de rota** (detalhe em [§6 do anexo](plano-sistema-arquitetura.md)):

| Família | Principais |
|---|---|
| Identidade | `POST /v1/auth/otp` · `/otp/verify` · `/refresh` · `/logout`; `GET/PATCH /v1/me`; `POST /v1/me/deletion` |
| Passageiro | `GET /v1/categories`; `POST /v1/quotes`; `POST /v1/trips`; `GET /v1/trips/:id`; `/cancel` · `/rating` · `/share` · `/sos`; `GET /v1/trips/:id/receipt`; `GET/PUT/DELETE /v1/favorite-driver` |
| Motorista | `POST /v1/driver/onboarding`; `/documents/upload-url` · `/submit`; `GET /v1/driver/verification`; `PUT /v1/driver/preferences` · `/availability`; `POST /v1/driver/offers/:id/accept` · `/decline`; `/trips/:id/arrived` · `/start` · `/complete` · `/cancel`; `GET /v1/driver/earnings` · `/payouts` |
| Tempo real | `GET /v1/realtime` (WS): `trip.updated`, `trip.driver_location`, `offer.created`, `offer.revoked`, `location.update`, `ops.trip` — todos com `seq` |
| Admin | `/v1/admin/*` com papel exigido por área: candidaturas e corridas [operacao], documentos [revisor_documentos], financeiro [financeiro], suporte [suporte], tarifas/categorias/LGPD/auditoria [owner] |
| Público | `POST /v1/waitlist` e `/driver-applications` (**já em produção, inalteradas**); `GET /v1/share/:token`; `POST /v1/account-deletion-requests` (exigência da Google Play); webhook do provedor; `GET /healthz` |

Dois detalhes que não são enfeite:

- **`GET /v1/favorite-driver` nunca devolve disponibilidade** do motorista. Só
  nome e foto. Expor "seu favorito está online" entrega a rotina de trabalho de
  uma pessoa a outra.
- **`engagedSeconds`** (do aceite à chegada ao destino) é medido desde o
  primeiro dia, porque o PLP 12/2024 mede remuneração por hora engajada. Se a
  lei passar, o dado já existe; se não passar, custou uma coluna.

---

## 6. As regras que definem o sistema

### 6.1 Estados da corrida

A máquina de estados vive **no servidor**, com `trip_events` append-only
registrando toda transição (quem, quando, por quê). Os apps apenas projetam o
status em fases visuais.

**Mudança necessária no domínio atual:** hoje, em `packages/domain`, o
cancelamento do motorista depois do aceite mata a corrida. Deve voltar para
`searching_driver` — o passageiro não tem culpa de o motorista desistir. Entra
no S0.

### 6.2 Despacho (matching)

**Sequencial: uma oferta por vez, com aceite atômico.** Ofertar para vários ao
mesmo tempo acelera a atribuição e cria atribuição dupla — o oposto do que um
sistema de dinheiro pode aceitar. A oferta **expira no servidor**; o contador
na tela do motorista não é fonte de verdade.

**Elegibilidade por categoria antes de qualquer ordenação:** só entra na fila
quem pode atender aquela categoria. E **corrida não muda de categoria sem o
passageiro concordar** — uma passageira que pediu Motorista mulher não recebe
outro motorista porque a espera ficou longa.

### 6.3 Motorista favorito

| Regra | Por quê |
|---|---|
| Só pode ser favoritado quem **já concluiu uma corrida** com o passageiro | Favorito não é um diretório de motoristas para procurar; é memória de quem já atendeu |
| O favorito recebe uma **oferta exclusiva de 15 s**; se não aceitar, a corrida vai para a fila normal **sem penalidade** | Preferência não pode virar espera invisível |
| O passageiro **nunca** vê se o favorito está disponível | Senão o app vira rastreador de rotina de trabalho |
| O motorista pode desligar `acceptsFavorite` | Favorito é relação de duas pontas |
| Contato sempre mascarado ou pela central; o sistema grava sinal de concentração de corridas no mesmo par | Favorito é o caminho natural para combinar corrida por fora da plataforma |

**Custo no tempo de atribuição:** no pior caso, uma janela de 15 s antes da
fila normal. Favorito indisponível ou distante: zero.

**Lacuna conhecida, não resolvida:** não há como o motorista bloquear um
passageiro específico que o favoritou — só desligar para todos. Vira item de
pós-MVP.

### 6.4 Preço, pagamento e repasse

- Cotação assinada pelo servidor, com validade; vencida dá `409 quote_expired`.
- Componentes do preço gravados separados: base, km, minuto, dinâmica, **taxa
  da plataforma** e **repasse ao motorista** — auditável linha a linha.
- Provedor com **split nativo** é exigência, não preferência.
- Nenhum dado de cartão passa pelo servidor do VuumBora.
- **A taxa do gateway pesa mais que toda a infraestrutura deste plano:** 1.000
  corridas/dia de R$ 20 por Pix custam ~R$ 6 mil/mês a 0,99%, e ~R$ 60 mil/mês
  a R$ 1,99 fixo por transação.

**Trava externa já assumida publicamente:** as regras de taxa e repasse serão
publicadas **antes** de o cadastro de motoristas abrir. Se o cadastro ficar
pronto e as regras não estiverem publicadas, **o cadastro espera**.

### 6.5 Antifraude básico e auditoria

MVP: GPS falso (`mocked`), concentração de corridas no mesmo par, cancelamento
em padrão suspeito, documento reapresentado. Toda ação de escrita do admin
grava em `admin_audit_log`; toda visualização de documento de motorista também.

---

## 7. Matriz de funcionalidades por perfil

**M** = MVP · **P** = pós-MVP · — = não se aplica

| Funcionalidade | App passageiro | App motorista | Admin web | Web público |
|---|---|---|---|---|
| Login por código no celular | M | M | — | — |
| Login admin com segundo fator | — | — | M | — |
| Login Google/Apple | P | P | — | — |
| Perfil e endereços salvos | M | M | — | — |
| Exclusão de conta | M | M | M (fila) | M (pedido) |
| Pré-cadastro do motorista (etapa 1) | — | — | M (análise) | **já no ar** |
| Cadastro completo e documentos (etapa 2) | — | M | M (análise) | — |
| Preferências (pet, entrega, favorito) | — | M | M (visão) | — |
| Candidatura a Motorista mulher | — | M | M (aprovação) | **já no site** |
| Ficar online/offline | — | M | M (visão) | — |
| Cotação por categoria | M | — | M (simulador) | — |
| Pedir corrida (VuumBora, Conforto, Motorista mulher, Pet) | M | — | — | — |
| Pedir entrega | M (se liberada pelo jurídico) | M | M | — |
| **Motorista favorito** | M | M (pode recusar) | M (sinais de risco) | — |
| Receber oferta com destino visível | — | M | — | — |
| Acompanhar corrida ao vivo | M | M | M (mapa ao vivo) | M (link) |
| Cancelar corrida | M | M | M | — |
| Navegação | — | M (app externo) / P (interna) | — | — |
| Pagamento | M | — | M (estorno) | — |
| Avaliar corrida | M | — (só passageiro avalia) | M (visão) | — |
| Histórico e recibo | M | M | M | — |
| Ganhos e repasses | — | M | M | P (portal) |
| Extrato e informe de rendimentos | — | P | P | P |
| Saque sob demanda | — | P | P | — |
| Suporte | M (abrir) | M (abrir) | M (atender) | — |
| Emergência e compartilhar viagem | M | M | M (alerta) | M (página) |
| Contato mascarado | M ou P | M ou P | — | — |
| Tarifas e categorias | — | — | M | — |
| Financeiro e conciliação | — | — | M | — |
| Antifraude e auditoria | — | — | M | — |
| Carteira, transferência, indicação, cupom | P / não fazer | — | P | — |
| Corrida agendada / Moto | decisão do dono / fora | decisão do dono / fora | — | — |

### O que é web e o que fica só no app

| Superfície | Decisão |
|---|---|
| **Site público** (`vuumbora.com.br`) | Já existe. Ganha só o que a lei e as lojas exigem: pedido de exclusão de conta pela web, termos, privacidade |
| **Página de viagem compartilhada** | Web, sem login, link com validade. É o destino do "compartilhar viagem" — não faz sentido exigir app de quem recebe |
| **Painel do motorista (web)** | **Pós-MVP.** O motorista trabalha no celular; portal web serve para extrato, informe de rendimentos e documentos em tela grande. Duplicar a operação da corrida na web não serve a ninguém |
| **Painel do passageiro (web)** | **Não fazer.** Histórico e recibo no app resolvem; um painel web seria a mesma tela, mantida duas vezes |
| **Admin** | Web, sempre. Nunca app |

---

## 8. Fases

Esforço relativo: **P** (dias) · **M** (1–2 semanas) · **G** (2–4 semanas) ·
**GG** (mais de 4 semanas), para a squad atual. **Não é prazo** — prazo é
decisão do dono.

```
S0 ─► S1 ─┬─► S2 ──────────────┐
          ├─► S3 ─► S4 ─► S5 ──┼─► S6 ─► S7 ─► S8 ─► S9
          └────────────────────┘
Protótipo (PLANO.md 1–3) corre em paralelo até S4, quando os apps trocam mock por http.
```

| # | Fase | Objetivo | Critério de aceite (resumo) | Depende de | Esforço |
|---|---|---|---|---|---|
| **S0** | Decisões e contratos | Congelar contratos para construir em paralelo | `npm run check` em 0 com os tipos novos; toda rota com entrada, saída e erros; toda porta com adaptador mock que as telas atuais consomem; decisões do dono com estado (respondida / adiada com data) | — | **M** |
| **S1** | Fundação do backend | A base de que tudo depende | Login real por código em homologação; token de renovação reutilizado revoga a família; 6ª tentativa recebe 429; **restauração de backup feita uma vez e documentada**; painel do Easypanel inacessível por HTTP; CI barra PR vermelho | S0, método de login | **G** |
| **S2** | Admin v0 e cadastro do motorista | O dono aprovar motorista sem abrir o banco | Motorista de teste vai de candidatura a aprovado sem passo fora do app e do admin; toda visualização de documento no `audit_log`; URL de documento expira em ≤5 min; papel `suporte` recebe 403 em documentos; documento vencido impede ficar online | S1, decisão 9 | **G** |
| **S3** | Geografia, categorias e preço | Cotação real e confiável no servidor | Mesma rota gera sempre a mesma cotação; mudar tarifa não altera cotação emitida; cotação vencida dá 409; **≥90% de 100 endereços reais de Natal encontrados**, ou plano alternativo definido | S1, decisão 7, categorias | **M** |
| **S4** | Núcleo da corrida | Corrida ponta a ponta entre dois celulares, sem dinheiro real | **Zero atribuição dupla em 1.000 pedidos** (50 motoristas, 20 simultâneos); oferta chega em p95 < 2 s; queda de rede de 30 s se recupera sozinha; favorito que recusa custa ≤ uma janela; Motorista mulher sem elegível **não** vai para outro sem consentimento; **10 corridas reais em ruas de Natal** com posição sem buraco > 30 s | S1, S3, protótipo | **GG** |
| **S5** | Pagamentos e repasse | Dinheiro real, conciliado ao centavo | 200 corridas em sandbox fecham **ledger = relatório do provedor ao centavo**; mesmo webhook 10 vezes gera um lançamento; assinatura inválida recusada e registrada; **nenhum dado de cartão no servidor** | S4, decisões 3/6/7/15 | **G** |
| **S6** | Operação no admin | O dono operar o dia a dia pela tela | Toda ação de escrita tem teste que confere a linha no `audit_log`; roteiro de operação executado **por quem não construiu o painel, sem ajuda**; nenhuma tela carrega dado de papel que o usuário não tem | S2, S4, S5 | **G** |
| **S7** | Segurança, LGPD e prontidão legal | Poder colocar gente de fora e dinheiro real | Zero achado crítico ou alto aberto (Órion); retenção apagando dado vencido em homologação; exclusão de conta provada; checklist legal assinado pelo advogado; builds aceitos no teste interno das lojas | S4, S5, S6 | **G** |
| **S8** | Beta fechado em Natal | Corrida real, gente real, escala controlada | ≥300 corridas pagas; conciliação 100% todo dia; ≥99% de sessões sem travamento; tempo até atribuição aceito pelo dono; nenhum incidente grave sem resolução em 24 h | S7, contas de loja | **M** |
| **S9** | Lançamento e pós-MVP | Abrir ao público sem refazer | Aprovado nas duas lojas; **RPO ≤15 min provado com restauração**; cada item pós-MVP vira missão com critério próprio | S8 | contínuo |

Entregáveis detalhados de cada fase: [§10 do anexo de arquitetura](plano-sistema-arquitetura.md).

**Ordem das migrações** (0003 a 0015, nenhuma trava produção porque nenhuma
destas tabelas existe ainda): [§5 do anexo de dados](plano-sistema-dados.md).

---

## 9. Infra, CI/CD e observabilidade

| Item | Decisão |
|---|---|
| Ambientes | Desenvolvimento local · **homologação** (não existe hoje — nasce no S1) · produção |
| Deploy | Easypanel no servidor do dono, contêiner, migração automática no boot |
| CI | `npm run check` + testes de integração contra Postgres e Redis **reais**; PR vermelho não entra |
| Observabilidade | Log estruturado **sem dado pessoal**, monitor **fora do servidor** (um monitor que mora na máquina que caiu não avisa nada), rastreio de erro, alerta com ação clara |
| Backup | Diário **fora do servidor**, com restauração testada ao menos uma vez — critério de aceite do S1, não promessa |

**Pendência de segurança aberta desde 18/11, que bloqueia dado sensível:**
HTTPS no painel do Easypanel.

### Custo estimado (R$/mês, preços públicos de nov/2026, dólar a R$ 5,50)

| Fase | Infra fixa |
|---|---|
| S0–S3 (construção) | **~R$ 30 a 90** |
| S4–S7 (homologação + teste interno) | **~R$ 80 a 200** |
| S8 (beta, ~50 motoristas) | **~R$ 200 a 700** |
| S9 (lançamento, ~1.000 corridas/dia) | **~R$ 800 a 3.300** |

Mais lojas: Apple ~R$ 545/ano e Google ~R$ 140 uma vez. **Não inclui** taxa do
provedor de pagamento, seguro, contador, advogado nem pessoal — e a taxa do
provedor é, de longe, o maior custo variável (§6.4).

---

## 10. LGPD e exigências legais

- **Base legal, finalidade e minimização** por tipo de dado; registro de
  operações e RIPD; fila de pedidos do titular no admin; exclusão de conta de
  ponta a ponta (dados pessoais removidos, ledger e fiscal mantidos e
  desidentificados).
- **Registro de acesso por 6 meses** (Marco Civil) — prazo **a confirmar com
  advogado**.
- **Documento de motorista** é o dado mais sensível do sistema: criptografado,
  URL assinada de 5 minutos, acesso auditado, papel mínimo, retenção curta para
  reprovados.
- **Natal já tem lei municipal** (vistoria anual na STTU, idade máxima do
  veículo, certidão do INSS) e **uma lei nova está sendo redigida**. Os PLPs
  12/2024 e 152/2025 não tinham sido votados até 21/10/2026.
- **Procurar a STTU antes do beta** — não depois.

⚠️ Nada aqui substitui advogado e contador. O que a pesquisa não confirmou em
fonte primária está marcado como tal no anexo (§13 de arquitetura).

---

## 11. Riscos com mitigação

| # | Risco | Prob./Impacto | Mitigação |
|---|---|---|---|
| R1 | Android mata a localização em segundo plano do motorista | Alta / Alto | Serviço em primeiro plano; **teste de campo no S4 com critério objetivo**; guia de bateria no app; trocar de biblioteca se falhar |
| R2 | Servidor único cai ou perde disco | Média / Muito alto | Backup externo + restauração testada; monitor externo; segundo servidor no S9 |
| R3 | Painel do Easypanel sem HTTPS | **Já existe** / Muito alto | Resolver no S1, antes de qualquer dado sensível |
| R4 | Pouco motorista no lançamento (ovo e galinha) | Alta / Muito alto | Pré-cadastro já captando; despacho que não depende de densidade; beta com área reduzida |
| R5 | Categoria de nicho com espera longa | Alta / Médio | `availability` na cotação; nunca rebaixar sem consentimento; métrica por categoria |
| R6 | Favorito usado para combinar corrida fora do app | Média / Médio | Só após corrida concluída; contato mascarado; sinal de par suspeito |
| R7 | Favorito expondo a rotina do motorista | Baixa / Alto | Passageiro nunca vê disponibilidade; motorista desliga e remove |
| R8 | Lei nova muda taxa, documento ou INSS | Média / Alto | Taxa e documentos configuráveis por categoria e município; medir hora engajada desde já; falar com a STTU |
| R9 | Entrega com enquadramento legal ou seguro diferente | Média / Alto | Categoria pronta no sistema, **desligada até parecer do advogado** |
| R10 | Gateway com taxa fixa alta em ticket baixo | Média / Alto | Comparação entregue ao dono; porta de pagamento permite trocar |
| R11 | Cadastro de motorista como recebedor demora no provedor | Média / Alto | Começar no S2, junto da aprovação de documentos |
| R12 | Busca de endereço do Mapbox fraca em Natal | Média / Médio | Teste de 100 endereços no S3; pino no mapa; POIs próprios |
| R13 | Vazamento de documento do motorista | Baixa / Muito alto | Criptografia, URL de 5 min, acesso auditado, retenção curta |
| R14 | Custo de Mapbox explode | Baixa / Médio | **Token restrito por app e domínio (pendência de 18/11)**; rota no servidor com cache; alerta de uso |
| R15 | Template de WhatsApp reprovado pela Meta | Média / Médio | Pedir aprovação no início do S1; SMS de reserva pronto |
| R16 | Recusa nas lojas (localização em segundo plano, exclusão de conta) | Média / Alto | Requisitos viram critério do S7; teste interno antes do beta |
| R17 | Escopo puxado pelo mockup (carteira, indicação) | Alta / Médio | **A matriz da §7 é o contrato de escopo. Mockup não é funcionalidade** |
| R18 | Equipe pequena, dono concentrando operação, suporte e servidor | Alta / Alto | Tudo que é operação vira tela; alerta com ação clara; guia de operação |
| R19 | White-label pronto seria mais rápido que construir | — | Registro honesto: existe fornecedor que entrega os três apps em semanas. A base já construída e o diferencial (franqueza, categorias próprias, atendimento local) dependem de controle — mas a escolha é do dono, de olhos abertos |

---

## 12. Como vamos saber que está indo bem

Uma coisa por fase, medida, não sentida:

| Fase | Número que importa |
|---|---|
| S1 | Backup restaurado uma vez, com tempo medido |
| S3 | % de endereços de Natal encontrados (meta ≥90%) |
| S4 | Atribuições duplas em 1.000 pedidos (meta: zero) e p95 da oferta |
| S5 | Diferença entre o ledger e o relatório do provedor (meta: zero centavo) |
| S6 | Alguém de fora da squad executa o roteiro de operação sem ajuda |
| S8 | Corridas pagas concluídas e dias com conciliação 100% |

---

## 13. Divergências entre os dois estudos, e como arbitrei

Nova e Cronos trabalharam em paralelo sem se ver. Divergiram em três pontos
reais. **Esta seção vale sobre os anexos.**

### 13.1 PostGIS: entra, mas não para o matching

Nova propôs PostGIS para áreas e zonas; Cronos recomendou não usar no MVP
(bounding box + haversine resolve uma cidade, e acrescentar depois é aditivo).

**Arbitragem:** os dois estão certos sobre coisas diferentes.
- **Área de serviço e zonas** (o endereço está dentro de Natal? qual zona de
  tarifa?) é ponto-em-polígono. Fazer isso na aplicação é reescrever PostGIS
  pior. → **PostGIS, desde o S3.**
- **"Motorista mais próximo"** com uma cidade e poucos motoristas simultâneos
  não precisa de índice GiST. → **bounding box + haversine**, e medir antes de
  trocar.

**Condição:** o Vulcano confirma no S1 que a extensão está disponível na imagem
Postgres do Easypanel e que ela sobrevive ao backup/restore. Se não estiver, o
plano B é polígono estático verificado na aplicação — o polígono de Natal é
pequeno e não muda.

### 13.2 Posição ao vivo: Redis, não tabela `UNLOGGED`

Cronos propôs tabela `UNLOGGED` (com Redis como alternativa se já existisse);
Nova já traz Redis na arquitetura para pub/sub do WebSocket e limites.

**Arbitragem: Redis**, porque ele já entra por outro motivo e um mecanismo a
menos vale mais que a micro-otimização. A trilha da corrida
(`trip_location_pings`, amostrada a 10–15 s) continua no Postgres, que é onde
ela precisa estar — é prova em disputa. Se o Redis atrasar no S1, a tabela
`UNLOGGED` é o paliativo, não o destino.

**O que não muda:** a **fila de trabalhos é Postgres**, não Redis — enfileirar
na mesma transação que muda a corrida é o ponto inteiro.

### 13.3 Elegibilidade da categoria Entrega

Cronos assumiu opt-in (como Pet); Nova registrou que Entrega fica desligada até
parecer jurídico.

**Arbitragem:** nenhuma suposição vai para o código. A estrutura nasce pronta,
a categoria nasce **desligada**, e o modo de elegibilidade entra quando o dono
responder (D-09 na §14). Suposição silenciosa em categoria com implicação legal
é como se cria dívida que ninguém lembra de ter assinado.

---

## 14. Decisões em aberto — são do dono, não da squad

Onde há recomendação, é **só** recomendação.

### Respondidas em 20/11/2026 (detalhe em [`decisoes-do-dono.md`](decisoes-do-dono.md))

| Tema | Resposta | O que ainda falta |
|---|---|---|
| **Papéis no painel** | Vários usuários da empresa, acesso **por setor e competência** (suporte, financeiro, operação, revisão de documentos, dono) | A lista de permissões por setor — proposta escrita, aguarda corte do dono |
| **Onde o painel roda** | **Mesmo servidor** da API e do site | Nada técnico: `SameSite=Lax` continua válido por serem subdomínios do mesmo domínio |
| **Taxa da plataforma** (decisão 7) | **20% a 25%**, variável por tempo de plataforma, corridas concluídas e nota — melhor motorista, menor taxa | **Os cortes exatos**, a frequência de recálculo, se a faixa pode piorar e o que vale para motorista novo. **Enquanto isso não existir, as regras não podem ser publicadas — e o cadastro de motorista não abre** |
| **Login dos apps** (D-07) | **E-mail/ID + senha**, login único e intransferível. Não será código por WhatsApp | Se o passageiro usa o mesmo método; recuperação de senha e verificação de e-mail |
| **Split no pagamento** (D-03) | **Sim, split nativo é exigência** | **Qual provedor** — agora com requisito novo: precisa aceitar percentual diferente por transação |

### Travam fase inteira

| # | Decisão | Trava | A considerar |
|---|---|---|---|
| D-01 | **Orçamento** mensal para infra por fase | Tamanho do servidor, homologação separada | Ordem de grandeza na §9 |
| D-02 | **Prazo** desejado para beta e lançamento | Paralelismo e corte de escopo | Sem prazo, a ordem segue por dependência |
| D-03 | **Gateway de pagamento** e meios aceitos (Pix, cartão, dinheiro) | S5 | Exigir split nativo; **olhar o custo do Pix em corrida de R$ 15–30**; validar com contador |
| D-04 | **Uma cidade ou várias** (só Natal ou região metropolitana) | S2, S3, S7 | Cada município pede levantamento legal próprio |
| D-05 | **Corrida agendada no MVP** | S4 | Recomendação anterior: depois do lançamento |
| **7** | **Tarifa, taxa da plataforma e repasse** (já aberta desde 18/11) | S3, S5 — e o **cadastro de motorista**, por compromisso público | A mais urgente das três |

### Decidem desenho

| # | Decisão | Trava |
|---|---|---|
| D-06 | Preço **fechado na cotação** ou pelo trajeto real | S3, S5 |
| D-07 | **Método de login**: código no celular ou senha | S1 |
| D-08 | **Motorista mulher**: quem pode pedir e qual o critério de elegibilidade | S2, S4 |
| D-09 | **Pet e Entrega**: taxa adicional, regras, itens proibidos; **Entrega só após parecer jurídico** | S3, S4 |
| D-10 | **Construir ou comprar** (white-label) | Tudo |
| D-11 | **Seguro APP**: plataforma contrata ou exige do motorista | S7 |
| D-12 | **Código de embarque (PIN)** para iniciar a corrida | S4 |
| D-13 | **Onde guardar documentos e backups** (Brasil ou exterior) | S1, S2 |
| D-14 | **Homologação** no mesmo servidor ou em outro | S1 |
| D-15 | **Horário de atendimento** da central | S4, S6 |

### Herdadas e ainda abertas (`docs/decisoes-do-dono.md`)

6 (saque) · 8 (login social) · 9 (verificação de documentos) · 10 (navegação) ·
11 (canal de suporte) · 15 (regras de cancelamento) · 17 (contas de loja).

### Levantadas pelo modelo de dados

- **Base legal (LGPD) para o gênero autodeclarado** na candidatura a Motorista
  mulher — orientação jurídica, não decisão técnica.
- **Motorista bloquear um passageiro específico** que o favoritou: hoje não
  existe, só desligar para todos. Vale produto?
- **Política de backup do Postgres no Easypanel**: não existe nem foi testada
  hoje. Proposta mínima no anexo; executar e confirmar é com o Vulcano.

---

## 15. Por onde começar

**S0 é o único começo que não gera retrabalho**, porque congela os contratos e
deixa Vega (API), Lyra (admin e apps) e Cronos (banco) trabalhando em paralelo
sem colidir. Dentro do S0, três coisas que já podem andar sem nenhuma resposta
do dono:

1. Contratos da §5 viram tipos e esquemas no `api-client`, com adaptador mock.
2. Correção da máquina de estados (cancelamento do motorista volta para busca).
3. `docs/decisions.md` D-11 registrado como **Mapbox, aceita**.

E três que **dependem de resposta** antes de começar: método de login (D-07,
trava o S1), tarifa e repasse (decisão 7, trava o S3 e o cadastro de motorista)
e gateway (D-03, trava o S5 — e o cadastro do motorista como recebedor começa
lá no S2, então ela chega antes do que parece).

**Duas pendências de segurança não esperam fase nenhuma:** HTTPS no painel do
Easypanel, e restringir o token do Mapbox por app e domínio.
