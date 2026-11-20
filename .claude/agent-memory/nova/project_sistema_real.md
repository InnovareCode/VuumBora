---
name: project-sistema-real
description: Arquitetura do sistema real VuumBora (20/11/2026) — monólito modular, Redis efêmero, despacho sequencial, categorias como elegibilidade, favorito, fases S0-S9
metadata:
  type: project
---
Plano em docs/plano-sistema-arquitetura.md (fases S0..S9, distintas das Fases 1-6 do PLANO.md). Escolhas propostas:
- Backend: crescer apps/api (Fastify+pg+zod) como monólito modular; fila no Postgres (enfileirar na mesma transação); Redis só efêmero (GEO, pub/sub, limites) — "Redis pode sumir sem perder dinheiro".
- Admin: SPA React+Vite em apps/admin (não Next, não Expo web). Tempo real: WebSocket nativo, "WS avisa, REST é a verdade" (seq + resync).
- Despacho sequencial (1 oferta por vez, 15s, expiração por job), aceite atômico por UPDATE condicional.
- Categorias do lançamento (dono, 20/11): VuumBora, Conforto, Motorista mulher, Entrega, Pet; Moto fora. São filtros de elegibilidade; nunca rebaixar categoria sem consentimento.
- Motorista favorito: só quem já fez corrida concluída; janela exclusiva única; fallback sem penalidade; passageiro nunca vê disponibilidade; sinais antifraude de combinação por fora.
- Lacuna proposta no domínio: motorista cancela após aceite → volta para searching_driver.

**Why:** escala hipotética ~1.000 corridas/dia, um servidor Easypanel, squad pequena; lei pode mudar (Natal redigindo lei nova; PLP 152/2025 propõe teto de 30% de taxa) → taxa e documentos configuráveis.
**How to apply:** não reabrir sem motivo novo; orçamento, prazo, gateway, cidades e agendamento seguem como decisão do dono (§12 do doc). Web tools (WebSearch/WebFetch) falharam nesta sessão; busca funcionou via node fetch em html.duckduckgo.com.
