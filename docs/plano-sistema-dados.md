# Plano do modelo de dados — VuumBora (Postgres)

Planejamento de alto nível. **Nenhuma migração foi criada nesta entrega** —
isso fica para quando Vega começar a consumir cada fatia e o dono resolver as
pendências marcadas abaixo. Convenções herdadas de `packages/domain/src/index.ts`
e das migrações `0001`/`0002` já em produção (Postgres no Easypanel):

- Dinheiro sempre em **centavos inteiros, BRL** — nunca float.
- IDs **UUID** (`gen_random_uuid()`, extensão `pgcrypto` já habilitada).
- Timestamps **`TIMESTAMPTZ`**; a API serializa com fuso explícito (`IsoDateTime`),
  o banco guarda em UTC internamente — isso já é automático no Postgres.
- `trips.status` precisa espelhar **exatamente** o `TripStatus` do domínio
  (`requested | searching_driver | driver_assigned | driver_en_route |
  driver_arrived | in_progress | completed | cancelled | failed`), e
  `payments.status` o `PaymentStatus` (`pending | authorized | declined |
  refunded`). Transição de status é decisão do backend, nunca do cliente —
  e toda transição gera uma linha de auditoria (`trip_events`).
- Padrão das migrações existentes: `CREATE TABLE IF NOT EXISTS`, `CHECK`
  explícito em vez de confiar na aplicação, índice único separado da PK
  quando a unicidade é regra de negócio (não identidade), comentário no SQL
  explicando o *porquê* da decisão — não só o quê.

---

## 1. Diagrama textual das relações

```
accounts ─┬─< account_roles
          ├─1:1─ drivers ──< vehicles ──> ride_categories (kind='base_tier')
          │         │          └──< trip_price_components (via trips)
          │         ├──< driver_documents
          │         ├──< driver_category_eligibility ──> ride_categories (kind='modifier')
          │         ├──< driver_current_locations (1:1, hot row)
          │         └──< driver_payouts ──< driver_payout_batches
          ├──< places (endereços salvos)
          ├──< fare_quotes ──> fare_rule_versions ──> ride_categories
          ├──< notifications
          ├──< passenger_favorite_drivers ──> drivers
          └──< trips (passenger_id)
                   ├──> drivers (driver_id, nullable até match)
                   ├──> vehicles (vehicle_id, nullable)
                   ├──> ride_categories (category_slug — categoria pedida nesta corrida)
                   ├──> fare_quotes (fare_quote_id, nullable)
                   ├──< trip_events (auditoria de transição, append-only)
                   ├──< trip_location_pings (amostragem, não todo ping)
                   ├──< trip_price_components (base, km, min, surge, taxa, repasse)
                   ├──1:1─ payments
                   └──1:1─ trip_ratings (hoje só passageiro avalia motorista)

admin_users ──< admin_audit_log (target_type/target_id polimórfico, sem FK)
fraud_signals (subject_type/subject_id polimórfico, sem FK) ──> admin_users (reviewed_by)
support_tickets ──< support_messages
```

`admin_users` fica **fora** de `accounts` de propósito: é fronteira de
segurança (um bug de autorização em conta de passageiro não deve nunca
alcançar privilégio administrativo). Quem precisa disso validado em
profundidade é o Órion na revisão de segurança — aqui é só o desenho do dado.

---

## 2. Entidades — MVP

### `accounts` — identidade única (conta e papéis)
- **Colunas-chave:** `id UUID PK`, `phone TEXT NOT NULL` (login principal —
  decisão do dono, item 8: cadastro por celular+senha é o que a maioria usa
  no Brasil), `email TEXT NULL`, `full_name`, `password_hash NULL` (login
  social preenche depois, se/quando decisão 8 for tomada), `status`
  (`active|blocked|deleted`), `created_at`, `updated_at`, `deleted_at NULL`.
- **Relações:** 1:N com `account_roles`, `places`, `trips` (como passageiro),
  `notifications`; 1:1 opcional com `drivers`.
- **Índices:** `UNIQUE(phone)`; `UNIQUE(email) WHERE email IS NOT NULL`.
- **Retenção/LGPD:** dado de conta real (não é a `waitlist_signups`, que é
  só pré-cadastro). Exclusão a pedido do titular = **anonimizar**, não
  apagar a linha (`full_name`, `phone`, `email` → placeholder; `deleted_at`
  marcado): os FKs de `trips`/`payments` apontam para `accounts.id`, e
  histórico financeiro tem retenção fiscal própria (recomendação: 5 anos,
  igual nota fiscal — confirmar com contador, mesma ressalva do dono em
  `docs/decisoes-do-dono.md`).

### `account_roles` — papéis (passageiro/motorista/admin)
- **Colunas:** `account_id FK`, `role CHECK IN ('passenger','driver','admin')`,
  `granted_at`, `granted_by NULL`. `PK (account_id, role)`.
- **Por quê separado:** a mesma pessoa pode ser passageiro e motorista (é o
  caso comum). `admin` como papel aqui é só um **marcador de contexto**; a
  autenticação administrativa de verdade mora em `admin_users` — nunca
  conceda privilégio admin só por ter essa linha.
- **Retenção:** acompanha `accounts`.

