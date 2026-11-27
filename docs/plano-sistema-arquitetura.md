# VuumBora: arquitetura e plano faseado do sistema real

Escrito por Nova (arquitetura) em 20/11/2026. Isto é **planejamento**: nenhum
código foi escrito nesta entrega.

**Relação com o `PLANO.md`:** o `PLANO.md` organiza o protótipo (fases 1 a 3) e
deixa a "Fase 5" como um bloco que espera decisões. Este documento abre esse
bloco e desenha o sistema que roda corrida de verdade. Para não confundir com a
numeração do `PLANO.md`, as fases daqui se chamam **S0 a S9** ("S" de sistema).
As fases 1 a 3 do protótipo continuam valendo e rodam em paralelo com S0 a S3.

**O que já está decidido e este documento não reabre:** Expo Router, npm
workspaces, dois apps separados, tokens vindos do JSON, portas e adaptadores
com `mode` obrigatório (D-01 a D-10 em `docs/decisions.md`), **Mapbox** (decisão
1 do dono), **Easypanel no servidor do dono**, a API Fastify 5 + pg + zod já em
produção, o **destino visível para o motorista antes do aceite**, a regra de que
**só o passageiro avalia**, o pré-cadastro do motorista em **duas etapas**, e o
compromisso público de **publicar taxa e repasse antes de abrir o cadastro de
motoristas**.

