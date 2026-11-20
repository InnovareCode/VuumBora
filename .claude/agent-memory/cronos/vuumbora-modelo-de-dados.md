---
name: vuumbora-modelo-de-dados
description: Modelo de dados de alto nível do VuumBora (Postgres) — tabelas, trade-offs decididos (PostGIS, posição em tempo real, tarifa versionada) e o que ainda depende do dono
metadata:
  type: project
---

Plano completo em `docs/plano-sistema-dados.md` (sem migração criada ainda —
é planejamento). Primeira passada de modelagem de domínio do VuumBora
(20/11/2026); antes só existiam `0001_create_waitlist_signups.sql` e
`0002_create_driver_applications.sql`.

**Convenções que vêm de `packages/domain/src/index.ts` e já são lei no
schema:** dinheiro em centavos BRL, UUID com `pgcrypto`, `TIMESTAMPTZ`,
`trips.status` tem que espelhar `TripStatus` do domínio exatamente (mesmos
valores, mesma ordem de ideia), idem `payments.status`/`PaymentStatus`.

**Decisões de trade-off tomadas no plano (vale reusar, não re-derivar):**
- **Sem PostGIS no MVP.** 1 cidade (Natal/RMN), volume baixo — lat/lng
  simples + bounding box/haversine na aplicação resolve. PostGIS entra só
  se/quando houver múltiplas cidades ou volume que torne isso lento de
  verdade (medir, não assumir).
- **Posição em tempo real não é 1 tabela durável de ping bruto.** Posição
  "agora" do motorista fica numa tabela `UNLOGGED` (ou Redis, se entrar no
  stack) — sobrescrita a cada ping, perder não importa. Só a trilha da
  corrida é durável, e **amostrada** (10-15s), não todo ping — vira
  `trip_location_pings`, retenção 90 dias (suficiente para disputa).
- **Tarifa é versionada desde o início** (`fare_rule_versions`,
  imutável — nunca `UPDATE` numa versão já fechada por `effective_to`).
  Corrida antiga não pode mudar de preço porque a regra mudou depois.

**Categorias de corrida (decisão 13, resolvida em 20/11/2026 — publicadas
no site):** VuumBora, Conforto (tier do veículo, `kind='base_tier'`,
elegibilidade automática) + Motorista mulher (candidatura/aprovação),
Entrega (sem passageiro no banco, `carries_passenger=false`), Pet (opt-in do
motorista) — os 3 últimos são `kind='modifier'`, elegibilidade por tabela
própria `driver_category_eligibility`, não por coluna solta em `drivers`.
Moto ficou fora do lançamento. **Modo de elegibilidade de `entrega` não foi
dito pelo dono** — assumi opt-in por semelhança a `pet`, fica como pendência
a confirmar antes de implementar.

**Atributo de gênero (categoria Motorista mulher) — ponto de minimização
decidido no schema, não na lei:** o autodeclarado do motorista mora só em
`driver_category_eligibility.attributes` (JSONB), nunca em `drivers` —
existe só para quem se candidata àquela categoria específica, não para todo
motorista. Base legal (consentimento específico é o caminho mais natural)
é decisão jurídica, não foi resolvida aqui.

**Motorista favorito (funcionalidade nova, pedida em 20/11/2026):**
`passenger_favorite_drivers` (N:N accounts×drivers, com `source` e
`created_at`). Dá **prioridade de oferta** no dispatch, não força aceitação
do motorista (ressalva deste plano, não confirmação do dono — se a
intenção real for "sempre vai, sem poder recusar", é outro desenho). Sem
mecanismo do motorista bloquear um passageiro específico — lacuna
levantada, não resolvida. Retenção: apaga quando qualquer um dos dois lados
sai do sistema. Antifraude: sinal proposto
`favorite_pair_trip_concentration` (conluio via concentração de corridas no
mesmo par) — pós-MVP, alimenta revisão humana, não decide sozinho.

**Padrão de integridade "FK condicionado por outra coluna":** Postgres não
expressa isso nativamente (ex.: `vehicles.category_slug` só deveria aceitar
`ride_categories` com `kind='base_tier'`). Resolvido com trigger
`BEFORE INSERT/UPDATE`, não com confiança no código da aplicação — vale
repetir esse padrão sempre que aparecer "FK que só é válida se outra coluna
tiver certo valor".

**Pendências de negócio que travam valor real (não travam o desenho):**
decisão 7 (tarifa/taxa/repasse, 🔴 ainda aberta — compromisso público do
dono é publicar antes de abrir cadastro de motorista), decisão 3 (provedor
de pagamento/split), decisão 9 (verificação de documento do motorista).
Ver `docs/decisoes-do-dono.md`.

Ver [[vuumbora-contexto]] e [[vuumbora-taxa-e-repasse]] (memória do Atlas,
projeto) para o contexto de produto por trás dessas decisões.