### `drivers` — motorista (extensão 1:1 de `accounts`)
- **Colunas:** `account_id UUID PK REFERENCES accounts(id)` (chave
  compartilhada — garante no desenho que não existe motorista sem conta),
  `application_id FK NULL → driver_applications` (rastreia qual pré-cadastro
  virou motorista de fato), `cnh_number`, `cnh_category`, `cnh_expires_at`,
  `status CHECK IN ('pending_review','approved','rejected','suspended','inactive')`,
  `approved_at`, `approved_by FK admin_users NULL`, `rejection_reason NULL`,
  `created_at`, `updated_at`.
- **Índices:** `idx (status)` — fila de aprovação e o "ficar online" só
  libera `status='approved'` (decisão 9, ainda pendente do dono quanto a
  quem analisa e prazo).
- **Retenção/LGPD:** `cnh_number` é dado sensível. Enquanto decisão 9 não
  sai, **não armazenar documento algum aqui** além do que já existe na
  etapa 1 do pré-cadastro — isto é esqueleto para quando a etapa 2 existir.

### `ride_categories` — categorias de corrida (decisão 13, publicada pelo dono)
**Atualização:** decisão 13 saiu do estado "pendente" — o dono confirmou e já
publicou no site as 5 categorias do lançamento: **VuumBora** (padrão),
**Conforto**, **Motorista mulher**, **Entrega** e **Pet**. **Moto fica fora
do lançamento.** Isso muda o desenho: categoria não é um detalhe de veículo,
é a unidade central de elegibilidade — por isso a tabela deixou de se chamar
`vehicle_categories` e passou a cobrir os dois tipos que o dono descreveu:

- `kind = 'base_tier'` — **VuumBora**, **Conforto**. Mutuamente exclusivas:
  é o nível do veículo em si. Elegibilidade é automática, derivada direto de
  `vehicles.category_slug`.
- `kind = 'modifier'` — **Motorista mulher**, **Entrega**, **Pet**. Não são
  o veículo, são uma camada por cima: um motorista com veículo `Conforto`
  pode também estar habilitado para `Pet`. Elegibilidade não é automática —
  é candidatura/aprovação ou opt-in, por categoria (ver
  `driver_category_eligibility` abaixo).

- **Colunas-chave:** `slug PK`, `display_name`, `kind CHECK IN
  ('base_tier','modifier')`, `eligibility_mode CHECK IN ('automatic','opt_in',
  'requires_approval')`, `carries_passenger BOOLEAN NOT NULL DEFAULT true`
  (`false` só para `entrega` — encomenda no banco de trás, sem passageiro
  dentro do carro; existe para a UI e para regra de produto saberem que não
  há "embarque" de pessoa nessa categoria, sem precisar de outra tabela),
  `is_active`.
- **Linhas conhecidas hoje:**

  | slug | kind | eligibility_mode | carries_passenger |
  |---|---|---|---|
  | `vuumbora` | base_tier | automatic | true |
  | `conforto` | base_tier | automatic | true |
  | `motorista_mulher` | modifier | requires_approval | true |
  | `entrega` | modifier | **a confirmar** (ver pendência abaixo) | false |
  | `pet` | modifier | opt_in | true |

- **Retenção:** não aplicável (referência, sem dado pessoal).

> **Pendência nova, não decidida aqui:** o dono disse que para `pet` "o
> motorista decide se aceita" (opt-in simples, sem aprovação) e que
> `motorista_mulher` passa por candidatura — mas não especificou o modo de
> `entrega`. Tratar como `opt_in` é a suposição deste plano (consistente com
> `pet`), não uma decisão — confirmar antes de travar o fluxo de cadastro do
> motorista nessa categoria.

### `driver_category_eligibility` — candidatura/opt-in por categoria
- **Colunas-chave:** `driver_id FK drivers`, `category_slug FK
  ride_categories` (só linhas com `kind='modifier'` — ver trade-off abaixo),
  `status CHECK IN ('pending','approved','rejected','active')`,
  `requested_at`, `reviewed_by FK admin_users NULL`, `reviewed_at NULL`,
  `attributes JSONB NULL`, `created_at`. `PK (driver_id, category_slug)`.
- **Por que existe separada de `drivers`:** é exatamente o que foi pedido —
  "categoria não é só uma coluna na corrida, há elegibilidade do motorista
  por categoria". `motorista_mulher` nasce com `status='pending'` até um
  admin aprovar (gera linha em `admin_audit_log`); `pet` nasce direto em
  `status='active'` (autodeclarado, sem revisão) — o mesmo desenho de
  tabela serve os dois modos sem precisar de tabelas diferentes por
  categoria.
- **Integridade por desenho, não por confiança no código:** o ideal é um
  *trigger* (`BEFORE INSERT/UPDATE`) que rejeita a linha se
  `category_slug` referenciar uma `ride_categories` com `kind='base_tier'`
  — essa combinação não deveria existir (base tier é automático, não se
  candidata a ela). Sinalizado aqui como constraint a implementar na
  migração, não como FK simples: Postgres não expressa "FK condicionado ao
  valor de outra coluna" sem trigger ou tabela de apoio.
- **`attributes JSONB` — ponto de minimização de dado sensível:** é aqui, e
  **só aqui**, que mora o autodeclarado de gênero do motorista que se
  candidata a `motorista_mulher` — nunca em `drivers` (que vale para todo
  motorista, candidato ou não a essa categoria). Ver o alerta de LGPD
  dedicado abaixo; esta tabela não decide a base legal, só evita que o dado
  exista em mais lugares do que o necessário.
- **Índices:** `idx (category_slug, status)` — é a fila de aprovação de
  `motorista_mulher` e a lista de motoristas ativos em `pet`/`entrega` que o
  dispatch consulta.
