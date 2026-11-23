# P10 · Viagem concluída

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/concluida` · `apps/passenger/app/(app)/concluida.tsx` + `src/components/trip/ReceiptBreakdownRow.tsx` |
| Spec | `PASSAGEIRO.md`, P10: valor final, comprovante, avaliação, suporte. Critério 4: depois da finalização, apresentar comprovante e permitir avaliação |
| Alvo visual | Sem recorte: herda a linguagem do Histórico (P11, recorte 376, 522, 640, 976) e o cartão de valor em destaque da §18.1, item 4 |
| Estado hoje | UI; valor e comprovante fabricados; avaliação só local |
| Última nota | 4,5 (18/11). F1 a F5 tratados no código, **não medidos** |
| Depende de decisão | **7** e **plano D-06** (o que é "valor final" e o que o comprovante detalha), **3** (forma de pagamento), favorito (S4, `plano-sistema.md` §6.3), **D-38**; S4 (`rating`, `receipt`) |
| Ordem | Onda 4 |

## 1. Pergunta que a tela responde

"Quanto custou, e como foi?" Sucesso: a pessoa vê o valor, avalia em um toque (ou pula) e volta ao início; o comprovante fica
a um toque.

## 2. Layout

Tela sem mapa (a viagem acabou), com `AppShell scroll glow`. Um bloco de valor em destaque no padrão "rótulo pequeno em cima,
número grande embaixo" (§18.1, item 4), a avaliação como o centro da tela, e o comprovante como **uma linha** que leva ao
detalhe do Histórico (P11), em vez de repetir a nota fiscal aqui.

```
390×844
┌──────────────────────────────┐
│ safe area + glow              │
│        ( ✓ )                  │  pastilha 56, ícone CheckCircle 32 em role.success
│   Corrida concluída           │  title 22 bold, centro (N3 como título; não é ação)
│   Midway Mall, Tirol · 10:36  │  small, textSecondary
│ ↓ 20                          │
│ ┌──────────────────────────┐ │  SurfaceRaised, centro
│ │        Valor final        │ │  caption, textSecondary
│ │        R$ 23,90           │ │  display 34 bold tabular (N2)
│ │        Pago com Pix       │ │  small, textSecondary (decisão 3)
│ └──────────────────────────┘ │
│ (selo: valor de demonstração) │
│ ↓ 20                          │
│ Como foi a corrida com Carlos?│  section (body bold)
│   ☆ ☆ ☆ ☆ ☆                   │  StarRating 32 pt, estrelas lucide
│ [Comentário (opcional)      ] │  TextInput, aparece depois da 1ª estrela
│ ↓ 16                          │
│ [    Enviar avaliação     ] 56│  PrimaryButton (N1), desabilitado sem estrela
│        Agora não              │  LinkButton (N4)
│ ↓ 20                          │
│ [🧾 Ver comprovante        › ] │  ListRow
│ [?  Ajuda com esta corrida  › ] │  ListRow → P14 com a corrida
└──────────────────────────────┘
```

**Dois estados, um amarelo cada:**

| Estado | N1 | N4 |
|---|---|---|
| Avaliar | "Enviar avaliação" (desabilitado sem estrela) | "Agora não" → volta ao início |
| Avaliada | "Voltar ao início" | — |

Na avaliada, o bloco de estrelas encolhe para uma linha ("Sua avaliação: ★★★★★", estrelas de 16) e o `Toast` diz
"Avaliação enviada." Hoje há **dois** `PrimaryButton` na mesma tela (`concluida.tsx:146,165`): é o defeito de hierarquia
mais visível.

- **Valor final ou estimado:** com o plano D-06 = "preço fechado na cotação", o valor é o da cotação e o rótulo é "Valor da
  corrida". Pelo trajeto real, é "Valor final", e pode diferir do estimado: nesse caso, uma linha embaixo, "Estimado: R$
  21,50", em `caption`. Até a decisão, "Valor final" com selo.
- **Favoritar o motorista** (MVP no plano, `plano-sistema.md:306`): só com a regra do S4 pronta. Quando entrar, é uma
  `ToggleSwitch` dentro do bloco de avaliação ("Guardar Carlos como motorista favorito"), que vai no mesmo envio
  (`favorite` no `POST /v1/trips/:id/rating`). Não nasce antes.
- **320×568:** a pastilha do ícone some; o título fica à esquerda; o bloco de valor tem 96 pt; o CTA fica no
  `FooterActions` (C-04) para ficar visível sem rolar (G-11).
- **430×932:** igual, centralizado em 480 de largura útil.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Enviar avaliação" (avaliar) ou "Voltar ao início" (avaliada) |
| N2 | Valor |
| N3 | "Corrida concluída", destino e hora, estrelas, comentário |
| N4 | "Agora não", ver comprovante, ajuda |
| N5 | Forma de pagamento, selo |

Amarelo: 1 bloco (o CTA do estado). Sinais: as estrelas cheias (a estrela **é** a ação de avaliar, F3). O ícone de sucesso é
verde (`role.success`), não amarelo.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` + `FooterActions` (C-04) em altura < 640 | `gradient.screen` |
| Sucesso | `View` pastilha 56 + `CheckCircle` lucide | `withAlpha(role.success, 0.14)`, ícone `role.success` |
| Valor | `SurfaceRaised` + `MoneyText` (C-10) | `display` bold, `tabularNums` |
| Avaliação | `StarRating` com `Star` do lucide (já, `concluida.tsx:22-24`) + `TextInput` | estrela `brand.yellow` |
| Ações | `PrimaryButton`, `LinkButton` | — |
| Linhas | `ListRow` (C-08) | ícone `textSecondary` (D-30) |
| Confirmação | `Toast` (C-05) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão (avaliar) | Como no layout | `P10-avaliar-*` |
| Carregando | Ao abrir pelo push ou ao reabrir o app: bloco de valor em esqueleto (mesma altura); estrelas já ativas | `P10-carregando-*` |
| Carregando ação | Spinner no "Enviar avaliação"; estrelas e comentário travados; segundo toque ignorado | `P10-enviando-*` |
| Avaliada | Linha da avaliação + `Toast` + "Voltar ao início" | `P10-avaliada-*` |
| Vazio | n/a: só se chega aqui com corrida concluída | — |
| Erro ao enviar | `InlineAlert` acima do CTA, com foco: "Não foi possível enviar a avaliação agora." + "Tentar de novo"; as estrelas e o texto ficam | `P10-erro-avaliacao-*` |
| Avaliação fora do prazo | Se o servidor recusar por prazo [regra a definir no S4]: "O prazo para avaliar esta corrida terminou." e o bloco some | sim, quando existir |
| Valor ainda em fechamento | Se o valor final chegar depois do `completed` [depende do S5]: "Calculando o valor final…" com esqueleto no número, por no máximo 8 s; depois, "O valor aparece no comprovante em instantes." | `P10-calculando-*` |
| Sem rede | `NetworkBanner`; "Enviar avaliação" desabilitado com "Sem conexão"; "Voltar ao início" funciona | `P10-sem-rede-*` |
| Texto longo | Comentário de 500 caracteres (limite a confirmar com a Vega) com contador "480/500"; destino em 2 linhas; R$ 1.234,56 inteiro | `P10-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | As 5 estrelas ficam numa linha só (o ícone não escala com a fonte); título, valor e botões quebram e a tela rola | aparelho |
| Teclado aberto | O campo de comentário e o "Enviar avaliação" ficam visíveis (G-15) | aparelho |
| Permissão | n/a | — |
| Mock | Um selo embaixo do valor: "valor de demonstração"; nenhum selo no comprovante aqui (ele está na P11) | sim |

## 6. Microinterações

- **Entrada (vindo da P09):** o painel sobe até a tela cheia (300 ms); o ícone de sucesso entra com fade e escala de 0,9 → 1
  (200 ms); resposta tátil de sucesso. Com "reduzir movimento", só fade.
- **Estrela:** cada toque acende até a estrela tocada, 120 ms; resposta tátil leve; o campo de comentário entra com fade de
  200 ms na primeira estrela.
- **Enviar:** o bloco encolhe para a linha (250 ms), o `Toast` entra, o CTA troca de rótulo.
- **Voltar ao início:** `router.replace('/')` e `startNewRide()` (já, `concluida.tsx:73-76`): não volta para a corrida.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Corrida concluída |
| Linha | {destino curto} · {hh:mm} |
| Valor | Valor final · Valor da corrida *(plano D-06)* · Estimado: R$ {valor} |
| Pagamento | Pago com {forma} *(decisão 3)* |
| Avaliação | Como foi a corrida com {primeiro nome}? |
| Comentário | Comentário (opcional) · Conte como foi a viagem |
| CTA | Enviar avaliação · Voltar ao início |
| Pular | Agora não |
| Feita | Sua avaliação · Avaliação enviada. |
| Erro | Não foi possível enviar a avaliação agora. · Tentar de novo |
| Linhas | Ver comprovante · Ajuda com esta corrida |
| Selo | valor de demonstração |

Hoje a tela diz "Obrigada pela avaliação!" (`concluida.tsx:133`): a voz do app não tem gênero; "Avaliação enviada." resolve
sem escolher um.

## 8. Acessibilidade

- O título é cabeçalho e é anunciado ao entrar, junto com o valor: "Corrida concluída. Valor final, 23 reais e 90 centavos".
- `StarRating` é um grupo de opção única: "Avaliar de 1 a 5 estrelas, 4 selecionadas"; cada estrela tem alvo de 44×44.
- O CTA desabilitado diz por quê: "Enviar avaliação, indisponível: escolha de 1 a 5 estrelas".
- O `Toast` é anunciado.

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Valor e forma de pagamento | `receipt` fabricado no store | `GET /v1/trips/:id/receipt` (S4/S5) | "valor de demonstração" |
| Destino e hora | store | snapshot da corrida | — |
| Nome do motorista | mock | `PassengerTripSnapshot.driver.firstName` | — |
| Avaliação | `submitRating` local (`concluida.tsx:68-71`) | `POST /v1/trips/:id/rating` (S4) | não (é a ação da pessoa); o envio é que é simulado até o S4, e o `Toast` diz "Avaliação registrada neste aparelho" até lá |

## 11. Lacunas do protótipo

1. Dois `PrimaryButton` na mesma tela (`concluida.tsx:146-152,165-170`).
2. "Preciso de ajuda" com `onPress={() => {}}` (`:157-163`; G-19).
3. Comprovante inteiro repetido aqui, com linhas fabricadas como "Taxa de serviço" (`mockTripHistory.ts:58`), que dependem
   da decisão 7 (D-38).
4. Selos na linha do título (`concluida.tsx:105-108,115-118`; G-25).
5. Cartão de avaliação feita chapado (`ratingDoneCard`, `:217-223`, `surfaceElevated` sem borda de luz; G-02).
6. Destino com pino laranja (`:97`).
7. Título curto "Concluída" por causa do corte antigo (`:81-84`); o `ScreenHeader` já quebra em 2 linhas, e a tela nem
   precisa dele (não há para onde voltar).
8. "Obrigada pela avaliação!" (`:133`).

## 12. Pedidos de componente

C-04, C-05, C-08, C-10 (todos já no `packages/ui`). Nenhum novo.

## 13. Portão: itens próprios

- Exatamente 1 bloco amarelo em cada estado (avaliar e avaliada).
- O valor é o maior texto da tela (34) e não trunca em 320.
- G-11: o CTA do estado é visível sem rolar em 320×568, ou fixo no rodapé.
- Teste de interação: sem estrela, o CTA não envia; com rede cortada, nada é enviado e nada some.
- G-07b não se aplica; comparação com a captura aprovada da P11 (mesmo cartão-linha).
- Capturas: `passageiro/P10-{avaliar,carregando,enviando,avaliada,erro-avaliacao,calculando,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O limite de caracteres do comentário e o prazo para avaliar não estão no contrato (`POST /v1/trips/:id/rating` só lista os
campos). O F1 está tratado no código (`edgeTop`/`edgeBottom` em `:184-216`), mas a tela não foi medida de novo depois disso.
