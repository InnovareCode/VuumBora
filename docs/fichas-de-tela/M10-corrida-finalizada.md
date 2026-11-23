# M10 · Corrida finalizada (resumo do motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Proposta: `/finalizada?tripId=` · `apps/driver/app/(app)/finalizada.tsx`, aberta com `router.replace` depois do `complete` |
| Spec | `MOTORISTA.md`, M10: resumo, repasse, confirmação. Regras: valores reais da API, nada das cifras do mockup; valores e repasses com cálculo auditável (critério 3) |
| Alvo visual | Sem recorte: herda o valor em destaque da "Solicitação de Corrida" (M06) e o cartão-linha do "Histórico de Corridas" (M12) |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | **7** (o que o motorista vê: valor cobrado, taxa e repasse; D-23), **6** (quando o dinheiro fica disponível; nunca prometer prazo), **PP-13** (volta online sozinho?), D-19 (o motorista não avalia), D-38; S4 (`complete`), S5 (valor final e repasse) |
| Ordem | Onda 4 |

## 1. Pergunta que a tela responde

"Quanto eu ganhei nesta corrida, e o que faço agora?" Sucesso: o motorista vê o ganho da corrida e volta ao painel (online,
pronto para a próxima) com um toque.

## 2. Layout

A finalização é confirmada na M09 (diálogo); a M10 é o **resultado**. Tela curta, sem mapa, com `AppShell glow`.

```
390×844
┌──────────────────────────────┐
│ safe area + glow              │
│          ( ✓ )                │  pastilha 56, CheckCircle 32 role.success
│     Corrida finalizada        │  title 22 bold, centro
│   Lagoa Nova → Tirol · 10:36  │  small, textSecondary (bairros, como no histórico)
│ ↓ 20                          │
│ ┌──────────────────────────┐ │  SurfaceRaised, centro
│ │      Ganho estimado       │ │  caption (rótulo por D-23 / decisão 7)
│ │        R$ 18,90           │ │  display 34 bold tabular (N2)
│ ├──────────────────────────┤ │
│ │ 4,8 km · 14 min · VuumBora│ │  small, textSecondary
│ └──────────────────────────┘ │
│ (selo: valor de demonstração) │
│ ↓ 20                          │
│ [!  Relatar um problema    › ] │  ListRow → M14 com a corrida
│        ↕ espaço flexível      │
│ [    Voltar ao painel     ] 56│  PrimaryButton (N1)
│ safe area                     │
└──────────────────────────────┘
```

- **Sem avaliar o passageiro** (D-19, decidido). "Relatar um problema" é o caminho para o que a avaliação resolveria
  (sujeira, agressão, espera), pelo canal de suporte; não cria nota pública.
- **"Ganho estimado" até o S5**: o valor final e o repasse só existem com pagamento real e com a decisão 7 publicada. Quando
  existirem, o cartão ganha as linhas "Valor da corrida", "Taxa da plataforma ({faixa})" e "Você recebe", na ordem do
  `docs/decisoes-do-dono.md:694-708` (a faixa aplicada precisa ser explicável). Até lá, uma linha só.
- **Nunca** prazo de repasse ("cai amanhã", "em 2 dias"): é promessa proibida enquanto a decisão 6 não existir.
- **320×568:** a pastilha some; título à esquerda; o botão no `FooterActions`.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Voltar ao painel" |
| N2 | Ganho da corrida |
| N3 | Bairros e hora, distância, duração, categoria |
| N4 | "Relatar um problema" |
| N5 | Rótulo, selo |

Amarelo: 1 bloco. Nenhum sinal. O ícone de sucesso é verde.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell glow` + `FooterActions` em altura < 640 | — |
| Sucesso | pastilha 56 + `CheckCircle` | `withAlpha(role.success, 0.14)` |
| Valor | `SurfaceRaised` + `MoneyText` (C-10) | `display`, `tabularNums` |
| Linha | `ListRow` (C-08) | ícone `textSecondary` |
| Ação | `PrimaryButton` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Como no layout | `M10-padrao-*` |
| Carregando | O valor em esqueleto (mesma altura) enquanto o servidor fecha a corrida; o título já aparece | `M10-carregando-*` |
| Valor em fechamento | Se o valor final demorar mais de 8 s: "O valor aparece no histórico em instantes." e o número some; o N1 continua | `M10-valor-pendente-*` |
| Carregando ação | O "Voltar ao painel" não chama o servidor se o motorista continua online (PP-13); se a regra for "volta offline", o botão vira "Ficar online" com spinner | — |
| Vazio | n/a | — |
| Erro de carga | `InlineAlert` "Não foi possível carregar o resumo agora." + "Tentar de novo"; o N1 continua | `M10-erro-*` |
| Sem rede | `NetworkBanner`; o resumo já carregado fica; "Voltar ao painel" funciona | `M10-sem-rede-*` |
| Texto longo | Bairros "Parque das Nações → Cidade da Esperança" em 2 linhas; R$ 1.234,56 inteiro | `M10-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Rola; o botão fixo | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Um selo embaixo do valor | sim |

## 6. Microinterações

- Entrada (do diálogo da M09): ícone com fade e escala 0,9 → 1 (200 ms); resposta tátil de sucesso. Com "reduzir movimento",
  só fade.
- "Voltar ao painel": `router.replace('/')`; a M05 aparece no estado online (se o servidor manteve).

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Corrida finalizada |
| Linha | {bairro} → {bairro} · {hh:mm} |
| Valor | Ganho estimado *(D-23: "Você recebeu" só com repasse real; "Valor da corrida" se a decisão 7 mostrar o cobrado)* |
| Detalhe | {d} · {n} min · {categoria} |
| Linha de ajuda | Relatar um problema |
| N1 | Voltar ao painel |
| Pendente | O valor aparece no histórico em instantes. |
| Erro | Não foi possível carregar o resumo agora. · Tentar de novo |
| Selo | valor de demonstração |

## 8. Acessibilidade

- Ao entrar, anuncia "Corrida finalizada. Ganho estimado {valor}".
- Título como cabeçalho.

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Ganho | não existe | `DriverTripSnapshot.estimatedPayout` (S4); valor final e repasse do S5 (`trip_price_components`) | "valor de demonstração" |
| Distância, duração, categoria | não existe | snapshot da corrida concluída | idem |
| Estado online depois | não existe | `DriverPhase` do servidor (PP-13) | — |

## 11. Lacunas do protótipo

A tela não existe.

## 12. Pedidos de componente

Nenhum novo.

## 13. Portão: itens próprios

- Exatamente 1 bloco amarelo; o valor é o maior texto e não trunca em 320.
- Nenhum prazo de repasse em texto nenhum (G-26).
- Nenhum controle de avaliação do passageiro (D-19).
- G-07b não se aplica; comparação com a captura aprovada da M06 (cartão de valor).
- Capturas: `motorista/M10-{padrao,carregando,valor-pendente,erro,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não há regra escrita sobre o motorista voltar online sozinho depois de finalizar (PP-13). O `DriverPhase` tem `completed`
(`packages/domain/src/driver/index.ts:16`), mas não diz o que vem depois.