- **Retenção:** acompanha `drivers`. Linhas `rejected` podem ser
  anonimizadas mais rápido que `approved`/`active` — guardar motivo de
  rejeição por muito tempo sem necessidade de negócio é risco sem ganho.

> ⚠️ **Alerta — base legal e minimização para o atributo de gênero, sem
> decidir por conta do dono:** a categoria `motorista_mulher` guarda, na
> prática, um atributo de gênero do motorista (autodeclarado, na
> candidatura). O desenho acima reduz o risco — **não** decide a base
> legal:
> 1. **Minimização real:** o dado só existe para quem se candidata a essa
>    categoria específica, em `driver_category_eligibility.attributes`, não
>    como coluna em `drivers` valendo para todo motorista.
> 2. **Nenhum dado de gênero do passageiro é coletado.** Quem pede a
>    corrida só escolhe a categoria `motorista_mulher` — isso basta para o
>    *matching* (motorista elegível + categoria pedida), sem o sistema
>    perguntar ou inferir o gênero de quem pede.
>
> **O que fica para o dono e, idealmente, para orientação jurídica (LGPD):**
> gênero não está na lista fechada de "dado sensível" do art. 5º da LGPD
> (saúde, origem racial/étnica, convicção religiosa/filosófica/política,
> dado genético/biométrico, vida sexual), mas é um atributo pessoal que
> este produto usa para **segregar quem recebe qual corrida** — isso pede
> base legal explícita (consentimento específico do motorista ao se
> candidatar é o caminho mais natural, mas é escolha jurídica, não de
> schema) e finalidade restrita a essa única categoria. Cronos não decide
> isso; só garante que o dado, uma vez que exista, fica no menor lugar
> possível.

### `vehicles`
- **Colunas:** `id PK`, `driver_id FK`, `plate` (formato validado),
  `brand`, `model`, `year`, `color`, `category_slug FK ride_categories`
  (só aceita linha com `kind='base_tier'` — mesmo trade-off de trigger
  descrito acima, espelhado),
  `renavam NULL`, `status CHECK IN ('active','inactive')`, `created_at`.
- **Índices:** `UNIQUE(plate)`; índice parcial
  `UNIQUE(driver_id) WHERE status='active'` — um motorista só tem **um**
  veículo ativo por vez, por desenho (não por confiança no app).
- **Retenção:** acompanha `drivers`; placa é dado identificável de veículo
  (não de pessoa física diretamente), mas junto com `driver_id` identifica —
  mesma política de anonimização na exclusão de conta.

### `driver_documents`
- **Colunas:** `id PK`, `driver_id FK`, `document_type CHECK IN ('cnh','crlv','seguro','vistoria','foto_perfil','antecedentes')`,
  `storage_ref` (chave/path em storage de objeto — **nunca o binário no
  Postgres**), `status CHECK IN ('pending','approved','rejected')`,
  `reviewed_by FK admin_users NULL`, `reviewed_at`, `expires_at NULL`,
  `uploaded_at`.
- **Índices:** `idx (driver_id, document_type)`.
- **Retenção/LGPD:** a mais sensível da lista. Bloqueada por decisão 9 do
  dono (quem analisa, prazo, critério, e **como é guardado**). Quando
  destravar: `storage_ref` com controle de acesso próprio, descartar junto
  com a conta ou no prazo legal de guarda de documento de motorista
  profissional (varia por município — decisão 16).

### `places` — endereços salvos (casa/trabalho/favoritos)
- **Colunas:** `id PK`, `account_id FK`, `label`, `address_text`,
  `latitude`, `longitude`, `created_at`.
- **Índices:** `idx (account_id)`.
- **Retenção:** apagar junto da conta (dado de localização pessoal, baixo
  valor fora do uso ativo do titular).

### `passenger_favorite_drivers` — motorista favorito (funcionalidade nova)
Pedido do dono: o passageiro marca motoristas favoritos, e a corrida vai
para o favorito quando ele estiver disponível.

- **Colunas-chave:** `passenger_id FK accounts`, `driver_id FK drivers`,
  `source CHECK IN ('post_trip','search','manual') NOT NULL`
  (origem da marcação: logo depois de uma corrida concluída com aquele
  motorista, busca direta pelo motorista, ou marcação manual numa tela de
  favoritos — guardar a origem é o que permite diferenciar "favoritei
  porque gostei da corrida" de "favoritei sem nunca ter andado com essa
  pessoa", relevante para o antifraude abaixo), `created_at` (data da
  marcação). `PK (passenger_id, driver_id)`.
- **Relação:** N:N entre `accounts` (como passageiro) e `drivers`. Não
  precisa de tabela própria de evento — criar/remover a linha já é o
  histórico (criado em `created_at`; removido = `DELETE`, sem precisar de
  soft-delete aqui, é preferência, não registro de negócio).
- **Como entra no dispatch (lógica de aplicação, não constraint de banco):**
  ao abrir uma corrida, antes de ir para a fila geral, checar se algum
  `driver_id` em `passenger_favorite_drivers` do `passenger_id` está
  disponível (`drivers.status='approved'`, sem corrida ativa, dentro de um
  raio razoável via `driver_current_locations`) e oferecer a ele primeiro.
  **Isso não dispensa a aceitação normal do motorista** — ser favorito dá
  prioridade de oferta, não força o motorista a aceitar. Essa ressalva é
  deste plano, não confirmação do dono; se a intenção dele for
  "sempre vai para o favorito, sem o motorista poder recusar", é outro
  desenho (fila com reserva) e precisa ser perguntado, não assumido.