**O que este documento NÃO decide:** orçamento, prazo, gateway de pagamento,
uma cidade ou várias, corrida agendada no MVP, e as outras escolhas listadas em
[Decisões do dono](#12-decisões-que-são-do-dono). Onde uma decisão dessas muda
a arquitetura, o desenho deixa o ponto configurável em vez de escolher.

---

## Sumário

1. [Contexto e hipóteses](#1-contexto-e-hipóteses)
2. [Escopo: MVP e pós-MVP](#2-escopo-mvp-e-pós-mvp)
3. [Visão geral da arquitetura](#3-visão-geral-da-arquitetura)
4. [Stack por camada, com opções](#4-stack-por-camada-com-opções)
5. [Backend: módulos e regras](#5-backend-módulos-e-regras)
6. [Contratos de API](#6-contratos-de-api)
7. [Infraestrutura, CI/CD, observabilidade e custo](#7-infraestrutura-cicd-observabilidade-e-custo)
8. [LGPD e exigências legais](#8-lgpd-e-exigências-legais)
9. [Matriz de funcionalidades por perfil](#9-matriz-de-funcionalidades-por-perfil)
10. [Plano faseado S0 a S9](#10-plano-faseado-s0-a-s9)
11. [Riscos e mitigações](#11-riscos-e-mitigações)
12. [Decisões que são do dono](#12-decisões-que-são-do-dono)
13. [Fontes consultadas](#13-fontes-consultadas)

---

## 1. Contexto e hipóteses

Não há números do dono para escala, prazo ou orçamento. As hipóteses abaixo
são minhas e estão declaradas para poderem ser derrubadas. Se alguma mudar,
as seções marcadas mudam junto.

| Dimensão | Hipótese | O que ela decide no desenho |
|---|---|---|
| Maturidade | MVP transacional em uma região, depois operação | Monólito modular, um servidor, nada de microsserviço |
| Região | Natal e região metropolitana (decidido em 19/11 para o site) | Área de serviço como polígono configurável; regras por município ficam em tabela |
| Escala no beta | 30 a 80 motoristas, algumas centenas de passageiros | Um servidor aguenta com folga |
| Escala no primeiro ano | até ~500 motoristas, ~10 mil passageiros, ~1.000 corridas/dia, pico de ~100 corridas simultâneas | Ainda um servidor de aplicação; banco no mesmo servidor com backup externo |
| Equipe | squad de agentes + dono; o dono opera servidor, suporte (WhatsApp atendido por pessoa de Natal) e aprovação | Poucas peças móveis; tudo que for operação vira tela no painel admin, não script |
| Orçamento | pequeno e não informado | Plano gratuito sempre que existir; custo cresce por fase |

**Limite superior desta arquitetura:** acima de ~5 mil corridas/dia ou de mais
de uma região metropolitana, o desenho continua válido, mas o servidor único
deixa de ser aceitável (ver S9 e o risco R2).

---

## 2. Escopo: MVP e pós-MVP

**Definição de MVP aqui:** o mínimo para uma corrida real acontecer em Natal,
com dinheiro real, de forma legal, segura e auditável, e para o dono operar
isso sem abrir o banco na mão.

| Área | MVP | Pós-MVP |
|---|---|---|
| Conta | Login por celular com código; perfil; exclusão de conta | Login Google/Apple (decisão 8); conta única com dois papéis |
| Motorista | Etapa 2 do cadastro (documentos, veículo), aprovação manual, ficar online, receber oferta com destino visível, corrida completa, ganhos | Portal web do motorista, extratos e informe de rendimentos, navegação dentro do app |
| Passageiro | Cotação, pedido, acompanhamento em tempo real, cancelamento, avaliação, histórico, recibo | Agendamento (decisão 14), carteira (4), indicação (12), cupons |
| Categorias | VuumBora, Conforto, Motorista mulher, Entrega, Pet (confirmadas pelo dono em 20/11/2026) | Moto (fora do lançamento, sem data) |
| Motorista favorito | Preferência por favorito com janela exclusiva e volta para a fila normal (§5.4) | Lista com mais de um favorito, horário recorrente |
| Pagamento | Um provedor com split; meios a decidir (Pix, cartão, dinheiro) | Saque sob demanda, antecipação, carteira |
| Operação | Painel admin: candidaturas, documentos, corridas ao vivo, financeiro básico, suporte, tarifas, bloqueio, auditoria | Painéis analíticos, regras automáticas de qualidade, B2B corporativo |
| Segurança | Compartilhar viagem, botão de emergência, contato mascarado ou via central, antifraude básico | Selfie com prova de vida, gravação de áudio, antifraude por pontuação |
| Legal | Termos, política de privacidade, registro de acesso por 6 meses, requisitos do motorista da lei federal e de Natal | Módulo fiscal (NFS-e da taxa), outros municípios |

**Nota sobre B2B:** o Decreto 13.347/2025 de Natal autoriza a Prefeitura a
contratar transporte institucional por aplicativo via credenciamento. É uma
porta de receita para depois; não entra no MVP, mas o modelo de dados não deve
impedir uma conta corporativa pagando corridas de várias pessoas.

---

## 3. Visão geral da arquitetura

```
                ┌──────────────── Clientes ─────────────────┐
  App Passageiro (Expo)   App Motorista (Expo)   Admin web (SPA)   Site (estático)   Página pública de viagem compartilhada
        │ HTTPS + WSS            │ HTTPS + WSS          │ HTTPS + WSS      │ HTTPS          │ HTTPS
        └────────────┬───────────┴──────────┬───────────┴──────────────────┴────────────────┘
                     ▼                      ▼
        ┌──────────────────── apps/api (monólito modular, Fastify 5) ───────────────────┐
        │ identidade · contas · motoristas · geografia · preço · corrida · despacho    │
        │ tempo real · pagamentos · ledger · notificações · suporte · antifraude      │
        │ admin · auditoria · LGPD                                                      │
        │ HTTP + WebSocket   │   trabalhadores de fila (mesmo código, processo à parte) │
        └────────┬───────────┴─────────┬──────────────────┬───────────────────────────┘
                 ▼                     ▼                  ▼
           PostgreSQL + PostGIS      Redis            Armazenamento de objetos
           (verdade: dinheiro,      (efêmero: posição   (documentos do motorista,
            corrida, auditoria,      ao vivo, pub/sub,   criptografados; backups)
            fila de trabalhos)       limites)
                 │
   Externos: Mapbox (mapa, rota, matriz) · provedor de pagamento (decisão do dono) ·
             WhatsApp/SMS (código de login) · Expo Push · e-mail transacional
```

**Três princípios que sustentam o desenho:**

1. **O servidor é a fonte da verdade da corrida e do dinheiro.** O app propõe,
   o servidor decide. O app nunca calcula preço final, nunca muda estado de
   corrida por conta própria, nunca acredita no próprio cronômetro de oferta.
2. **Redis pode sumir sem perder dinheiro.** Tudo que é dinheiro, estado de
   corrida, auditoria e trabalho agendado mora no Postgres. Redis guarda só o
   que se reconstrói em segundos: posição atual do motorista, canais de tempo
   real e contadores de limite.
3. **Um código, dois processos.** O mesmo `apps/api` sobe como servidor HTTP/WS
   e como trabalhador de fila (expiração de oferta, notificações, conciliação,
   retenção). Separar processo é barato; separar código em serviços não é.

---

## 4. Stack por camada, com opções

### 4.1 Apps mobile (passageiro e motorista)

A base está decidida (Expo SDK 58, Expo Router, CNG, `packages/ui`,
`packages/tokens`). O que falta decidir é o que entra **em cima** dela para o
sistema real.

**Tempo real no app**

| Opção | Prós | Contras |
|---|---|---|
| **WebSocket nativo** (`WebSocket` do RN + protocolo próprio fino) | Nada a instalar no app; casa com `@fastify/websocket`; protocolo pequeno e testável | Reconexão, ping e reenvio são nossos |
| Socket.IO | Reconexão e salas prontas | Protocolo próprio dos dois lados; mais peso; mais um ponto de versão a casar |
| Só polling HTTP | O mais simples | Oferta de corrida com 15 s de validade não tolera atraso de polling; bateria |

**Recomendação:** WebSocket nativo, com uma regra que simplifica tudo:
**o WebSocket só avisa, a verdade vem do REST.** Ao reconectar, o app chama
`GET /v1/trips/:id` e reconstrói o estado. Assim, perder uma mensagem nunca
deixa o app num estado errado; no máximo atrasa.

**Localização do motorista em segundo plano**

| Opção | Prós | Contras |
|---|---|---|
| **`expo-location` + `expo-task-manager`** com serviço em primeiro plano no Android | Gratuito, mantido pela Expo, plugin de config pronto | Fabricantes Android com economia agressiva de bateria matam o processo; precisa de teste em aparelho real |
| Biblioteca comercial de geolocalização em segundo plano | Mais resistente a corte do sistema, filtro de movimento pronto | Licença paga por app; mais uma dependência nativa |

**Recomendação:** começar com `expo-location`. Critério de troca objetivo:
se o teste de campo do S4 mostrar perda de posição por mais de 30 s em mais de
5% das corridas em aparelhos comuns em Natal, avaliar a comercial.

**Notificações push:** Expo Push (gratuito, um só endpoint para iOS e Android)
atrás de uma porta `PushPort`, para poder ir direto ao FCM/APNs depois sem
mudar tela nenhuma.

**Navegação passo a passo do motorista:** recomendação já registrada na
decisão 10: abrir Waze ou Google Maps por link no MVP. O SDK de navegação do
Mapbox fica como opção pós-MVP (cobrança por viagem e por usuário ativo).

**Reaproveitamento de `packages/ui`:** os 17+ componentes atuais servem aos dois
apps. Componente de um perfil só continua no app (D-04). Formulários com React
Hook Form + Zod, estado remoto com TanStack Query, como D-10 já previa. Os
mesmos esquemas Zod de entrada podem morar num pacote compartilhado com a API
(ver 4.3) para o app e o servidor validarem igual.

**Atualização e build:** EAS Build e EAS Submit para lojas, EAS Update para
correção de JS sem passar pela loja, com dois canais (`preview` para o beta,
`production`). Plano gratuito no início; ver custo em 7.5.

### 4.2 Painel admin web

O admin é uma ferramenta interna densa: tabelas, filtros, visualizador de
documento, mapa ao vivo. Não precisa de SEO nem de renderização no servidor.

| Opção | Prós | Contras |
|---|---|---|
| **A. SPA React + Vite** (TanStack Router, Query e Table; Mapbox GL JS; tokens convertidos em variáveis CSS a partir do mesmo JSON) | Estático: um contêiner nginx no Easypanel, sem servidor Node; reaproveita `@vuumbora/domain`, `@vuumbora/api-client` e os tokens; toda autorização fica na API | Componentes de tabela e formulário web feitos ou escolhidos por nós (não dá para usar `packages/ui`, que é React Native) |
| B. Next.js (App Router) | Ecossistema grande, rotas por pasta | Traz um servidor Node a mais para manter sem ganho real: admin não precisa de SSR; tentação de pôr regra de negócio no servidor do Next, duplicando a API |
| C. Expo Router web reaproveitando `packages/ui` | Máximo reaproveitamento visual | React Native Web é fraco para tabela densa, atalho de teclado e layout de mesa; o admin ficaria com cara e ergonomia de celular |

**Recomendação: A.** Se a equipe quiser acelerar o CRUD repetitivo
(candidaturas, usuários, tarifas), dá para usar um framework de admin sobre o
próprio Vite (Refine ou React-Admin) nessa mesma opção; isso é escolha de
implementação da Lyra, não muda o contrato. Mora em `apps/admin`, servido em
`admin.vuumbora.com.br`, atrás de login com segundo fator obrigatório.

### 4.3 Backend

| Opção | Prós | Contras |
|---|---|---|
| **A. Monólito modular em `apps/api`** (Fastify 5, pg, zod; Postgres com PostGIS; Redis; fila em Postgres) | Já está em produção e provado (migração no boot com trava, rate limit, erro padronizado); um deploy; transação única cobrindo corrida e dinheiro; a equipe já conhece | Tempo real, fila e despacho são nossos para construir e testar |
| B. Backend como serviço (Supabase hospedado ou Firebase) | Login, tempo real e armazenamento prontos | A regra que importa (despacho, transição de estado, split, ledger) vai parar em funções soltas; Firebase põe dado fora do Brasil (transferência internacional na LGPD); aprisiona; joga fora o que já existe |
| C. Serviços separados (API, despacho, tempo real em outra linguagem) | Escala independente | Superdimensionado para ~100 corridas simultâneas; triplica deploy, observabilidade e pontos de falha |

**Recomendação: A**, crescendo o `apps/api` atual por módulos
(`src/modules/<modulo>/{rotas,servico,repositorio}`), mantendo o padrão já
usado (rota → serviço → repositório).

Peças específicas:

| Necessidade | Escolha recomendada | Alternativa | Por quê |
|---|---|---|---|
| Acesso a dados | Manter `pg` + SQL versionado (padrão atual), com consultas tipadas | Kysely (construtor de consulta tipado) | O que existe funciona e está provado; Kysely só se a tipagem manual virar fonte de erro. Decisão do Cronos |
| Geografia | PostGIS para área de serviço, zonas e trilha da corrida; Redis GEO para "motoristas perto agora" | Só Redis GEO | Polígono de município e zona de tarifa são consultas de verdade, não de cache |
| Fila de trabalhos | Fila no Postgres (pg-boss ou equivalente) | BullMQ no Redis | Enfileirar na **mesma transação** que muda a corrida elimina o "mudou o estado e o trabalho se perdeu". Redis fica efêmero (princípio 2) |
| Tempo real | `@fastify/websocket` + Redis pub/sub para espalhar entre instâncias | Socket.IO | Ver 4.1 |
| Contrato compartilhado | Esquemas Zod de entrada/saída num pacote compartilhado (ex.: `packages/contracts`), consumidos pela API e pelo `api-client` | Gerar OpenAPI a partir das rotas | Hoje a API não importa pacote interno (Dockerfile autossuficiente); incluir um pacote de contrato exige ajustar o contexto do Docker. Vale o custo: tira a duplicação de tipos entre app e servidor |

### 4.4 Painéis web de passageiro e motorista

**Princípio:** o produto é o app. Só vai para a web o que é obrigação, o que se
faz melhor sentado, ou o que precisa funcionar para quem não tem o app.

| Item | Onde | Quando | Por quê |
|---|---|---|---|
| Pedido de exclusão de conta | **Web** (página pública) e também no app | MVP | A Google Play exige um link web para pedir exclusão da conta; a Apple exige a exclusão dentro do app. Os dois |
| Página da viagem compartilhada | **Web** (link com token, expira ao fim da corrida) | MVP | Quem recebe o link não tem o app |
| Recibo da corrida | E-mail + app | MVP | Não precisa de painel |
| Pré-cadastro do motorista (etapa 1) | Site (já existe) | Já no ar | Mantido |
| Cadastro completo do motorista (etapa 2: documentos, veículo) | **App do motorista** | MVP | Câmera do celular para foto de documento; não duplicar na web |
| Extrato, informe de rendimentos, documentos do motorista | Portal web do motorista | Pós-MVP | Útil para imposto de renda e contador, mas não bloqueia corrida |
| Histórico e recibos do passageiro na web | Não fazer | — | Sem motivo para duplicar o app |
| Pedir corrida pela web | Não fazer no MVP | Pós-MVP, se B2B | Só faz sentido para conta corporativa |

---

## 5. Backend: módulos e regras

### 5.1 Módulos

| Módulo | Responsabilidade | Tabelas principais (proposta para o Cronos) |
|---|---|---|
| identidade | Código por WhatsApp/SMS, sessão, renovação, dispositivo, papéis | `users`, `user_roles`, `otp_challenges`, `sessions`, `devices` |
| contas | Perfil do passageiro, endereços salvos, exclusão | `passenger_profiles`, `saved_places` |
| motoristas | Candidatura (já existe), etapa 2, veículo, documentos, elegibilidade por categoria, preferências (pet, entrega) | `driver_applications` (existente), `drivers`, `vehicles`, `driver_documents`, `driver_category_eligibility` |
| geografia | Área de serviço por município, zonas de tarifa, consulta Mapbox no servidor | `service_areas`, `pricing_zones` |
| preço | Tabelas de tarifa versionadas por categoria e área, cotação assinada | `categories`, `fare_tables`, `quotes` |
| corrida | Máquina de estados no servidor, eventos, cancelamento, avaliação, favorito | `trips`, `trip_events`, `ratings`, `favorite_drivers` |
| despacho | Escolha de motorista, ofertas, expiração, favorito | `trip_offers` |
| tempo real | Conexões WS, canais por corrida e por motorista | (Redis) |
| localização | Posição ao vivo, trilha da corrida | Redis GEO; `trip_location_points` |
| pagamentos | Porta do provedor, cobrança, webhook, reembolso | `payments`, `payment_events` |
| ledger | Lançamentos imutáveis em centavos, repasses | `ledger_entries`, `payouts` |
| notificações | Push, e-mail, WhatsApp | `notifications` |
| suporte | Chamados ligados à corrida | `support_tickets`, `support_messages` |
| antifraude | Regras, sinais, bloqueios | `risk_signals`, `blocks` |
| auditoria e LGPD | Ação de admin, registro de acesso (6 meses), pedidos do titular, retenção | `audit_log`, `access_log`, `privacy_requests` |

Convenções que valem para todas (já definidas no domínio e no
`ARQUITETURA_E_REGRAS.md`): UUID, `timestamptz` sempre, dinheiro em centavos
inteiros com moeda, separação entre **estimativa**, **tarifa final**, **taxa da
plataforma** e **repasse ao motorista**.

### 5.2 Estados da corrida

O `TripStatus` de `@vuumbora/domain` continua sendo o status canônico. Proposta
de transições **no servidor** (o app já tem a máquina dele, que só projeta):

| De | Para | Quem dispara | Observação |
|---|---|---|---|
| `requested` | `searching_driver` | sistema | Imediato após gravar e (se for o caso) autorizar pagamento |
| `searching_driver` | `driver_assigned` | motorista (aceite) | Aceite atômico: só um vence; os outros recebem `conflict` |
| `searching_driver` | `failed` | sistema | Nenhum motorista no tempo máximo de busca |
| `searching_driver`, `driver_assigned`, `driver_en_route`, `driver_arrived` | `cancelled` | passageiro, motorista, admin, sistema | Sempre com `actor` e `reason`; taxa de cancelamento conforme decisão 15 |
| `driver_assigned` | `driver_en_route` | sistema | Pode ser automático no aceite; mantido separado para o app mostrar "a caminho" |
| `driver_en_route` | `driver_arrived` | motorista | Validar distância do embarque (antifraude) |
| `driver_arrived` | `in_progress` | motorista | Código de embarque obrigatório (D-12, decidido pelo dono em 22/11/2026: PIN em todas as categorias) |
| `in_progress` | `completed` | motorista | Calcula tarifa final, grava ledger, dispara cobrança |
| **`driver_assigned`, `driver_en_route`** | **`searching_driver`** | **motorista cancela** | **Lacuna no domínio atual:** hoje cancelamento do motorista mata a corrida. Proposta: volta para a busca, sem o passageiro refazer o pedido. Mudança de contrato para Vega + Cronos |

Regras:
- Toda transição grava um `trip_events` (de, para, ator, motivo, chave de
  idempotência, instante) na **mesma transação** que muda `trips.status`.
- Transição feita com `UPDATE ... WHERE id = $1 AND status = $esperado`; zero
  linhas afetadas vira `409 conflict` com `reason: invalid_transition`.
- `Entrega` usa os mesmos estados; `completed` exige o código de entrega
  informado por quem recebe (ver 5.3).

### 5.3 Categorias: elegibilidade, não só preço

As cinco categorias do lançamento não são cinco tabelas de preço; cada uma é um
**filtro de elegibilidade** sobre motorista, veículo e preferência:

| Categoria | Quem pode atender | Filtro no despacho | Pontos a decidir pelo dono |
|---|---|---|---|
| VuumBora (padrão) | Motorista aprovado com veículo dentro da lista padrão | `vehicle.level >= padrao` | Um carro Conforto pode atender VuumBora? (recomendação: sim, amplia oferta) |
| Conforto | Veículo classificado como Conforto na aprovação | `vehicle.level = conforto` | Critério objetivo (ano, modelo, espaço) |
| Motorista mulher | Motorista que se candidatou à categoria e teve a candidatura aprovada | `driver.category_eligibility` contém `mulher` | Quem pode pedir (só passageira ou qualquer pessoa); critério de elegibilidade e como verificar |
| Entrega | Motorista que optou por aceitar entrega | `driver.prefs.accepts_delivery` | Itens proibidos, limite de valor/tamanho, responsabilidade por extravio |
| Pet | Motorista que optou por aceitar pet | `driver.prefs.accepts_pets` | Taxa adicional? Regras de caixa de transporte e porte |

Consequências de arquitetura:
- **Nunca rebaixar categoria sem consentimento.** Se não houver motorista mulher
  disponível, a corrida não vai para outro motorista sozinha: o app pergunta à
  passageira se ela aceita a categoria padrão. O mesmo para Pet.
- **Oferta pequena significa espera maior.** Motorista mulher e Pet terão menos
  motoristas elegíveis; a cotação deve devolver a disponibilidade estimada
  (`availability: high | low | none`) para o app avisar antes do pedido.
- **Entrega muda o fluxo, não só o filtro:** corrida com `kind: delivery`, sem
  passageiro a bordo; dados de quem recebe (nome e telefone mascarado), código
  de entrega para fechar a corrida, foto opcional de comprovação. O seguro APP
  cobre **passageiro**, não carga; e transporte de encomenda pode ter
  enquadramento legal diferente do transporte de passageiro. **Validar com
  advogado antes de ligar a categoria.**
- **Elegibilidade para Motorista mulher é dado pessoal com risco de
  discriminação.** Guardar só o resultado da aprovação (elegível sim/não), não
  um campo genérico de gênero exposto em consultas; acesso restrito no admin;
  critério escrito e aplicado igual a todas as candidaturas.

### 5.4 Despacho (matching)

**MVP: oferta sequencial, uma por vez.** Com destino visível e frota pequena,
mandar a mesma corrida para vários motoristas ao mesmo tempo gera corrida de
quem clica primeiro e frustração. Sequencial é mais justo e mais fácil de
auditar.

Algoritmo do MVP:
1. Filtra: motoristas `online`, sem corrida ativa, dentro da área de serviço,
   **elegíveis à categoria** (5.3), sem bloqueio, com posição atualizada há
   menos de 30 s.
2. Pega os N mais próximos em linha reta (Redis GEO, N ≈ 10, raio inicial 3 km
   ampliando até um teto).
3. Calcula o tempo real até o embarque dos N com **uma** chamada à Matrix API do
   Mapbox no servidor.
4. Ordena por tempo até o embarque, desempatando por quem está há mais tempo sem
   corrida (distribuição justa).
5. Oferece ao primeiro, com validade definida pelo servidor (proposta: 15 s,
   configurável). Expirou ou recusou, oferece ao próximo. A expiração é um
   trabalho agendado na fila, não um `setTimeout` em memória.
6. Sem aceite em T máximo (proposta: 3 min, configurável), a corrida vai para
   `failed` e o passageiro é avisado.

**Aceite atômico:** `UPDATE trips SET driver_id = $m, status = 'driver_assigned'
WHERE id = $t AND status = 'searching_driver' AND current_offer_id = $o`. Zero
linhas é `409` com `reason: offer_taken` ou `offer_expired`. Isso garante que
nunca há duas atribuições, mesmo com duas instâncias da API.

**Seletividade por destino visível** (registrada em 18/11): o despacho guarda
toda recusa com motivo e destino. A regra de consequência (taxa mínima de
aceitação, prioridade) fica para quando houver dado, mas o dado precisa existir
desde o primeiro dia.

#### Motorista favorito

Pedido do dono em 20/11/2026: o passageiro escolhe um motorista favorito e, se
ele estiver disponível, a corrida vai para ele.

**Como entra no despacho:**

| Regra | Proposta | Por quê |
|---|---|---|
| Quem pode ser favorito | Só um motorista com quem o passageiro já fez corrida concluída | Impede que alguém marque um desconhecido para rastreá-lo, e reduz conta falsa feita só para "puxar" corrida |
| Quantos | Um favorito no MVP | Mantém a janela de espera previsível |
| Quando tenta | Se o favorito está `online`, livre, elegível à categoria pedida e com tempo até o embarque abaixo de um teto (proposta: 10 min, e no máximo 2× o tempo do motorista mais próximo) | Favorito do outro lado da cidade faz o passageiro esperar mais e o motorista rodar vazio |
| Janela exclusiva | Uma oferta só para o favorito, com a validade normal (15 s) | É a única forma de "ir para ele" sem competir com a fila |
| Fallback | Recusou, expirou ou não estava disponível: entra na fila normal (passos 1 a 6) **sem penalidade** e sem perguntar de novo ao passageiro | A corrida não pode depender da sorte de o favorito estar olhando o celular |
| Recusa do favorito | Não conta na taxa de aceitação | O motorista não deve ser punido por ter sido escolhido |
| Privacidade | O passageiro **não vê** se o favorito está online; vê só "seu favorito não pôde atender, buscando outro motorista" | Mostrar disponibilidade em tempo real permite vigiar a rotina de uma pessoa |
| Saída do motorista | O motorista pode desligar "aceito ser favorito" e remover quem o favoritou | Proteção contra assédio |

**Efeito no tempo de atribuição:** no pior caso, a corrida de quem tem favorito
demora **uma janela de oferta a mais** (≈15 s) para começar a fila normal. Para
não piorar o caso comum, a janela só é aberta quando o favorito passa no filtro
de disponibilidade e distância; quando não passa, o custo é zero. Métrica a
acompanhar desde o beta: tempo até a atribuição, com e sem favorito, e taxa de
aceite do favorito. Se a taxa de aceite ficar baixa, a janela vira custo puro e
deve encurtar.

**Risco de combinação fora da plataforma (antifraude):** o favorito facilita que
passageiro e motorista combinem corridas "por fora", ou que usem o app só para
se encontrar e depois cancelem. Sinais que o antifraude grava desde o MVP:

- corrida com favorito cancelada depois de `driver_arrived` (encontro feito,
  corrida não paga), repetidas vezes com o mesmo par;
- embarque pedido exatamente onde o motorista já está parado (os dois já estão
  juntos);
- corrida concluída muito curta, repetida entre o mesmo par (lavagem de bônus
  ou de avaliação);
- o motorista fica offline logo após um cancelamento com o mesmo passageiro;
- muitas contas novas favoritando o mesmo motorista.

Mitigações de desenho: **contato sempre mascarado ou pela central** (sem
telefone pessoal exposto, o "me chama no zap" fica mais difícil), limite de
cancelamentos por par antes de suspender a preferência por favorito para
aquele par, e revisão manual no painel admin quando um par cruzar os limites.
Nenhuma dessas regras pune automaticamente no MVP: elas geram alerta para uma
pessoa olhar.

### 5.5 Tempo real e localização

- **Motorista online** envia posição a cada 4 a 5 s pelo WebSocket (lote por
  HTTP como alternativa quando o socket cai). O servidor atualiza o Redis GEO e,
  se houver corrida ativa, retransmite ao passageiro **com no máximo uma
  mensagem a cada 2 s**.
- **Trilha da corrida** (`in_progress`) é gravada no Postgres, reduzida a um
  ponto a cada ~10 s ou 50 m. É ela que serve de prova em disputa de tarifa e de
  rota. Retenção definida em 8.1.
- **Protocolo**: toda mensagem tem `type`, `seq` (crescente por corrida) e
  `sentAt`. O app descarta `seq` menor que o último visto e, ao detectar buraco
  ou reconectar, chama o REST.
- **Admin** assina um canal com as corridas ativas da área (posição e status),
  limitado a quem tem o papel de operação.

### 5.6 Precificação

Fórmula de referência (os números são **decisão 7 do dono**; aqui só a forma):

```
tarifa = max(tarifa_mínima, bandeirada + preço_km × km + preço_min × min) × multiplicador_dinâmico
         + adicionais da categoria (ex.: Pet, se o dono decidir)
```

- **Tabelas de tarifa versionadas** por categoria e área, com `vigente_desde`.
  Mudar tarifa cria versão nova; corrida antiga continua apontando para a
  versão com que foi cotada.
- **Cotação assinada e com validade** (proposta: 5 min). O pedido de corrida
  referencia a `quoteId`; o servidor recusa cotação vencida (`409
  quote_expired`). O app não envia preço; envia a cotação.
- **Rota sempre calculada no servidor** (Directions do Mapbox). O app pode
  desenhar a rota para exibição, mas o número que vira preço é o do servidor.
- **Estimativa e tarifa final** são tipos distintos (já são no domínio). Duas
  formas possíveis, e a escolha muda o pagamento (ver 5.7):
  - **Preço fechado na cotação:** o passageiro paga o que viu, salvo mudança de
    destino. Simples, previsível, combina com Pix antes da corrida.
  - **Preço pelo trajeto real:** final calculado pela trilha, com teto em
    relação à estimativa. Mais justo em engarrafamento, mais disputa.
  Essa escolha é do dono (parte da decisão 7).
- **Arredondamento** sempre em centavos, regra única e testada (proposta:
  meio para cima no centavo, aplicado uma vez no total).
- **Taxa da plataforma e repasse** calculados e gravados por corrida no
  fechamento, com a versão da regra usada. O percentual é configurável por
  categoria e área, porque a lei pode mudar (ver 8.2: o substitutivo do PLP
  152/2025 propõe teto de 30%).
- **Dinâmica:** fora do MVP como cálculo automático; a coluna
  `multiplicador_dinâmico` existe e o admin pode fixar valor por zona e horário.

### 5.7 Pagamentos e repasse

**O provedor é decisão do dono (decisão 3).** O sistema fala com ele por uma
`PaymentPort` única: `criarRecebedor`, `cobrar`, `capturar`, `estornar`,
`consultar`, `validarWebhook`. Trocar de provedor é trocar o adaptador.

Dados públicos que pesam nessa decisão (conferidos em páginas de comparação de
nov/2026; confirmar na proposta comercial):

| Provedor | Pix | Cartão à vista | Split | Observação para corrida de ticket baixo |
|---|---|---|---|---|
| Pagar.me (Stone) | 0,99% | 4,19%, recebe em 1 dia útil | Robusto, referência em marketplace | Numa corrida de R$ 20, o Pix custa ~R$ 0,20 |
| Asaas | R$ 1,99 fixo | 2,99% + R$ 0,49, recebe em 32 dias | Por API | Numa corrida de R$ 20, o Pix custa **~10%** da corrida |
| Mercado Pago | a confirmar | a confirmar | Por API, referência em marketplace | Marca conhecida pelo passageiro |

**Requisito não negociável para qualquer provedor:** split nativo (cada
motorista é um recebedor no provedor, com o próprio cadastro e verificação) e
webhook assinado. Sem split, o dinheiro do motorista passa pela conta da
empresa, o que cria a obrigação operacional e regulatória descrita na decisão 3.

**Fluxo por meio de pagamento (o que for escolhido):**

| Meio | Quando cobra | Risco | Desenho |
|---|---|---|---|
| Pix | Antes da corrida (com preço fechado) ou ao final | Ao final: passageiro que não paga | Antes: cobrança criada no pedido, despacho só começa com Pix confirmado; estorno automático em cancelamento sem taxa |
| Cartão | Pré-autoriza no pedido, captura no fim | Recusa na captura, chargeback | Cartão tokenizado pelo SDK do provedor; o VuumBora nunca vê número de cartão |
| Dinheiro | Na mão do motorista | A plataforma fica **credora** do motorista pela taxa | Saldo devedor do motorista no ledger, descontado do próximo repasse; limite de dívida antes de bloquear dinheiro para ele |

**Ledger:** todo centavo vira lançamento imutável (`ledger_entries`): cobrança
do passageiro, taxa do provedor, taxa da plataforma, valor do motorista,
estorno, taxa de cancelamento, ajuste manual (só por admin com papel financeiro,
com motivo, auditado). Saldo é soma, nunca campo editável. **Conciliação
diária** compara o ledger com o relatório do provedor e abre alerta em qualquer
diferença de um centavo.

**Webhook:** verificação de assinatura, gravação crua em `payment_events`
antes de qualquer processamento, processamento idempotente pela chave do
evento, resposta 200 rápida e trabalho pesado na fila.

**Repasse:** com split, o provedor deposita direto ao motorista no prazo dele.
O app mostra "a receber" e "recebido" a partir do ledger e dos eventos do
provedor. Frequência e saque sob demanda são decisão 6.

### 5.8 Notificações

| Canal | Uso | Ferramenta | Observação |
|---|---|---|---|
| Push | Oferta (redundância ao WS), motorista chegou, corrida concluída | Expo Push | Gratuito |
| WhatsApp | Código de login, avisos ao motorista sobre aprovação | API oficial do WhatsApp via um parceiro | Mensagem de autenticação a ~R$ 0,035 no Brasil desde out/2026; template precisa de aprovação da Meta (prazo) |
| SMS | Reserva do código quando o WhatsApp falha | Provedor de SMS | Mais caro por mensagem; só como plano B |
| E-mail | Recibo, aviso legal, resposta a pedido LGPD | Serviço transacional | Domínio com SPF/DKIM |

Toda notificação passa por `notifications` (o que, para quem, quando, status de
entrega), sem conteúdo sensível no texto do push.

### 5.9 Autenticação e autorização

- **Passageiro e motorista:** celular + código de 6 dígitos (WhatsApp, com SMS
  de reserva). Proposta minha; o método de login é decisão do dono (item 3 das
  ambiguidades em `decisions.md`).
- **Sessão:** token de acesso curto (15 min) + token de renovação rotativo,
  guardado com hash no banco, ligado ao dispositivo, revogável. No app,
  `expo-secure-store`.
- **Admin:** e-mail + senha + segundo fator (TOTP) obrigatório; sessão curta;
  papéis: `owner`, `operacao`, `financeiro`, `suporte`, `revisor_documentos`.
  Cada rota de admin declara o papel exigido; o painel só esconde botões, quem
  barra é a API.
- **Um usuário, vários papéis:** a tabela `user_roles` permite que a mesma
  pessoa seja passageira e motorista no futuro (ambiguidade 4), mesmo que o
  MVP trate como contas separadas.

### 5.10 Antifraude básico (MVP)

| Ameaça | Sinal ou controle |
|---|---|
| Robô pedindo código de login | Limite por telefone, IP e dispositivo; atraso crescente; bloqueio de DDI fora do Brasil (configurável) |
| Conta falsa de motorista | Aprovação manual de documentos; CPF único por motorista; CNH e CRLV conferidos contra o nome |
| GPS falso | Flag de localização simulada no Android; salto de velocidade impossível; "cheguei" longe do embarque |
| Corrida fantasma (motorista e passageiro combinados) | Pares repetidos com corrida curta, cancelamento após chegada, favorito (5.4) |
| Cancelamento abusivo | Taxa por motorista e por passageiro, com limite configurável |
| Fraude de cartão | Antifraude do provedor + limite de corridas por cartão novo |
| Admin malicioso ou descuidado | Papéis mínimos, auditoria de toda ação, ajuste financeiro com motivo obrigatório |

Todo sinal grava em `risk_signals`; no MVP o efeito é **alerta para revisão
humana**, não bloqueio automático (exceto limites de taxa e localização
simulada durante corrida).

### 5.11 Auditoria

- `audit_log` só cresce (sem `UPDATE`/`DELETE` para o usuário da aplicação):
  quem, papel, ação, alvo, antes/depois (sem dado sensível em claro), IP,
  instante. Toda ação de admin passa por ele.
- `trip_events` e `ledger_entries` também são só de inclusão.
- **Registro de acesso a aplicação por 6 meses** (Marco Civil da Internet, art.
  15): IP, porta, data e hora de cada acesso autenticado, guardado com acesso
  restrito e apagado depois do prazo.
- Logs da aplicação **sem** dado pessoal: sem telefone, e-mail, nome, CPF,
  coordenada exata (o padrão já seguido pela API de pré-cadastro).

### 5.12 Segurança na corrida

- **Compartilhar viagem:** link com token, válido até o fim da corrida, mostra
  motorista (primeiro nome, foto, placa), posição e previsão. Página web
  pública.
- **Botão de emergência:** liga para o 190 pelo discador do aparelho e, em
  paralelo, avisa a operação com posição e dados da corrida. O que acontece do
  lado da operação depende do horário de atendimento (decisão 11).
- **Contato passageiro × motorista:** mascarado por serviço de terceiros ou
  pela central. Custo por chamada; decisão 11.

---

## 6. Contratos de API

Estes contratos são o que permite Vega (API) e Lyra (apps e admin) trabalharem
em paralelo. Formato comum, **já usado pela API em produção**:

```
sucesso:  { "ok": true,  "data": { ... } }
erro:     { "ok": false, "error": { "code": "...", "message": "texto para a pessoa", "fields"?: { campo: motivo }, "reason"?: "..." } }
```

| HTTP | `code` | `ApiError.kind` no app |
|---|---|---|
| 400 | `invalid_body`, `validation` | `validation` |
| 401 | `unauthorized` | `unauthorized` |
| 403 | `forbidden` | `forbidden` |
| 404 | `not_found` | `not_found` |
| 409 | `conflict` + `reason` | `conflict` |
| 429 | `rate_limited` (+ cabeçalho `Retry-After`) | `rate_limited` |
| 503 | `unavailable` | `unavailable` |
| 500 | `unknown` | `unknown` |

`reason` de `409` conhecidos: `invalid_transition`, `offer_taken`,
`offer_expired`, `quote_expired`, `active_trip_exists`, `not_eligible`,
`driver_not_approved`, `payment_pending`.

**Regras transversais:**
- Prefixo `/v1`. Mudança incompatível vira `/v2`; o app antigo continua
  funcionando até a versão mínima ser forçada.
- `Idempotency-Key` (UUID) **obrigatório** em: pedir corrida, cancelar, aceitar
  oferta, chegar, iniciar, concluir, cobrar, estornar. Mesma chave + mesmo
  corpo devolve a mesma resposta; mesma chave + corpo diferente é `409`.
- Datas em ISO 8601 com fuso. Dinheiro como `{ "amountCents": 1850,
  "currency": "BRL" }`.
- Listas com paginação por cursor: `?cursor=&limit=` → `{ items, nextCursor }`.
- Cabeçalho `X-App-Version`; abaixo da mínima, `426` com link da loja.

### 6.1 Identidade e conta (os dois apps)

| Método e rota | Entrada | Saída | Erros específicos |
|---|---|---|---|
| `POST /v1/auth/otp` | `{ phone, channel: "whatsapp" \| "sms", app: "passenger" \| "driver" }` | `{ challengeId, expiresAt, resendAt }` (sempre igual, exista ou não a conta) | 429 |
| `POST /v1/auth/otp/verify` | `{ challengeId, code, device: { id, platform } }` | `{ accessToken, refreshToken, expiresAt, user: { id, roles, isNew } }` | 400 código errado (sem dizer se o telefone existe), 429 após 5 tentativas |
| `POST /v1/auth/refresh` | `{ refreshToken }` | novo par | 401 (token reutilizado revoga a família toda) |
| `POST /v1/auth/logout` | — | `{}` | — |
| `GET /v1/me` / `PATCH /v1/me` | perfil | perfil | 400 |
| `POST /v1/me/deletion` | `{ reason? }` | `{ requestId, scheduledFor }` | 409 `active_trip_exists` |
| `POST /v1/me/devices/push-token` | `{ token, platform }` | `{}` | — |

### 6.2 Passageiro

| Método e rota | Entrada | Saída |
|---|---|---|
| `GET /v1/categories?lat&lng` | posição | `[{ id, name, description, available: boolean }]` |
| `POST /v1/quotes` | `{ origin: Place, destination: Place, kind: "ride" \| "delivery" }` | `{ quotes: [{ quoteId, categoryId, estimate: Money, distanceM, durationS, pickupEtaS, availability: "high" \| "low" \| "none", expiresAt }] }` |
| `POST /v1/trips` | `{ quoteId, paymentMethodId, preferFavorite?: boolean, delivery?: { recipientName, recipientPhone, notes } }` | `{ tripId, status, payment?: { kind: "pix", qrCode, copyPaste, expiresAt } }` |
| `GET /v1/trips/:id` | — | `Trip` completo (status, motorista, veículo, posição, preço, `seq` do último evento) |
| `POST /v1/trips/:id/cancel` | `{ reason }` | `{ status, cancellationFee?: Money }` |
| `POST /v1/trips/:id/rating` | `{ stars: 1..5, tags?, comment?, favorite?: boolean }` | `{}` |
| `POST /v1/trips/:id/share` | — | `{ url, expiresAt }` |
| `GET /v1/trips?cursor` | — | histórico |
| `GET /v1/trips/:id/receipt` | — | recibo (estimativa, final, meio de pagamento) |
| `GET /v1/favorite-driver` / `PUT` / `DELETE` | `PUT { driverId }` (precisa de corrida concluída com ele) | `{ driver: { firstName, photoUrl } \| null }` (nunca disponibilidade) |
| `GET/POST/DELETE /v1/payment-methods` | token do provedor | métodos salvos (só bandeira e 4 últimos dígitos) |
| `POST /v1/trips/:id/sos` | `{ lat, lng }` | `{ ticketId }` |

### 6.3 Motorista

| Método e rota | Entrada | Saída |
|---|---|---|
| `POST /v1/driver/onboarding` | dados da etapa 2 (endereço, CPF, dados bancários conforme provedor) | `{ status }` |
| `POST /v1/driver/documents/upload-url` | `{ type: "cnh" \| "crlv" \| "antecedentes" \| "inss" \| "vistoria" \| "seguro_app" \| "foto" }` | `{ uploadUrl, documentId, expiresAt }` (URL assinada, 5 min) |
| `POST /v1/driver/documents/:id/submit` | `{}` | `{ status: "pending" }` |
| `GET /v1/driver/verification` | — | `{ status: VerificationStatus, documents: [{ type, status, rejectionReason?, expiresOn? }], categories: [...] }` |
| `PUT /v1/driver/preferences` | `{ acceptsPets, acceptsDelivery, acceptsFavorite }` | preferências |
| `PUT /v1/driver/availability` | `{ online: boolean, lat, lng }` | `{ phase }` (`409 driver_not_approved`, `not_eligible` se documento vencido) |
| `POST /v1/driver/locations` | `{ points: [{ lat, lng, accuracyM, at, mocked }] }` | `{}` (alternativa ao WS) |
| `POST /v1/driver/offers/:id/accept` | — | `{ tripId }` (`409 offer_taken` / `offer_expired`) |
| `POST /v1/driver/offers/:id/decline` | `{ reason? }` | `{}` |
| `POST /v1/driver/trips/:id/arrived` · `/start` · `/complete` · `/cancel` | `start` pode levar `{ pickupCode }`; `complete` leva `{ deliveryCode? }` | `Trip` |
| `GET /v1/driver/earnings?from&to` | período | `{ gross, platformFee, net, trips, onlineSeconds, engagedSeconds }` |
| `GET /v1/driver/payouts?cursor` | — | repasses |

`engagedSeconds` (tempo do aceite à chegada ao destino) existe desde já porque o
PLP 12/2024 mede remuneração por hora engajada (ver 8.2).

### 6.4 Tempo real (WebSocket)

`GET /v1/realtime` (upgrade), autenticado pelo token de acesso no primeiro
quadro, não na URL (URL vai para log).

| Direção | `type` | Conteúdo |
|---|---|---|
| servidor → passageiro | `trip.updated` | `{ tripId, status, seq, driver?, vehicle?, etaS? }` |
| servidor → passageiro | `trip.driver_location` | `{ tripId, lat, lng, heading, seq }` (no máximo a cada 2 s) |
| servidor → motorista | `offer.created` | `{ offerId, expiresAt, categoryId, kind, pickup, dropoff, distanceM, estimatedPayout, isFavorite }` |
| servidor → motorista | `offer.revoked` | `{ offerId, reason }` |
| servidor → motorista | `trip.updated` | igual ao do passageiro |
| motorista → servidor | `location.update` | `{ lat, lng, accuracyM, heading, speed, at, mocked }` |
| ambos | `ping` / `pong` | a cada 20 s |
| servidor → admin | `ops.trip` | `{ tripId, status, lat, lng, categoryId }` |

**Regra de ouro:** nenhum estado é decidido por mensagem de WebSocket. Ao
reconectar ou detectar buraco em `seq`, o app chama o REST.

### 6.5 Admin (`/v1/admin/*`, papel exigido entre colchetes)

| Área | Rotas |
|---|---|
| Candidaturas [operacao] | `GET /driver-applications?status&city`, `POST /driver-applications/:id/approve` · `/reject` (motivo obrigatório) |
| Motoristas e documentos [revisor_documentos] | `GET /drivers?status`, `GET /drivers/:id`, `GET /documents/:id/view-url` (URL assinada de 5 min, acesso auditado), `POST /documents/:id/approve` · `/reject` · `/request-correction`, `PUT /drivers/:id/categories` |
| Corridas [operacao] | `GET /trips?status&from&to&q`, `GET /trips/:id` (com linha do tempo de `trip_events` e trilha), `POST /trips/:id/cancel` |
| Financeiro [financeiro] | `GET /finance/summary?from&to`, `GET /ledger?tripId\|driverId`, `POST /trips/:id/refund`, `POST /ledger/adjustments` (motivo obrigatório), `GET /reconciliation?date`, `GET /payouts` |
| Suporte [suporte] | `GET /tickets?status`, `GET /tickets/:id`, `POST /tickets/:id/messages`, `POST /tickets/:id/close` |
| Tarifas e categorias [owner] | `GET /fare-tables`, `POST /fare-tables` (cria versão nova, nunca edita), `POST /fare-tables/simulate`, `GET/PUT /categories`, `GET/PUT /service-areas` |
| Usuários [operacao] | `GET /users?q`, `POST /users/:id/block` · `/unblock` (motivo) |
| Risco [operacao] | `GET /risk-signals?status`, `POST /risk-signals/:id/resolve` |
| LGPD [owner] | `GET /privacy-requests`, `POST /privacy-requests/:id/complete` |
| Auditoria [owner] | `GET /audit-log?actor&target&from&to` |

### 6.6 Público e integrações

| Rota | Uso |
|---|---|
| `POST /v1/waitlist`, `POST /v1/driver-applications` | Já em produção, inalteradas |
| `GET /v1/share/:token` | Dados mínimos da viagem compartilhada |
| `POST /v1/account-deletion-requests` | Pedido de exclusão pela web (exigência da Google Play); confirma por código no celular |
| `POST /v1/webhooks/payments/:provider` | Webhook do provedor (assinatura verificada, sem autenticação de usuário) |
| `GET /healthz` | Já existe |

---

## 7. Infraestrutura, CI/CD, observabilidade e custo

### 7.1 Ambientes

| Ambiente | Onde | Para quê |
|---|---|---|
| Local | Docker Compose (Postgres + PostGIS, Redis) + adaptadores `mock` | Desenvolvimento |
| Homologação (`staging`) | Projeto separado no Easypanel, banco e Redis próprios, domínio `api-staging.vuumbora.com.br`; provedor de pagamento em sandbox | Teste de ponta a ponta, beta interno |
| Produção | Projeto `vuumbora` no Easypanel (já existe: `vuumbora-backend`, `vuumbora-banco`, `vuumbora-redis`) | Real |

**Homologação no mesmo servidor que produção** é aceitável até o beta, com
limite de CPU e memória por serviço. No beta público (S8), mover para um
segundo servidor ou desligar quando não estiver em uso. Decisão de custo do
dono.

**Pré-requisito pendente desde 18/11:** o painel do Easypanel ainda responde por
HTTP e por IP sem certificado (`docs/deploy-easypanel.md`, seção 0). Isso
**precisa** estar resolvido antes de qualquer dado de motorista ou dinheiro
passar pelo servidor: quem tem o painel tem o banco.

### 7.2 CI/CD

- **GitHub Actions** a cada PR: `npm run check` (tipos, fronteiras, contexto do
  Docker), testes de unidade, testes de integração da API contra Postgres e
  Redis reais em contêiner (não simulados).
- **API e admin:** imagem Docker construída no CI; `main` publica em
  homologação automaticamente; produção por tag (`api-v*`), com o Easypanel
  puxando a imagem. Volta atrás = reimplantar a tag anterior.
- **Migrações:** continuam rodando no boot com trava (padrão provado em 19/11).
  Regra nova: toda migração é **compatível com a versão anterior do código**
  (expandir antes, contrair depois), para que voltar a imagem nunca quebre o
  banco.
- **Apps:** EAS Build por tag; EAS Update para correção de JS nos canais
  `preview` e `production`; versão mínima forçada pela API (`426`).

### 7.3 Observabilidade

| O quê | Como | Custo |
|---|---|---|
| Logs estruturados sem dado pessoal | pino (já do Fastify) com lista de campos proibidos | 0 |
| Erros de app e API | Sentry (plano gratuito) ou GlitchTip auto-hospedado | 0 no início |
| Disponibilidade | Monitor **fora** do servidor (UptimeRobot gratuito ou similar) em `/healthz` de API, admin e site | 0 |
| Métricas de negócio | Consultas no Postgres exibidas no admin: corridas por estado, tempo até atribuição, taxa de aceite, cancelamento, conciliação | 0 |
| Alerta | Para o celular do dono (e-mail ou Telegram) quando: API fora, fila parada, conciliação com diferença, corrida presa em estado intermediário > 30 min | 0 |

### 7.4 Backup e recuperação

- `pg_dump` diário criptografado para armazenamento **fora do servidor**;
  retenção de 30 dias. Meta do MVP: perder no máximo 24 h (RPO 24 h). No beta
  público, arquivamento contínuo do WAL para RPO de minutos.
- **Teste de restauração mensal** num banco descartável. Backup que nunca foi
  restaurado não conta como backup.
- Documentos do motorista em armazenamento de objetos com criptografia e versão.
  Onde (Brasil ou exterior) pesa na LGPD; ver decisão D-13.

### 7.5 Custo estimado por fase (R$ por mês)

**Leia com cuidado:** estimativas a partir de preços públicos de nov/2026, com
dólar a R$ 5,50 (hipótese; refazer com o câmbio do dia). Não incluem a taxa do
provedor de pagamento (variável, cobrada por corrida), seguro, contador,
advogado nem pessoal.

| Item | S0 a S3 (construção) | S4 a S7 (homologação + teste interno) | S8 (beta, ~50 motoristas) | S9 (lançamento, ~1.000 corridas/dia) |
|---|---|---|---|---|
| Servidor (VPS com Easypanel) | já existe (~R$ 30 a 80) | o mesmo, talvez maior: R$ 60 a 150 | R$ 100 a 250 | R$ 250 a 600 (dois servidores) |
| Licença Easypanel | plano gratuito | gratuito | gratuito ou pago (cobrança em US$ por servidor) | idem |
| Armazenamento externo (backup + documentos) | R$ 0 a 10 | R$ 5 a 20 | R$ 10 a 40 | R$ 30 a 100 |
| Mapbox | 0 (dentro das cotas grátis) | 0 | 0 | ~R$ 100 a 400 (Directions/Matrix acima de 100 mil chamadas; app abaixo de 25 mil usuários ativos/mês é grátis) |
| WhatsApp (código de login) | 0 | ~R$ 5 | ~R$ 20 a 50 | ~R$ 150 a 400 + mensalidade do parceiro (R$ 0 a 300) |
| SMS de reserva | 0 | ~R$ 10 | ~R$ 30 | ~R$ 100 |
| E-mail transacional | 0 | 0 | 0 | R$ 0 a 120 |
| Expo/EAS | 0 | 0 | 0 a ~R$ 105 (Starter, US$ 19) | ~R$ 105 a 1.100 (Starter a Production) |
| Monitoramento de erros | 0 | 0 | 0 | R$ 0 a 150 |
| Lojas | Apple ~R$ 545/ano (US$ 99) + Google ~R$ 140 uma vez (US$ 25) | — | — | — |
| **Total fixo estimado** | **~R$ 30 a 90/mês** | **~R$ 80 a 200/mês** | **~R$ 200 a 700/mês** | **~R$ 800 a 3.300/mês** |

**Custo variável que pesa mais que a infra:** taxa do provedor. Exemplo com
1.000 corridas/dia de R$ 20 pagas por Pix a 0,99%: ~R$ 6 mil/mês. A mesma conta
com Pix a R$ 1,99 fixo: ~R$ 60 mil/mês. **A escolha do gateway importa mais que
qualquer escolha de servidor deste documento.**

---

## 8. LGPD e exigências legais

⚠️ Este levantamento é técnico, para orientar o desenho. **Não substitui
advogado nem contador.** Onde está marcado "validar", a validação é do dono com
eles.

### 8.1 LGPD

| Tratamento | Base legal provável | Retenção proposta (validar) |
|---|---|---|
| Conta, telefone, corridas | Execução de contrato | Enquanto a conta existir + prazos legais |
| Registro de acesso (IP, data, hora) | Obrigação legal (Marco Civil, art. 15) | **6 meses**, depois apagado |
| Registros fiscais e financeiros | Obrigação legal | 5 anos (validar com contador) |
| Trilha de localização da corrida | Execução de contrato; legítimo interesse (segurança, disputa) | Proposta: 6 a 12 meses; depois só origem/destino aproximados |
| Posição do motorista fora de corrida | Execução de contrato (despacho) | Não persistir; só Redis, sobrescrita |
| Documentos do motorista (CNH, CRLV, antecedentes, INSS) | Obrigação legal / execução de contrato | Enquanto credenciado + prazo de defesa (validar); de reprovado, apagar em prazo curto |
| Antecedentes criminais | Exigida por lei federal ao motorista | Guardar o resultado e a validade; o arquivo só pelo tempo necessário |
| Antifraude | Legítimo interesse | 12 meses |
| Marketing | Consentimento separado | Até retirar o consentimento |

Obrigações de produto:
- **Política de privacidade e termos** antes do primeiro usuário real
  (`PLANO.md` 6.4).
- **Registro das operações de tratamento** e **relatório de impacto (RIPD)**:
  geolocalização contínua em escala tende a ser tratamento de alto risco, o que
  provavelmente afasta a dispensa de encarregado para agente de pequeno porte.
  Validar com advogado; até lá, nomear um encarregado e publicar o contato
  (`contato@vuumbora.com.br` já existe).
- **Direitos do titular** pelo app e pela web (acesso, correção, exclusão,
  portabilidade) com fila no admin e prazo controlado.
- **Incidente de segurança:** comunicação à ANPD e aos titulares em prazo curto
  (regulamento de 2024 fala em 3 dias úteis; validar). Plano de resposta
  escrito antes do beta.
- **Transferência internacional:** Mapbox, Expo Push, Sentry e eventualmente o
  armazenamento estão fora do Brasil. Mandar só o mínimo (Mapbox recebe
  coordenadas, não nomes) e citar na política.

### 8.2 Transporte por aplicativo

**Federal (em vigor):** Lei 12.587/2012, com os arts. 11-A e 11-B incluídos
pela Lei 13.640/2018.
- Ao **motorista** (11-B): CNH com a observação de que exerce atividade
  remunerada (EAR); veículo com as características exigidas pela autoridade de
  trânsito e pelo poder público municipal; CRLV; certidão negativa de
  antecedentes criminais.
- O **município** regulamenta e fiscaliza (11-A), devendo observar: cobrança
  dos tributos municipais; exigência de seguro de Acidentes Pessoais a
  Passageiros (APP) e do seguro obrigatório de veículos; inscrição do motorista
  como contribuinte individual do INSS.
- O STF (ADPF 449 e RE 1.054.110, 2019) decidiu que o município não pode
  proibir o serviço nem impor restrição desproporcional.

**Federal (em tramitação, sem votação até 21/10/2026):**
- **PLP 12/2024** (governo): remuneração mínima por hora engajada (proposta
  de R$ 32,10/h contando do aceite ao destino), regras de INSS. "Pronto para
  pauta" em comissão.
- **PLP 152/2025** (substitutivo de abril/2026): INSS de 5%, **teto de 30% de
  taxa da plataforma**, motorista da nova categoria sem opção de MEI.
- **Consequência no desenho:** percentual da taxa configurável por categoria e
  área (5.6); tempo engajado medido por corrida (6.3); repasse e INSS
  calculáveis por motorista a partir do ledger. Se um dos dois passar, o
  sistema muda configuração, não arquitetura.

**Natal:**
- Já existe lei municipal sobre o motorista de aplicativo, segundo a imprensa
  local: **vistoria anual** do veículo pela STTU (ou empresa autorizada por
  ela), **veículo com no máximo 10 anos**, **certidão de regularidade no INSS**
  (contribuinte individual ou MEI) entre os documentos do motorista, e
  obrigação da plataforma de **proteger os dados** de motoristas e usuários.
  Número da lei e data de vigência **a confirmar na STTU** (a fonte não traz o
  número).
- Uma **nova lei municipal** está em redação pela Prefeitura (minuta em
  análise na Procuradoria, debatida em audiência pública recente na Câmara).
  Pode mudar exigências antes do lançamento.
- **Consequência no desenho:** os documentos exigidos e a validade de cada um
  ficam em tabela por município (`service_areas` → regras), não no código; o
  painel alerta documento perto de vencer; motorista com documento vencido não
  fica online (`409 not_eligible`).
- **Região metropolitana** (Parnamirim, São Gonçalo do Amarante, Macaíba,
  Extremoz e outras) pode ter regra própria em cada município. Operar em mais de
  um município é decisão do dono (D-04) e multiplica esse levantamento.
- **Ação recomendada ao dono:** procurar a STTU antes do beta para confirmar o
  cadastro da plataforma e dos motoristas. Prefeitura tende a receber bem
  aplicativo local que recolhe ISS na cidade.

**Lojas de aplicativo (são exigência também):**
- Google Play: declaração e justificativa de **localização em segundo plano**
  (só o app do motorista), aviso destacado antes de pedir a permissão, link web
  para exclusão de conta.
- Apple: exclusão de conta dentro do app; se houver login com Google, oferecer
  login com Apple (decisão 8).

**Tributário (para o contador):** ISS sobre a intermediação, emissão de nota da
taxa da plataforma, e a transição da reforma tributária (CBS/IBS) em
andamento. Fica fora do MVP técnico, mas o ledger já separa taxa da plataforma
de valor do motorista, que é o que o contador vai pedir.

---

## 9. Matriz de funcionalidades por perfil

Legenda: **M** = MVP · **P** = pós-MVP · — = não se aplica

| Funcionalidade | App passageiro | App motorista | Admin web | Web público |
|---|---|---|---|---|
| Login por código no celular | M | M | — | — |
| Login admin com segundo fator | — | — | M | — |
| Login Google/Apple | P (decisão 8) | P | — | — |
| Perfil e endereços salvos | M | M (perfil) | — | — |
| Exclusão de conta | M | M | M (fila) | M (pedido) |
| Pré-cadastro do motorista (etapa 1) | — | — | M (análise) | já no ar |
| Cadastro completo e documentos (etapa 2) | — | M | M (análise) | — |
| Escolher preferências (pet, entrega, favorito) | — | M | M (visão) | — |
| Candidatura à categoria Motorista mulher | — | M | M (aprovação) | já no site |
| Ficar online/offline | — | M | M (visão) | — |
| Cotação por categoria | M | — | M (simulador) | — |
| Pedir corrida (VuumBora, Conforto, Motorista mulher, Pet) | M | — | — | — |
| Pedir entrega | M (se liberada pelo advogado) | M | M | — |
| Motorista favorito | M | M (pode recusar ser favorito) | M (sinais de risco) | — |
| Receber oferta com destino visível | — | M | — | — |
| Acompanhar corrida em tempo real | M | M | M (mapa ao vivo) | M (link compartilhado) |
| Cancelar corrida | M | M | M | — |
| Navegação | — | M (app externo) / P (interna) | — | — |
| Pagamento (meios a decidir) | M | — | M (estorno) | — |
| Avaliar corrida | M | — (decisão do dono) | M (visão) | — |
| Histórico e recibo | M | M | M | — |
| Ganhos e repasses | — | M | M | P (portal do motorista) |
| Extrato e informe de rendimentos | — | P | P | P |
| Saque sob demanda | — | P (decisão 6) | P | — |
| Suporte | M (abrir chamado) | M (abrir chamado) | M (atender) | — |
| Botão de emergência e compartilhar viagem | M | M | M (alerta) | M (página) |
| Contato mascarado | M ou P (decisão 11) | M ou P | — | — |
| Tarifas e categorias | — | — | M | — |
| Financeiro e conciliação | — | — | M | — |
| Antifraude (sinais e revisão) | — | — | M | — |
| Auditoria | — | — | M | — |
| Carteira, transferência, indicação, cupom | P / não fazer (decisões 4, 5, 12) | — | P | — |
| Corrida agendada | decisão do dono | decisão do dono | — | — |
| Moto | fora do lançamento | fora do lançamento | — | — |

---

## 10. Plano faseado S0 a S9

Esforço relativo: **P** (dias), **M** (1 a 2 semanas), **G** (2 a 4 semanas),
**GG** (mais de 4 semanas), para a squad atual. Não é prazo; prazo é decisão do
dono.

```
S0 ─► S1 ─┬─► S2 ──────────────┐
          ├─► S3 ─► S4 ─► S5 ──┼─► S6 ─► S7 ─► S8 ─► S9
          └────────────────────┘
Protótipo (PLANO.md fases 1-3) roda em paralelo até S4, quando os apps trocam mock por http.
```

### S0: Decisões e contratos

- **Objetivo:** fechar o que bloqueia o desenho e congelar os contratos para a
  construção paralela.
- **Entregáveis:** respostas do dono às decisões D-01 a D-10 (§12) ou adiamento
  explícito de cada uma; contratos da §6 transformados em tipos e esquemas no
  pacote de contrato e no `api-client` (portas novas: identidade, cotação,
  corrida, oferta, favorito, pagamento, admin); adaptadores `mock` para todas
  as portas novas; ADR registrando as escolhas de 4.x em `docs/decisions.md`
  (inclusive corrigir D-11 para "Mapbox, aceita").
- **Critério de aceite:** `npm run check` em 0 com os tipos novos; cada rota da
  §6 tem tipo de entrada, saída e erros; cada porta tem adaptador mock que as
  telas existentes conseguem consumir; lista de decisões do dono com estado
  (respondida / adiada com data).
- **Depende de:** nada. **Esforço:** M. **Responsáveis:** Nova + Vega; dono.

### S1: Fundação do backend

- **Objetivo:** a base de que toda funcionalidade depende.
- **Entregáveis:** estrutura modular no `apps/api`; identidade (código por
  WhatsApp com SMS de reserva, sessão, renovação rotativa, dispositivo);
  papéis; `audit_log` e `access_log`; ambiente de homologação; CI com testes de
  integração em Postgres e Redis reais; logs sem dado pessoal; monitor externo;
  backup diário fora do servidor; **HTTPS no painel do Easypanel**.
- **Critério de aceite:** login real por código num celular de teste em
  homologação; token de renovação reutilizado revoga a família (teste
  automatizado); 6ª tentativa de código errado recebe 429; restauração do
  backup feita uma vez e documentada; painel do Easypanel inacessível por HTTP e
  por IP; CI barra PR com teste vermelho.
- **Depende de:** S0; decisão do dono sobre o método de login; conta no
  parceiro de WhatsApp. **Esforço:** G. **Responsáveis:** Vega, Cronos, Vulcano.

### S2: Admin v0 e cadastro do motorista

- **Objetivo:** o dono analisar candidatos e aprovar motoristas sem abrir o
  banco nem rodar script.
- **Entregáveis:** `apps/admin` (login com segundo fator, papéis); fila de
  candidaturas (substitui `driver-applications:export`); etapa 2 no app do
  motorista (dados, veículo, documentos, preferências, candidatura a Motorista
  mulher); armazenamento de documentos criptografado com URL assinada; fila de
  revisão de documentos com motivos de recusa; regras de documento por
  município (lei federal + Natal); alerta de vencimento.
- **Critério de aceite:** um motorista de teste vai de candidatura a
  `approved` sem nenhum passo fora do app e do admin; toda visualização de
  documento aparece no `audit_log`; URL de documento expira em ≤ 5 min (teste
  automatizado); usuário com papel `suporte` recebe 403 nas rotas de documento;
  motorista com documento vencido não fica online.
- **Depende de:** S1; decisão 9 (quem analisa, prazo); documentos exigidos
  confirmados na STTU. **Gate externo:** o cadastro **só abre ao público
  depois de as regras de taxa e repasse estarem publicadas** (compromisso de
  18/11). **Esforço:** G. **Responsáveis:** Lyra (admin e app), Vega, Cronos.

### S3: Geografia, categorias e preço

- **Objetivo:** cotação real e confiável no servidor.
- **Entregáveis:** área de serviço (polígono de Natal; outros municípios se o
  dono decidir); as cinco categorias com regras de elegibilidade (5.3);
  tabelas de tarifa versionadas; `POST /v1/quotes` com Directions no servidor e
  cotação assinada; simulador de tarifa no admin; teste de qualidade de
  endereço do Mapbox em Natal.
- **Critério de aceite:** a mesma rota de teste gera sempre a mesma cotação
  (teste com rota gravada); mudar tarifa não altera cotação já emitida; cotação
  vencida dá `409 quote_expired`; arredondamento coberto por casos de borda;
  **≥ 90% de uma amostra de 100 endereços reais de Natal** (bairros, praias,
  condomínios, shoppings) encontrados corretamente pela busca, ou plano
  alternativo definido (pino no mapa, POIs próprios).
- **Depende de:** S1; decisão 7 (tarifa e forma do preço); decisão 13
  (categorias, já respondida em parte em 20/11); D-04 (municípios).
  **Esforço:** M. **Responsáveis:** Vega, Cronos.

### S4: Núcleo da corrida

- **Objetivo:** corrida de ponta a ponta entre dois celulares, ainda sem
  dinheiro real.
- **Entregáveis:** máquina de estados no servidor com `trip_events` (incluindo
  a volta para busca quando o motorista cancela); despacho sequencial com
  elegibilidade por categoria; **motorista favorito** com janela exclusiva e
  fallback; aceite atômico; expiração de oferta pela fila; WebSocket com
  `seq` e resincronização; localização em segundo plano no app do motorista;
  trilha da corrida; push; apps trocando `mock` por `http` no fluxo da corrida;
  compartilhar viagem e botão de emergência; modo "corrida de teste" sem
  cobrança.
- **Critério de aceite:**
  - Teste de carga em homologação: 50 motoristas simulados, 20 pedidos
    simultâneos, **zero atribuição dupla** em 1.000 pedidos.
  - Oferta chega ao motorista em p95 < 2 s a partir do pedido.
  - Derrubar a rede do passageiro 30 s no meio da corrida e voltar: o app mostra
    o estado correto sem ação manual.
  - Favorito: corrida com favorito disponível vai para ele; com favorito que
    recusa, entra na fila normal e o tempo extra até a atribuição é ≤ uma janela
    de oferta; o passageiro nunca recebe a disponibilidade do favorito (teste
    de contrato).
  - Motorista mulher sem motorista elegível: corrida **não** vai para outro
    motorista sem confirmação da passageira.
  - Teste de campo em ruas de Natal com dois aparelhos Android comuns e um
    iPhone: 10 corridas completas, posição do motorista sem buraco > 30 s.
- **Depende de:** S1, S3; protótipo dos apps (PLANO.md fases 1 e 2) com as
  telas de corrida. **Esforço:** GG. **Responsáveis:** Vega, Cronos, Lyra,
  Íris.

### S5: Pagamentos e repasse

- **Objetivo:** dinheiro real, conciliado ao centavo.
- **Entregáveis:** adaptador do provedor escolhido; meios de pagamento
  decididos; cadastro do motorista como recebedor (split); ledger; webhook
  idempotente; estorno; taxa de cancelamento; dívida do motorista em corrida em
  dinheiro (se houver); conciliação diária; ganhos e repasses no app do
  motorista.
- **Critério de aceite:** em sandbox, 200 corridas de teste com mistura de
  meios, cancelamentos e estornos fecham **ledger = relatório do provedor ao
  centavo**; reenviar o mesmo webhook 10 vezes produz um lançamento só;
  webhook com assinatura inválida é recusado e registrado; nenhum dado de
  cartão passa pelo servidor do VuumBora (verificado nos logs e no tráfego).
- **Depende de:** S4; decisões 3, 6, 7, 15; validação do fluxo com contador.
  **Esforço:** G. **Responsáveis:** Vega, Cronos, Íris.

### S6: Operação no admin

- **Objetivo:** o dono opera o dia a dia pela tela.
- **Entregáveis:** mapa de corridas ao vivo; linha do tempo da corrida;
  financeiro (resumo, ledger por corrida e por motorista, estornos, ajustes
  com motivo, conciliação, repasses); chamados de suporte ligados à corrida;
  bloqueio de usuário; tarifas e categorias com versão; sinais de antifraude
  (inclusive pares de favorito suspeitos); fila de pedidos LGPD; visualizador
  de auditoria.
- **Critério de aceite:** cada ação de escrita do admin tem teste que confere
  a linha no `audit_log`; um roteiro de operação (aprovar motorista, acompanhar
  corrida, estornar, responder chamado, mudar tarifa) é executado por alguém
  que não construiu o painel, sem ajuda; nenhuma tela do admin carrega dado de
  papel que o usuário não tem (teste com cada papel).
- **Depende de:** S2, S4; S5 para a parte financeira. **Esforço:** G.
  **Responsáveis:** Lyra, Vega.

### S7: Segurança, LGPD e prontidão legal

- **Objetivo:** poder colocar gente de fora e dinheiro real.
- **Entregáveis:** auditoria do Órion (OWASP, API e apps); regras de
  antifraude ativas; retenção automática (registro de acesso 6 meses, trilhas,
  documentos de reprovados); exclusão de conta de ponta a ponta; política de
  privacidade e termos publicados; registro de operações e RIPD; plano de
  resposta a incidente; declarações das lojas (localização em segundo plano);
  confirmação com a STTU; seguro APP resolvido.
- **Critério de aceite:** zero achado crítico ou alto aberto; trabalho de
  retenção provado apagando dado vencido em homologação; exclusão de conta
  provada (dados pessoais removidos, ledger e fiscal mantidos e
  desidentificados); checklist legal assinado pelo advogado do dono; builds
  aceitos no teste interno das duas lojas.
- **Depende de:** S4, S5, S6. **Esforço:** G. **Responsáveis:** Órion,
  Alexandria, Vulcano; dono com advogado e contador.

### S8: Beta fechado em Natal

- **Objetivo:** corrida real, com gente real, em escala controlada.
- **Entregáveis:** motoristas aprovados do pré-cadastro; passageiros por
  convite; limites de valor e de região; plantão definido; métricas diárias.
- **Critério de aceite (proposta, números a ajustar com o dono):** ≥ 300
  corridas pagas concluídas; conciliação 100% todos os dias; ≥ 99% de sessões
  sem travamento nos dois apps; tempo mediano até a atribuição medido e
  aceito pelo dono; nenhum incidente grave sem resolução em 24 h; feedback de
  motoristas registrado.
- **Depende de:** S7; contas de loja (decisão 17). **Esforço:** M (duração
  definida pelo dono). **Responsáveis:** toda a squad, Vulcano no plantão.

### S9: Lançamento e pós-MVP

- **Objetivo:** abrir ao público e crescer sem refazer.
- **Entregáveis:** publicação nas lojas; segundo servidor (homologação fora da
  produção, ou réplica do banco); WAL contínuo; e a fila pós-MVP na ordem que o
  dono escolher: portal web do motorista, navegação interna, saque sob demanda,
  agendamento, avaliação mútua, Moto, outros municípios, B2B.
- **Critério de aceite:** aprovado nas duas lojas; RPO ≤ 15 min provado com
  restauração; cada item pós-MVP entra como missão própria com critério
  próprio.
- **Depende de:** S8. **Esforço:** contínuo.

---

## 11. Riscos e mitigações

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Android mata a localização em segundo plano do motorista (fabricantes comuns em Natal) | Alta | Alto | Serviço em primeiro plano, teste de campo no S4 com critério objetivo, guia de "desligar economia de bateria" no app, troca de biblioteca se o critério falhar |
| R2 | Servidor único (Easypanel) cai ou perde disco | Média | Muito alto | Backup externo diário + restauração testada, monitor externo, segundo servidor no S9, documento de recuperação; o dono é responsável pela manutenção do servidor |
| R3 | Painel do Easypanel exposto sem HTTPS | Já existe | Muito alto | Resolver no S1, antes de qualquer dado sensível |
| R4 | Pouco motorista no lançamento (o ovo e a galinha) | Alta | Muito alto | Pré-cadastro já captando; despacho que não depende de densidade alta; categorias com oferta pequena avisam o passageiro antes; beta com área reduzida |
| R5 | Categorias de nicho (Motorista mulher, Pet) com espera longa | Alta | Médio | `availability` na cotação, nunca rebaixar sem consentimento, métrica por categoria |
| R6 | Motorista favorito usado para combinar corrida fora do app | Média | Médio | Favorito só após corrida concluída, contato mascarado, sinais de par suspeito no antifraude, revisão humana |
| R7 | Favorito expondo a rotina do motorista | Baixa | Alto | Passageiro nunca vê disponibilidade; motorista pode desligar e remover |
| R8 | Lei nova (Natal em redação; PLP 12/2024 e 152/2025) muda taxa, documento ou INSS | Média | Alto | Taxa e documentos configuráveis por categoria e município; tempo engajado medido desde já; contato com a STTU antes do beta |
| R9 | Entrega com enquadramento legal ou seguro diferente | Média | Alto | Categoria pronta no sistema, mas desligada até parecer do advogado |
| R10 | Gateway com taxa fixa alta em ticket baixo | Média | Alto | Comparação da §5.7 entregue ao dono; porta de pagamento permite trocar |
| R11 | Cadastro de motorista como recebedor no provedor demora (verificação do provedor) | Média | Alto | Começar o cadastro de recebedor no S2, junto com a aprovação de documentos |
| R12 | Busca de endereço do Mapbox fraca em Natal | Média | Médio | Teste de 100 endereços no S3; pino no mapa; POIs próprios |
| R13 | Vazamento de documento do motorista | Baixa | Muito alto | Criptografia, URL de 5 min, acesso auditado, papel mínimo, retenção curta para reprovados |
| R14 | Custo de Mapbox explode por chamada indevida do app | Baixa | Médio | Token restrito por app e domínio (pendência de 18/11), rota calculada no servidor com cache, alerta de uso |
| R15 | Template de WhatsApp reprovado ou atrasado pela Meta | Média | Médio | Pedir aprovação no início do S1; SMS de reserva pronto |
| R16 | Recusa nas lojas (localização em segundo plano, exclusão de conta, login) | Média | Alto | Requisitos da §8.2 viram critério do S7; teste interno das lojas antes do beta |
| R17 | Escopo puxado pelo mockup (carteira, transferência, indicação) | Alta | Médio | Matriz da §9 é o contrato de escopo; mockup não é funcionalidade |
| R18 | Equipe pequena, dono concentrando operação, suporte e servidor | Alta | Alto | Tudo que é operação vira tela; alertas com ação clara; guia de operação da Alexandria |
| R19 | Alternativa comprada (white-label) mais rápida que construir | — | — | Existem fornecedores que entregam os três apps prontos em semanas. A squad já tem base sólida e o diferencial (franqueza, categorias próprias, atendimento local) depende de controle; mas é escolha estratégica do dono e deve ser feita de olhos abertos (D-10) |

---

## 12. Decisões que são do dono

Estas não foram decididas aqui. Onde há recomendação, ela é só recomendação.

| # | Decisão | Bloqueia | O que eu sugiro considerar |
|---|---|---|---|
| D-01 | **Orçamento** mensal para infra e serviços por fase | Tamanho do servidor, homologação separada, planos pagos | A tabela da §7.5 dá a ordem de grandeza |
| D-02 | **Prazo** desejado para beta e lançamento | Paralelismo e corte de escopo | Sem prazo, a ordem S0 a S9 segue por dependência |
| D-03 | **Gateway de pagamento** e **meios aceitos** (Pix, cartão, dinheiro) | S5 | Exigir split nativo; olhar o custo do Pix em corrida de R$ 15 a 30 (§5.7); validar com contador |
| D-04 | **Uma cidade ou várias** (só Natal ou também municípios da região metropolitana no lançamento) | S2 (documentos por município), S3 (área), S7 (legal) | Cada município a mais pede levantamento legal próprio |
| D-05 | **Corrida agendada no MVP** | S4 | Recomendação anterior (decisão 14): depois do lançamento |
| D-06 | **Forma do preço:** fechado na cotação ou pelo trajeto real (parte da decisão 7) | S3, S5 | Preço fechado simplifica Pix e reduz disputa |
| D-07 | **Método de login** (código no celular ou senha) | S1 | Código por WhatsApp é o padrão do mercado e evita senha esquecida |
| D-08 | **Motorista mulher:** quem pode pedir e critério de elegibilidade | S2, S4 | Critério escrito, igual para todas, revisado por advogado |
| D-09 | **Pet e Entrega:** taxa adicional, regras, itens proibidos; Entrega só após parecer jurídico | S3, S4 | Ligar Entrega depois do parecer |
| D-10 | **Construir ou comprar** (white-label) | Tudo | Registro honesto: hoje a squad constrói |
| D-11 | **Seguro APP:** a plataforma contrata para todas as corridas ou exige do motorista | S7 | Validar com corretor e advogado |
| D-12 | **Código de embarque** (PIN) para iniciar a corrida | S4 | Aumenta segurança, acrescenta um passo |
| D-13 | **Onde guardar documentos e backups** (Brasil ou exterior) | S1, S2 | Brasil simplifica a LGPD |
| D-14 | **Homologação** no mesmo servidor ou em outro | S1 | Mesmo servidor até o beta |
| D-15 | **Horário de atendimento** da central (afeta botão de emergência e suporte) | S4, S6 | Decisão 11 já em aberto |

Seguem valendo as decisões já abertas em `docs/decisoes-do-dono.md`: 6 (saque),
7 (tarifa e taxa), 8 (login social), 9 (documentos), 10 (navegação), 11
(suporte), 15 (cancelamento), 17 (contas de loja).

---

## 13. Fontes consultadas

Acessadas em 20/11/2026. Valores comerciais mudam; conferir antes de decidir.

- Natal, lei municipal do motorista de aplicativo (vistoria anual, 10 anos,
  INSS): https://novonoticias.com.br/natal-ganha-lei-que-regulamenta-atuacao-de-motoristas-por-aplicativos/
- Natal, nova regulamentação em redação: https://98fmnatal.com.br/natal-rn/regulamentacao-motoristas-entregadores-aplicativo-natal/346664/
- Natal, Decreto 13.347/2025 (transporte institucional por aplicativo): https://www.legisweb.com.br/legislacao/?id=476688
- Lei 13.640/2018 e situação do PLP 12/2024 e PLP 152/2025 em 21/10/2026: https://rotapro.app/guia/lei-motorista-de-aplicativo/
- PLP 12/2024, ficha na Câmara: https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2419243
- Competência municipal e STF: https://mindmobilidadeurbana.com.br/regulamentacao-municipal-de-apps-de-transporte-guia-completo-2026/
- Mapbox, preços (25 mil usuários ativos/mês grátis no mobile; Directions US$ 2,00 por mil acima da cota): https://najar.ai/saas-pricing/mapbox e https://apis.io/plans/mapbox/mapbox-plans-pricing/
- Expo/EAS, planos: https://superapp.dev/blog/expo-pricing
- WhatsApp, preço por mensagem no Brasil desde out/2026: https://wizebot.com.br/blog/tabela-precos-whatsapp-business-api-2026
- Pagar.me × Asaas, taxas: https://heropay.ai/compare/pagarme-vs-asaas
- Gateways e split: https://fwctecnologia.com/blog/post/gateways-pagamento-brasil-comparativo
- VPS com Easypanel, preços em reais: https://www.hostinger.com/br/vps/easypanel-hosting e https://leiturasingular.com.br/hostinger-vps-vale-a-pena/
- Easypanel, licença por servidor e plano gratuito: https://easypanel.io/pricing

**Não verificado em fonte nesta sessão (conhecimento prévio, validar com
advogado):** Marco Civil art. 15 (6 meses de registro de acesso), prazo de
comunicação de incidente à ANPD, regras das lojas sobre exclusão de conta e
localização em segundo plano, preço do Mercado Pago.
