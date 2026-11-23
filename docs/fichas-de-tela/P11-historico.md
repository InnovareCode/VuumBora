# P11 · Histórico de viagens (lista e comprovante)

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/historico` · `apps/passenger/app/(app)/historico.tsx`; `/historico-detalhe?id=` · `historico-detalhe.tsx`; componentes em `src/components/history/{TripHistoryCard,TripFilterChip,TripDetailRow}.tsx` |
| Spec | `PASSAGEIRO.md`, P11: lista, detalhe, filtros simples, comprovante |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recorte 376, 522, 640, 976 ("Histórico"). Referência em alta: `referencias/premium/passageiro/P11-historico.webp`. O detalhe não tem recorte: herda o cartão-linha e o valor em destaque (§18.1, itens 2 e 4) |
| Estado hoje | UI com mock (`src/data/mockTripHistory.ts`); filtros locais |
| Última nota | não auditada |
| Depende de decisão | **7** e **plano D-06** (linhas do comprovante, D-38), **3** (forma de pagamento), D-12 (selo tingido, decidido); S4 (`GET /v1/trips?cursor`, `GET /v1/trips/:id/receipt`) |
| Ordem | Onda 5 |

## 1. Pergunta que a tela responde

"Quais corridas eu fiz e quanto paguei em cada uma?" Sucesso: a pessoa acha uma corrida pela data ou pelo destino, abre o
comprovante e, se algo estiver errado, chega à ajuda com aquela corrida já identificada.

## 2. Layout

### 2.1 Lista

Leitura da prancha: título centralizado "Histórico de viagens" com seta; pílulas "Todas / Mês atual / Anteriores" (a ativa
em amarelo cheio com texto navy); cartões-linha de altura igual com o carro numa pastilha à esquerda, destino e data,
valor e selo "Concluída" à direita, chevron.

```
390×844
┌──────────────────────────────┐
│ ‹    Histórico de viagens     │  ScreenHeader align center, até 2 linhas
│ ↓ 12                          │
│ ( Todas )( Mês atual )( Anteriores ) │  SegmentedControl (C-16); ativa em amarelo
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  cartão-linha 64 pt, SurfaceRaised, radius.lg
│ │[🚗] Shopping Central R$14,90›│ │  VehicleIconBox 40 (ícone textSecondary, D-30)
│ │     Hoje, 09:42  (Concluída)│ │  caption textMuted · StatusBadge tingido
│ └──────────────────────────┘ │
│ ↓ 8                           │
│ [🚗] Aeroporto      R$ 42,50 ›│
│ [🚗] Shopping Norte R$ 17,90 ›│
│ …                             │  rolagem infinita, esqueleto de 2 linhas no fim
│ (selo: histórico de exemplo)  │  um só, embaixo do controle
└──────────────────────────────┘
```

- **Filtros:** "Todas / Mês atual / Anteriores", como na prancha e no código. O filtro vai para o servidor (`from`/`to`),
  não filtra só a página carregada. Hoje é `ScrollView` horizontal de chips (`historico.tsx:59-74`): troca pelo
  `SegmentedControl` (já no `packages/ui`), que não rola.
- **Cancelada:** a mesma linha, com o `StatusBadge` "Cancelada" (tom `danger` tingido) e o valor só se houve taxa; sem taxa,
  "—" no lugar do valor.
- **320×568:** a pastilha do carro some; destino em 1 linha com reticências; valor e selo empilhados à direita; o controle
  segmentado cabe em 280 (rótulos medidos: se "Anteriores" cortar, vira "Antes").
- **430×932:** igual, até 480 de largura útil.

### 2.2 Comprovante (detalhe)

```
┌──────────────────────────────┐
│ ‹        Comprovante          │  ScreenHeader center
│      12 nov, 14:10            │  subtítulo (data e hora)
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  SurfaceRaised, centro
│ │        Valor total        │ │  caption
│ │        R$ 17,90           │ │  heading 28 bold tabular (N2)
│ │       (Concluída)         │ │  StatusBadge tingido
│ └──────────────────────────┘ │
│ ↓ 12                          │
│ ┌──────────────────────────┐ │  um cartão, seções com divisor edgeBottom
│ │ ● Av. Eng. Roberto Freire │ │  origem map.pickup (círculo)
│ │ 📍 Shopping Norte          │ │  destino map.destination (pino)
│ ├──────────────────────────┤ │
│ │ 🚗 Carlos · HB20 · QWE7B34 │ │  motorista e veículo
│ │ ◆  Pix                    │ │  pagamento (decisão 3)
│ │ ⏱  6,1 km · 18 min        │ │  distância e duração
│ └──────────────────────────┘ │
│ (selo: comprovante de exemplo)│
│ ↓ 20                          │
│ [?  Ajuda com esta corrida  › ] │  ListRow → P14 com a corrida
└──────────────────────────────┘
```

- **Sem linhas de tarifa** ("Tarifa por distância", "Taxa de serviço", `mockTripHistory.ts:55-58`) até a decisão 7 dizer o
  que o passageiro vê (D-38). O total e a forma de pagamento bastam para um comprovante honesto.
- "Baixar comprovante" (PDF) não existe na spec nem no contrato: não entra.

## 3. Hierarquia

| Nível | Lista | Comprovante |
|---|---|---|
| N1 | nenhum (é consulta) | nenhum |
| N2 | o controle de período (a escolha da tela) | Valor total |
| N3 | Destino, valor de cada linha | Origem, destino, motorista, pagamento, distância |
| N4 | Voltar, abrir uma linha | Voltar, ajuda |
| N5 | Data, selo de estado, selo de mock | Data, selo |

Amarelo: o segmento ativo (o único "bloco" amarelo permitido além do CTA, §18.1 item 3). Nenhum outro: o carro amarelo de
hoje (`TripHistoryCard.tsx:48`), a origem amarela do detalhe (`historico-detalhe.tsx:56`) e o primeiro valor em amarelo da
prancha do motorista não se repetem aqui.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` | — |
| Cabeçalho | `ScreenHeader align="center"` | `title` |
| Filtro | `SegmentedControl` (C-16, `packages/ui/src/SegmentedControl.tsx`) | ativa `gradient.cta` + `ctaText` |
| Linha | `TripHistoryCard` (`src/components/history/TripHistoryCard.tsx`) sobre `SurfaceRaised` + `VehicleIconBox` 40 (C-11) | `radius.lg`, vão 8, `tabularNums` no valor |
| Estado | `StatusBadge` tingido | `success`/`danger` a 14% |
| Comprovante | `SurfaceRaised` + `TripDetailRow` + `MoneyText` | `heading`, `map.pickup`/`destination` |
| Ajuda | `ListRow` (C-08) | ícone `textSecondary` |
| Estados | `EmptyState`/`ErrorState` com ícone (C-09), `LoadingSkeleton` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | 4+ linhas | `P11-padrao-*` |
| Carregando | 5 linhas em esqueleto com a altura exata (64) e o controle já ativo | `P11-carregando-*` |
| Carregando mais | 2 linhas em esqueleto no fim da lista; sem spinner de tela | `P11-carregando-mais-*` |
| Carregando ação | n/a (troca de filtro é carga, não ação) | — |
| Vazio (nenhuma corrida) | `EmptyState` com ícone `Car` em pastilha 56: "Nenhuma viagem ainda" · "Suas corridas aparecem aqui depois da primeira viagem." · ação "Pedir uma corrida" (volta ao início) | `P11-vazio-*` |
| Vazio no filtro | "Nenhuma viagem neste mês" · "Veja todas as suas viagens." · ação "Ver todas" (troca o filtro) | `P11-vazio-filtro-*` |
| Erro de carga | `ErrorState`: "Não foi possível carregar suas viagens." · "Tentar de novo" | `P11-erro-*` |
| Erro ao carregar mais | Linha no fim: "Não foi possível carregar mais." + `LinkButton` "Tentar de novo"; o que já carregou fica | sim |
| Comprovante não encontrado | `ErrorState` "Viagem não encontrada" · "Voltar ao histórico" (já, `historico-detalhe.tsx:25-38`) | `P11-detalhe-nao-encontrada-*` |
| Sem rede | `NetworkBanner`; a lista já carregada continua; "carregar mais" pausa | `P11-sem-rede-*` |
| Texto longo | Destino "Aeroporto Internacional de Natal Gov. Aluízio Alves" em 1 linha com reticências na lista e 2 linhas no comprovante; valor R$ 1.234,56 inteiro | `P11-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Linha cresce em altura (nunca corta); valor e selo empilham | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Um selo embaixo do controle (lista) e um embaixo do cartão de valor (comprovante) | sim |

## 6. Microinterações

- Lista: cada linha entra com 30 ms de atraso em relação à anterior, até 6 (`docs/movimento.md`, Listas); só na primeira
  carga, não ao trocar de filtro. Com "reduzir movimento", fade.
- Trocar o filtro: o segmento desliza (150 ms); a lista troca com fade, sem pular para o topo se a nova tiver o item que
  estava visível.
- Toque na linha: escala 0,97 (`PressableScale`, C-13); abre o comprovante com a transição de tela padrão.
- Puxar para atualizar: sim, com o indicador do sistema.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Histórico de viagens *(volta o título da prancha; o "Minhas viagens" de hoje, `historico.tsx:52-57`, era contorno do corte em 1 linha)* |
| Filtros | Todas · Mês atual · Anteriores |
| Data | Hoje, {hh:mm} · Ontem, {hh:mm} · {d} {mês abreviado}, {hh:mm} · {d} {mês} de {aaaa} (ano anterior) |
| Estados da linha | Concluída · Cancelada |
| Comprovante | Comprovante · Valor total · Origem · Destino · Motorista e veículo · Pagamento · Distância e duração |
| Ajuda | Ajuda com esta corrida |
| Vazio | Nenhuma viagem ainda · Suas corridas aparecem aqui depois da primeira viagem. · Pedir uma corrida |
| Vazio no filtro | Nenhuma viagem neste mês · Nenhuma viagem anterior · Ver todas |
| Erro | Não foi possível carregar suas viagens. · Tentar de novo |
| Selo | histórico de exemplo · comprovante de exemplo *(hoje "comprovante fabricado" e "valores fabricados": "fabricado" soa como fraude para quem não sabe que é protótipo)* |

## 8. Acessibilidade

- Cada linha é um botão lido como uma frase: "Shopping Central, hoje às 9 e 42, 14 reais e 90 centavos, concluída. Abre o
  comprovante".
- O `SegmentedControl` tem papel de grupo de abas, com `selected` no ativo.
- No comprovante, o valor é lido primeiro, depois origem e destino.
- O título de cada tela é cabeçalho.

## 9. Assets

O carro de frente do `VehicleIconBox` (C-11), o mesmo da P05.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Lista e filtro | `MOCK_TRIP_HISTORY` filtrado no aparelho | `GET /v1/trips?cursor` com período (S4; o filtro por período ainda não está no contrato) | "histórico de exemplo" |
| Comprovante | `findMockTripHistoryEntry` | `GET /v1/trips/:id/receipt` (estimativa, final, meio de pagamento) | "comprovante de exemplo" |
| Linhas de tarifa | fabricadas | só depois da decisão 7 (D-38) | — |

## 11. Lacunas do protótipo

1. Filtros em chip local que rola na horizontal (`historico.tsx:59-74`; C-16 já existe).
2. Sem carregando nem erro de carga (só o vazio, `historico.tsx:76-77`).
3. Carro amarelo em cada linha (`TripHistoryCard.tsx:48`; D-30).
4. Pastilha do carro em `surfaceElevated` chapado (`TripHistoryCard.tsx:90`).
5. Comprovante: cartões em `role.surface` chapado (`historico-detalhe.tsx:114-122`) e de recibo com borda igual nos quatro
   lados (`:127-134`; G-02).
6. Origem amarela e destino laranja (`historico-detalhe.tsx:56,63`).
7. Selos na mesma linha do estado e do título de seção (`historico-detalhe.tsx:49-52,94-97`; G-25).
8. Linhas de tarifa fabricadas, incluindo "Taxa de serviço" (D-38).

## 12. Pedidos de componente

C-11 (`VehicleIconBox`, tamanho 40 além do 48). C-09, C-13, C-16 já existem. Contrato (Vega): período no
`GET /v1/trips?cursor`.

## 13. Portão: itens próprios

- G-07b com o recorte "Histórico": título centralizado → controle de 3 pílulas → cartões-linha de altura igual com pastilha,
  valor à direita e chevron. Divergências permitidas: D-12, D-30.
- Todas as linhas com a mesma altura (variação ≤ 1 pt) em 390.
- Um único bloco amarelo: o segmento ativo.
- Capturas: `passageiro/P11-{padrao,carregando,carregando-mais,vazio,vazio-filtro,erro,sem-rede,texto-longo}-*.png` e
  `passageiro/P11-detalhe-{padrao,cancelada,nao-encontrada,texto-longo}-*.png`, nos 4 tamanhos.

## 14. Não conferido

O `TripHistoryCard` e o `TripFilterChip` foram lidos só nas linhas de cor. A largura de "Anteriores" no controle em 320 não
foi medida.