- **Índices:** `idx (driver_id)` — é o motorista "sendo favoritado" que o
  dispatch precisa achar rápido a partir do passageiro que está pedindo;
  a `PK` já cobre a busca pela lista de favoritos do próprio passageiro.
- **Retenção/LGPD:** é dado de relacionamento entre duas pessoas reais —
  mais sensível do que parece à primeira vista, porque junta identidade
  (quem é o passageiro) com um padrão de preferência (que motorista
  específico ele sempre escolhe). Apagar a linha quando **qualquer um dos
  dois lados** anonimizar/apagar a conta (não faz sentido manter "X
  favoritou Y" depois que X ou Y deixou de existir no sistema). Não há
  motivo de negócio para retenção longa além da relação estar ativa — não
  é dado financeiro nem de auditoria.
- **Implicação de antifraude, pedida explicitamente:** a função cria um
  vetor novo que hoje não existe:
  1. **Concentração suspeita de corridas no mesmo par** passageiro↔motorista
     via favorito pode ser conluio (combinam corrida fora do padrão normal
     para fraudar repasse/pontuação, ou para contornar regra de preço
     dinâmico) — ou pode ser só um uso legítimo e saudável da função
     (familiar, vizinho). Sinal de antifraude proposto (pós-MVP, ver
     `fraud_signals` abaixo): `favorite_pair_trip_concentration` — não dá
     veredito sozinho, alimenta revisão humana.
  2. **Favoritar não deveria furar fila de forma que vire assédio** —
     um motorista não tem hoje, neste desenho, nenhuma forma de "recusar
     ser favorito" de um passageiro específico. Fica registrado como
     lacuna de produto a perguntar ao dono, não resolvida aqui: ser
     favoritado é sempre bom, ou precisa de um jeito do motorista bloquear
     um passageiro específico (que já seria outra tabela,
     `driver_blocked_passengers`, hoje fora de qualquer pedido)?

### `fare_rule_versions` — tarifa versionada
- **Colunas:** `id PK`, `city`, `category_slug FK ride_categories`,
  `base_fare_cents`, `per_km_cents`, `per_min_cents`, `minimum_fare_cents`,
  `cancellation_fee_cents`, `platform_fee_percent NUMERIC(5,2)`,
  `surge_multiplier_default NUMERIC(4,2) DEFAULT 1.0`, `effective_from`,
  `effective_to NULL`, `created_by FK admin_users`, `created_at`.
- **Índices:** `idx (city, category_slug, effective_from)`.
- **Imutável por desenho:** nunca `UPDATE` numa versão com `effective_to`
  preenchido — tarifa muda criando uma linha nova com `effective_from` novo
  e fechando a anterior. Corrida antiga nunca deve "mudar de preço"
  retroativamente porque a regra mudou.
- **Bloqueada pela decisão 7** (tarifa/taxa/repasse) — colunas acima são a
  proposta de estrutura; os valores (inclusive `platform_fee_percent`) só
  existem quando o dono decidir, e **o site já prometeu publicar essa regra
  antes de abrir cadastro de motoristas** (`docs/decisoes-do-dono.md`,
  compromisso de 18/11/2026) — isso também é regra de produto que vira
  regra de dado.
- **Pendência que as novas categorias trazem para esta tabela:** `motorista_
  mulher`, `entrega` e `pet` precisam de precificação própria (tarifa cheia
  igual a uma `base_tier`? sobretaxa fixa em cima do `base_tier` escolhido?
  frete fixo para `entrega`, já que não há "km do passageiro" nela?) — o
  dono não definiu isso, e esta estrutura comporta qualquer uma das
  respostas (uma `fare_rule_versions` por `category_slug`), mas não escolhe
  por ele.
- **Retenção:** indefinida (histórico de preço é auditoria financeira).

### `fare_quotes`
- **Colunas:** `id PK`, `account_id FK`, `origin_lat/lng`, `destination_lat/lng`,
  `category_slug FK ride_categories`, `fare_rule_version_id FK`, `estimated_distance_m`,
  `estimated_duration_s`, `estimated_price_cents`, `surge_multiplier_applied`,
  `expires_at`, `created_at`.
- **Índices:** `idx (account_id, created_at DESC)`.
- **Retenção:** curta — é cotação, não corrida. Cotação que não virou
  corrida não tem valor de negócio depois de expirar; **purgar em 30 dias**
  reduz exposição de dado de localização sem perder nada.

### `trips`
- **Colunas:** `id PK`, `passenger_id FK accounts`, `driver_id FK drivers NULL`,
  `vehicle_id FK NULL`, `category_slug FK ride_categories NOT NULL`
  (a categoria **pedida nesta corrida** — deliberadamente separada do
  `category_slug` do veículo: um pedido em `pet` usa o veículo `Conforto`
  de um motorista habilitado em `pet`, as duas colunas não precisam
  coincidir), `fare_quote_id FK NULL`,
  `status CHECK` (espelha `TripStatus` do domínio, ver seção 0),
  `matched_via CHECK IN ('dispatch','favorite') NOT NULL DEFAULT 'dispatch'`
  (ver `passenger_favorite_drivers` abaixo — só diz **como** chegou ao
  motorista, não dispensa a aceitação normal dele),
  `origin_label/address/lat/lng`, `destination_label/address/lat/lng`,
  `requested_at`, `matched_at NULL`, `started_at NULL`, `completed_at NULL`,
  `cancelled_at NULL`, `cancelled_by CHECK IN ('passenger','driver','system') NULL`,
  `cancellation_reason NULL`, `final_price_cents NULL`, `final_distance_m NULL`,
  `final_duration_s NULL`, `created_at`, `updated_at`.
- **Índices:** `idx (passenger_id, created_at DESC)` (histórico do
  passageiro); `idx (driver_id, created_at DESC)` (histórico do motorista);
  `idx (status) WHERE status NOT IN ('completed','cancelled','failed')`
  (fila operacional/dispatch — índice parcial, só nas corridas "vivas", que
  é o que o painel de operação consulta o tempo todo).
- **Regra de matching por categoria (lógica de aplicação, não constraint de
  banco):** se `category_slug` é `base_tier`, o motorista candidato precisa
  ter `vehicles.category_slug` igual; se é `modifier`, precisa de uma linha
  em `driver_category_eligibility` com `status IN ('approved','active')`
  para aquele slug. Isso é dispatch, fica fora do Postgres — só registrado
  aqui para a Vega não implementar o filtro errado.
- **Regras de cancelamento (`cancelled_by`, `cancellation_reason`,
  eventual multa) dependem da decisão 15, ainda pendente do dono** — a
  coluna existe, a regra de negócio (quando cobra, quanto) não.
- **Retenção:** atrelada a nota fiscal/financeiro — recomendação 5 anos;
  dado de localização de origem/destino é o ponto mais sensível desta
  tabela e deveria ter o mesmo prazo por estar ligado ao pagamento, não um
  prazo de privacidade mais curto isolado (dividir gera inconsistência
  contábil).

### `trip_events` — auditoria de transição (append-only)
- **Colunas:** `id PK`, `trip_id FK`, `from_status NULL`, `to_status NOT NULL`,
  `actor_type CHECK IN ('passenger','driver','system','admin')`,
  `actor_id NULL`, `reason NULL`, `metadata JSONB NULL`, `created_at`.
- **Trade-off explícito:** `actor_id` **não tem FK** — é polimórfico
  (pode apontar para `accounts.id`, `admin_users.id` ou ser nulo quando
  `actor_type='system'`). Perde integridade referencial nesse campo
  especificamente; aceito porque é trilha de auditoria imutável, não dado
  transacional — o que importa é nunca poder `UPDATE`/`DELETE` nela
  (revogar esses grants na role de aplicação).
- **Índices:** `idx (trip_id, created_at)`.
- **Retenção:** igual à de `trips` (é a prova de como a corrida evoluiu,
  relevante em disputa).

### `driver_current_locations` — posição "agora" (ver trade-off §3.2)
- **Colunas:** `driver_id PK`, `latitude`, `longitude`, `heading NULL`,
  `speed_kmh NULL`, `trip_id NULL`, `recorded_at`.
- **Tabela `UNLOGGED`** (sem WAL) — ver decisão na seção 3.
- **Índices:** PK já serve (lookup por motorista é o único acesso real;
  "motorista mais próximo" é o que justificaria índice espacial, e é
  exatamente o ponto decidido em 3.1 como fora do MVP).
- **Retenção:** não se retém — é sobrescrita a cada ping, estado efêmero.

### `trip_location_pings` — trilha amostrada (auditoria/disputa)
- **Colunas:** `id PK`, `trip_id FK`, `latitude`, `longitude`, `recorded_at`,
  `speed_kmh NULL`.
- **Só grava durante `driver_en_route`/`in_progress`, amostrado (ex.: a
  cada 10-15s ou deslocamento mínimo), nunca todo ping bruto do GPS.**
- **Índices:** `idx (trip_id, recorded_at)`.
- **Retenção: 90 dias.** Cobre a janela de disputa/reclamação; depois
  disso o que importa já está resumido em `trips.final_distance_m` e
  `final_duration_s`. É o dado mais sensível de localização do sistema em
  volume — reter menos tempo é proteção real, não burocracia.

### `trip_price_components`
- **Colunas:** `id PK`, `trip_id FK`, `component_type CHECK IN
  ('base_fare','distance','time','surge','platform_fee','driver_payout',
  'cancellation_fee','discount','tax')`, `amount_cents` (pode ser negativo
  em `discount`), `description NULL`, `created_at`.
- **Por quê normalizado e não um JSON de preço:** é o que operacionaliza a
  decisão 7 — permite somar `platform_fee` e `driver_payout` por período
  sem reprocessar texto, e é a base de conciliação financeira (fase 3 do
  roadmap).
- **Índices:** `idx (trip_id)`; `idx (component_type, created_at)` (relatório
  financeiro por tipo de componente e período).
- **Retenção:** igual a `trips` (é o detalhamento do valor cobrado).

### `payments`
- **Colunas:** `id PK`, `trip_id FK UNIQUE` (1:1 — MVP não cobre pagamento
  parcelado/dividido), `account_id FK` (pagador), `provider`,
  `provider_payment_id`, `method CHECK IN ('pix','credit_card','debit_card')`,
  `amount_cents`, `status CHECK` (espelha `PaymentStatus` do domínio),
  `authorized_at NULL`, `declined_reason NULL`, `refunded_at NULL`,
  `created_at`, `updated_at`.
- **Nunca armazenar PAN/CVV** — só token/referência do provedor
  (`ARQUITETURA_E_REGRAS.md` já proíbe isso explicitamente).
- **Índices:** `UNIQUE(provider_payment_id)` — é o que garante
  processamento idempotente de webhook do provedor (reentrega de webhook
  não duplica pagamento).
- **Bloqueada pela decisão 3** (provedor de pagamento) — `provider`/`method`
  ficam genéricos até lá; se o provedor escolhido tiver split nativo
  (recomendação do dono), o repasse pode nascer direto de `payments`/
  `trip_price_components` em vez de reconciliação manual.
- **Retenção:** fiscal, mesma política de `trips` (5 anos recomendado,
  confirmar com contador).

### `trip_ratings`
- **Colunas:** `id PK`, `trip_id FK UNIQUE`, `rater_role CHECK IN
  ('passenger')` (propositalmente fixo — decisão de 18/11: só o passageiro
  avalia), `rater_id FK accounts`, `ratee_id FK drivers`, `stars SMALLINT
  CHECK (stars BETWEEN 1 AND 5)`, `comment NULL`, `created_at`.
- **Por que `rater_role` como CHECK em vez de omitir a coluna:** quando a
  avaliação mútua for revisitada (o próprio dono já registrou que vai gerar
  atrito — "por que só eu sou avaliado?"), basta relaxar o CHECK e inserir
  linhas com `rater_role='driver'`; não exige nova tabela nem migração
  estrutural.
- **Índices:** `idx (ratee_id)` (nota média do motorista).
- **Retenção:** acompanha `trips`.

### `notifications`
- **Colunas:** `id PK`, `account_id FK`, `type`, `title`, `body`,
  `data JSONB NULL`, `channel CHECK IN ('push','sms','email','whatsapp')`,
  `status CHECK IN ('queued','sent','delivered','failed','read')`,
  `sent_at NULL`, `read_at NULL`, `created_at`.
- **Índices:** `idx (account_id, created_at DESC)` (inbox);
  `idx (status) WHERE status='queued'` (fila do worker de envio).
- **Retenção: 180 dias.** É dado operacional/efêmero, não histórico de
  negócio — reter indefinidamente só acumula PII (corpo da notificação
  pode citar endereço, valor) sem ganho.

### `admin_users`
- **Colunas:** `id PK`, `account_id FK accounts NULL UNIQUE` (só se o
  mesmo humano também usa os apps, opcional), `email`, `password_hash`,
  `role CHECK IN ('support','finance','superadmin')`, `created_at`,
  `deactivated_at NULL`.
- **Retenção:** dado interno (funcionário/colaborador), fora do escopo de
  "titular externo" da LGPD no mesmo sentido — ainda assim, desativar
  (`deactivated_at`) em vez de apagar, pela ligação com `admin_audit_log`.

### `admin_audit_log`
- **Colunas:** `id PK`, `admin_id FK admin_users`, `action` (ex.:
  `'driver.approved'`), `target_type`, `target_id`, `before JSONB NULL`,
  `after JSONB NULL`, `ip_address NULL`, `created_at`.
- **Trade-off explícito (mesmo padrão de `trip_events`):** `target_id` é
  polimórfico, sem FK — aceito pelo mesmo motivo: é trilha de prestação de
  contas, não dado operacional. Compensar revogando `UPDATE`/`DELETE` para
  a role de aplicação nesta tabela.
- **Índices:** `idx (target_type, target_id)`; `idx (admin_id, created_at)`.
- **Retenção: indefinida** (ou mínimo legal de 5 anos). É pequena em
  volume e é exatamente a prova de quem aprovou/rejeitou o quê — não tem
  por que ter o mesmo ciclo curto de dados operacionais.

---

## 3. Entidades — pós-MVP

| Tabela | Por que fica para depois |
|---|---|
| `driver_payout_batches`, `driver_payouts` | depende inteiramente da decisão 3 (provedor com split) e 6 (regra de saque: frequência, taxa, mínimo) |
| `support_tickets`, `support_messages` | decisão 11 (canal de suporte) ainda não formalizada; hoje `contato@vuumbora.com.br` resolve manualmente. Schema simples, baixo esforço de adicionar quando decidir — não precisa nascer com o MVP |
| `fraud_signals` | sinal de antifraude só é útil com volume real de corridas; antes disso é tabela vazia sem padrão para detectar. Exemplo de `signal_type` já previsto: `favorite_pair_trip_concentration` (ver `passenger_favorite_drivers`) |
| Endereço completo do motorista (`driver_addresses` — etapa 2 do cadastro) | bloqueado por decisão 9 (verificação de documentos) e pela decisão já tomada de 2 etapas (19/11/2026): endereço residencial só é coletado **depois** da aprovação |
| Carteira/saldo (`wallet_accounts`, `wallet_transactions`) | dono ainda não decidiu o item 4; recomendação registrada em `docs/decisoes-do-dono.md` é **não construir** por ora. Se vier a existir, cobrir com Órion antes de qualquer linha de código — é a decisão mais pesada da lista (item 5, transferência entre usuários, nem deveria existir) |
| Agendamento de corrida | decisão 14, 🟢, adiada pelo próprio dono |
| Indique e ganhe | decisão 12, depende de carteira (item 4), também adiada |

---

## 4. Decisões com trade-off explícito

### 4.1 PostGIS ou não

**Decisão: não, para o MVP.**

| | Sem PostGIS (lat/lng `double precision` simples) | Com PostGIS |
|---|---|---|
| Operação | fácil — tipo nativo, sem extensão extra para validar no Easypanel | precisa confirmar que a extensão está disponível/habilitada no Postgres gerenciado, e manter no backup/restore |
| Consulta "motorista mais próximo" | em 1 cidade (Natal/RMN, decisão 16), com volume baixo de motoristas simultâneos, um filtro por bounding-box + distância calculada na aplicação (haversine) resolve sem índice especial | índice GiST + `ST_DWithin` é a solução correta em escala — mas é otimização prematura para MVP de uma cidade |
| Custo de trocar depois | baixo: adicionar `geography(Point)` gerada a partir de `lat/lng` e um índice GiST é aditivo, não quebra nada existente | — |

Revisitar quando: mais de uma cidade operando simultaneamente, ou volume de
motoristas por km² que torne busca por bounding-box lenta na prática (medir
antes de trocar, não assumir).

### 4.2 Onde guardar posição em tempo real

**Decisão: posição "agora" fora da tabela durável de longo prazo; histórico
de corrida, amostrado, dentro do Postgres.**

| Opção | Uso |
|---|---|
| `driver_current_locations`, tabela `UNLOGGED` no mesmo Postgres | 1 linha por motorista, `UPSERT` a cada ping (a cada poucos segundos). `UNLOGGED` evita o custo de WAL numa linha que é sobrescrita constantemente — o risco aceito é perder a posição atual (não o histórico) num crash do banco, que é irrelevante porque o próximo ping do celular já a repõe em segundos |
| Redis (ou equivalente), se/quando entrar no stack | mesma função, mais rápido e sem nenhum custo de I/O em disco; vira a opção natural se o Vulcano já provisionar Redis para outra coisa (fila, cache) — não vale introduzir um serviço novo só por isso agora |
| `trip_location_pings`, Postgres comum, amostrado | única parte que precisa ser **durável**: a trilha da corrida para resolver disputa ("o motorista fez esse trajeto?"). Grava amostrado (10-15s), não todo ping — guardar ping bruto de GPS de toda corrida ativa seria a tabela de maior volume de escrita do sistema sem ganho correspondente |

**O que fica explicitamente fora do MVP:** série temporal dedicada
(TimescaleDB, InfluxDB) — não há volume ainda que justifique outro banco só
para isso; Postgres com particionamento simples por mês resolve até o
sistema ter motivo real de medir o contrário.

### 4.3 Histórico de tarifa versionado

**Decisão: sim, versionado desde o início** (`fare_rule_versions`,
seção 2) — mesmo com os valores em branco até a decisão 7. O motivo de
decidir isso já na estrutura, e não só nos dados: corrida já concluída não
pode ter seu preço recalculado se a tarifa mudar depois — e isso só se
garante se o preço final referenciar a **versão** da regra usada no momento
da cotação, nunca "a regra atual".

---

## 5. Estratégia de migração

Seguindo o padrão já estabelecido em `0001`/`0002`
(`apps/api/migrations/`): numeração sequencial, `CREATE EXTENSION IF NOT
EXISTS pgcrypto` repetido (idempotente, sem custo), `CREATE TABLE IF NOT
EXISTS`, comentário no SQL citando a decisão do dono que origina cada
tabela/coluna, índice único separado da PK quando é regra de negócio.

Como **nenhuma destas tabelas existe em produção ainda**, a primeira rodada
de migrações (criar as tabelas do MVP) não tem problema de downtime — tabela
nova e vazia não trava ninguém. O padrão de **expand/contract sem downtime**
passa a valer depois, nas próximas alterações em tabelas que já têm linha:

- adicionar coluna: sempre `ADD COLUMN IF NOT EXISTS ... NULL` (sem
  `NOT NULL` direto, sem `DEFAULT` que force reescrita de tabela grande em
  versões antigas de Postgres — Postgres 11+ já otimiza `DEFAULT` constante,
  mas não assumir isso sem checar a versão real do Easypanel);
- adicionar valor num `CHECK`/enum (ex.: novo status de corrida): `ALTER
  TABLE ... DROP CONSTRAINT`, `ADD CONSTRAINT ... CHECK (...) NOT VALID`,
  depois `VALIDATE CONSTRAINT` em separado — evita o lock exclusivo longo de
  validar contra todas as linhas existentes na mesma transação que troca a
  regra;
- nunca remover coluna/tabela na mesma migração que para de usá-la no
  código — primeiro o código para de ler, depois (migração seguinte) a
  coluna sai.

**Proposta de sequência (não criada nesta entrega):**

| Nº | Conteúdo | Depende de |
|---|---|---|
| 0003 | `accounts`, `account_roles` | — |
| 0004 | `ride_categories`, `drivers`, `vehicles` | 0003 |
| 0005 | `driver_category_eligibility` | 0004 — modo de `entrega` a confirmar antes |
| 0006 | `driver_documents` | 0004, decisão 9 |
| 0007 | `places`, `passenger_favorite_drivers` | 0003, 0004 |
| 0008 | `fare_rule_versions`, `fare_quotes` | 0003, 0004 — valores reais travados pela decisão 7 |
| 0009 | `trips`, `trip_events` | 0003–0008 |
| 0010 | `driver_current_locations` (`UNLOGGED`), `trip_location_pings` | 0009 |
| 0011 | `trip_price_components` | 0008, 0009 |
| 0012 | `payments` | 0009, decisão 3 |
| 0013 | `trip_ratings` | 0009 |
| 0014 | `notifications` | 0003 |
| 0015 | `admin_users`, `admin_audit_log` | — |

Pós-MVP (`driver_payouts`, `support_tickets`, `fraud_signals`, endereço do
motorista, carteira) entram em migrações próprias, só quando a decisão do
dono que os destrava existir.

---

## 6. Backup e recuperação

**Hoje não há política definida nem testada** — isto é pendência real, não
suposição otimista. Proposta mínima para o Vulcano validar no Easypanel:

1. Dump automático diário (`pg_dump` ou o backup nativo do Easypanel, se
   oferecer) com retenção de 14-30 dias.
2. Cópia do backup **fora do mesmo volume/host** do banco — backup que mora
   no mesmo disco que pode falhar não protege contra a falha mais comum.
3. **Teste de restauração mensal**, de verdade: restaurar o dump mais
   recente num banco descartável e confirmar que as tabelas e contagens de
   linha fazem sentido. Backup nunca testado não é backup — e isto ainda não
   foi feito nenhuma vez neste projeto.

---

## 7. N+1 a evitar (aviso para a Vega, de antemão)

Nenhum endpoint existe ainda, então não há N+1 para caçar de verdade — mas
o desenho já aponta os pontos de risco previsíveis:

- **Histórico de corridas** (lista de `trips` do passageiro ou motorista):
  buscar nome/foto do motorista ou passageiro por corrida **um a um** em
  loop é o erro clássico. Resolver com `JOIN` numa query só, ou `IN (...)`
  em lote — nunca uma query por linha da lista.
- **Detalhe de uma corrida:** `trip` + `trip_price_components` +
  `trip_events` + `payment` + `rating` numa tela só — 4-5 tabelas, mas é
  **uma** corrida: uma query por tabela (não por linha) é aceitável aqui,
  não é N+1.
- **Fila de aprovação de motorista:** listar `drivers` pendentes e buscar
  `driver_documents` de cada um separadamente é N+1 disfarçado — `JOIN` ou
  `IN` pelo lote de `driver_id`s da página.

---

## 8. O que depende do dono (não é decisão técnica)

| Pendência | O que trava no schema |
|---|---|
| **Decisão 7** — tarifa, taxa da plataforma, repasse (🔴, ainda aberta) | valores reais de `fare_rule_versions`; sem ela as colunas existem vazias e `trip_price_components` não tem o que gravar em `platform_fee`/`driver_payout` |
| **Decisão 3** — provedor de pagamento (com ou sem split) | formato de `payments.provider`/`method`; se o split for nativo do provedor, `driver_payouts` pode nascer mais simples (espelho do provedor) em vez de conciliação manual |
| **Decisão 4** — carteira com saldo | se o dono reverter a recomendação (não construir), existe todo um conjunto de tabelas (`wallet_accounts`, `wallet_transactions`) fora deste plano, de peso regulatório equivalente a criar instituição de pagamento |
| **Decisão 9** — verificação de documentos do motorista | quem aprova, prazo, critério, e como guardar — sem isso `driver_documents` e o endereço da etapa 2 continuam vazios por desenho, não por falta de coluna |
| **Decisão 16** — cidade(s) de lançamento | hoje o site já assume Natal/RMN como argumento de marketing (decisão de 19/11), mas `fare_rule_versions.city` e as exigências municipais de cadastro de motorista (ligadas à decisão 9) seguem formalmente pendentes |
| **Decisão 13** — ✅ **resolvida** (20/11/2026): nomes confirmados — VuumBora, Conforto, Motorista mulher, Entrega, Pet; moto fora do lançamento | refletida em `ride_categories`; o que falta é só o **preço** de cada uma em `fare_rule_versions`, que continua sob a decisão 7 |
| **Nova pendência — modo de elegibilidade de `entrega`** | o dono definiu `pet` como opt-in e `motorista_mulher` como candidatura/aprovação, mas não disse qual dos dois vale para `entrega`. Este plano assumiu opt-in por semelhança a `pet`; confirmar antes de implementar `driver_category_eligibility` |
| **Nova pendência — base legal para o atributo de gênero de `motorista_mulher`** | ver alerta dedicado na seção de `driver_category_eligibility`; não é decisão de schema, é jurídica |
| **Nova pendência — motorista pode recusar ser favorito de um passageiro?** | `passenger_favorite_drivers` hoje só dá prioridade de oferta; não existe mecanismo de bloqueio do lado do motorista. Levantado como lacuna, não resolvido |
| **Decisão 15** — regras de cancelamento (prazo, multa, quem recebe) | `trips.cancelled_by`/`cancellation_reason` existem; a regra de quando cobra e quanto vai para o motorista não |
| **Decisão 11** — canal de suporte formal | hoje é e-mail humano (`contato@vuumbora.com.br`); `support_tickets`/`support_messages` ficaram pós-MVP até isso formalizar |

---

## 9. Resumo — MVP vs pós-MVP

**MVP:** `accounts`, `account_roles`, `drivers`, `ride_categories`,
`driver_category_eligibility`, `vehicles`, `driver_documents` (estrutura
pronta, vazia até decisão 9), `places`, `passenger_favorite_drivers`,
`fare_rule_versions`, `fare_quotes`, `trips`, `trip_events`,
`driver_current_locations`, `trip_location_pings`, `trip_price_components`,
`payments`, `trip_ratings`, `notifications`, `admin_users`,
`admin_audit_log`.

**Pós-MVP:** `driver_payouts`, `driver_payout_batches`, `support_tickets`,
`support_messages`, `fraud_signals`, endereço completo do motorista
(etapa 2), qualquer coisa de carteira/saldo.
