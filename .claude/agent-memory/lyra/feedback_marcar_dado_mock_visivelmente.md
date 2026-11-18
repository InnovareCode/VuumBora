---
name: feedback_marcar_dado_mock_visivelmente
description: Como sinalizar visualmente dado/recurso de DEMONSTRAÇÃO (preço, ETA, nome, promoção, "Agendar") numa tela de alta fidelidade sem tratar mockup como regra de negócio — padrão usado na P03/Home do passageiro, repete em qualquer tela nova baseada em referencias/*.png.
metadata:
  type: feedback
---

**Regra do projeto (não é opinião minha):** `especificacoes/PASSAGEIRO.md` e
`especificacoes/MOTORISTA.md` dizem explicitamente "telas são propostas, não
recursos implementados" e listam que preço/ETA são "estimados", que
"motorista verificado"/promoções/carteira "dependem de operação real". O Atlas já
reforçou isso na P03: todo dado fabricado (preço, ETA, nome do usuário, "10% OFF",
"motoristas verificados", "suporte 24h", "Agendar") tem que ficar **visivelmente**
marcado como mock, não só documentado em comentário de código.

**Padrão criado na P03 (18/11/2026):** componente `MockBadge` em `packages/ui`
(selo pequeno com glifo `!` + texto curto, cor `theme.role.warning`,
`accessibilityLabel="Dado de X, não é real"`). Uso:
- **Um selo por ponto de dado fabricado**, texto curto e específico (`"nome de
  exemplo"`, `"mapa ilustrativo"`, `"preço e tempo estimados"`, `"promoção
  fictícia"`, `"demo"`) — nunca um aviso genérico único no topo da tela (isso
  dilui qual dado exatamente é fake).
- **Em espaço apertado** (card de atalho ~74-90px de largura), usar o `label` mais
  curto possível (`"demo"`) — o `MockBadge` com texto longo (`"demonstração"`)
  não cabe e quebra o layout do card.
- **Não** marcar toda contagem de UI (badge de notificação "3", badge de mensagem
  "2") como mock — são affordance de interação padrão, não dado de negócio
  fabricado; marcar isso seria ruído e sairia do escopo pedido.

**Decisão de arquitetura junto:** o mapa é SEMPRE mock até o SDK ser escolhido
(`docs/decisions.md`) — então todo preview de mapa futuro (P04 em diante) também
precisa do `MockBadge` "mapa ilustrativo" + `accessibilityLabel` deixando isso
explícito, não só visual.
