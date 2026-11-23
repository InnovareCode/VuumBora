# P07 · Buscando motorista

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/buscando` · `apps/passenger/app/(app)/buscando.tsx` + `src/components/search/SearchingPulse.tsx` |
| Spec | `PASSAGEIRO.md`, P07: animação discreta, botão cancelar conforme regras. Critério 2: erro recuperável para falta de motorista ou de rede. Critério 3: estado sincronizado com o servidor |
| Alvo visual | Sem recorte: herda o esqueleto da P05 (mapa em cima, painel embaixo, recorte 1061, 12, 1297, 508) |
| Estado hoje | UI com simulador (`src/sim/rideSimulator.ts`); nenhuma chamada de rede |
| Última nota | 3 (18/11). S1 (disco amarelo cheio) e S3 (brilho e cartão de conferência) foram tratados no código; não medido depois |
| Depende de decisão | **15** (taxa de cancelamento, para o texto do diálogo); PP-10 (rota única da corrida) e D-32 (sem voltar), ambas no README; C-02 (`BottomSheet`) e C-12 (mapa, D1) para o visual final; S4 para os dados reais |
| Ordem | Onda 3 (junto com P05 e P06) |

## 1. Pergunta que a tela responde

"Já acharam um motorista para mim?" Sucesso: a pessoa sabe que o pedido está ativo, confere para onde e por quanto pediu, e
consegue desistir com um toque e uma confirmação.

## 2. Layout

Sem recorte na prancha. A tela **continua** a P05/P06: o mesmo mapa fica em cima (a rota já desenhada) e o painel troca o
resumo pelo estado de busca. O pulso nasce **no pino de embarque, sobre o mapa**, e não no meio de uma tela vazia. Assim a
passagem P06 → P07 → P08 é uma tela só mudando de estado (`docs/movimento.md`, Confirmação → buscando).

```
390×844
┌──────────────────────────────┐
│ ░░░░░░ mapa (sem glow) ░░░░░░ │  MapView (C-12); até lá MapPreviewBackground + selo
│ ░░░░ rota 7 pt + halo ░░░░░░░ │  rota da cotação, já desenhada
│ ░░░░░░ (( ● )) ░░░░░░░░░░░░░░ │  pulso em volta do pino de embarque (map.pickup)
│ ░░░░░░░░░░░░░░░ 📍 ░░░░░░░░░░ │  pino de destino (map.destination)
│ ░░░░░░░░░░░░░░░░ ~420 pt ░░░░ │
├──────── painel (sheet) ───────┤  BottomSheet (C-02), radius.xxl em cima, elevation.3
│ ━━                            │
│ Procurando motorista          │  title 22 bold (N2)
│ Avisamos assim que alguém     │  small, textSecondary
│ aceitar. · há 0:42            │  tempo de busca em caption tabular (N5)
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  SurfaceRaised, um cartão
│ │ ● Av. Eng. Roberto Freire │ │  origem, map.pickup (círculo)
│ │ 📍 Midway Mall, Tirol      │ │  destino, map.destination (pino)
│ ├──────────────────────────┤ │  divisor edgeBottom
│ │ [🚗] VuumBora  R$ 23,90   │ │  ícone textSecondary; preço com "estimado"
│ └──────────────────────────┘ │
│ (selo: busca simulada)        │  um só, embaixo do cartão
│ ↓ 16                          │
│ [     Cancelar pedido     ] 52│  DangerButton (contorno), largura total
│ safe area                     │
└──────────────────────────────┘
```

- **Sem CTA amarelo.** A pessoa não tem nada a decidir enquanto espera; um botão amarelo inventaria uma decisão. O único
  botão é o de desistir, e ele é destrutivo (contorno vermelho, §2 do padrão).
- **Sem cabeçalho e sem voltar.** Regra de domínio já no código: em corrida ativa não se volta para a escolha de destino
  (`buscando.tsx:11-17`). O botão "voltar" do Android **minimiza o app** (igual na P08 e na P09): nunca desfaz o pedido e
  nunca volta para a P06.
- **320×568:** mapa com 200 pt; o cartão perde o divisor e junta categoria e preço numa linha só; o `DangerButton` fica no
  pé do painel (`FooterActions`, C-04).
- **430×932:** o mapa ganha a sobra; o painel tem a altura do conteúdo.
- **Até o C-12:** `MapPreviewBackground` (variante `natal`) com o selo "mapa ilustrativo" fora de qualquer controle (H1), e o
  pulso centrado num pino desenhado. Nunca o pulso solto no meio da tela, como hoje.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | nenhum (por desenho: não há decisão a tomar) |
| N2 | "Procurando motorista" |
| N3 | Origem, destino, categoria e preço estimado |
| N4 | "Cancelar pedido" |
| N5 | Tempo de busca, selo |

Amarelo: **0 blocos**. Sinais: a rota, o anel do pulso (traço de 2 pt, sem preenchimento) e o pino de embarque da marca.
Hoje o ícone do carro e a borda do núcleo do pulso também são amarelos (`SearchingPulse.tsx:55,75,82`): sobre o mapa, o núcleo
vira o próprio pino de embarque e o carro sai.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell padded={false}`, **sem** `glow` (tem mapa) | — |
| Mapa, rota, pinos | C-12 (`MapView`, `RouteOverlay`, `LocationMarker`); até lá `MapPreviewBackground` | `map.*`, `elevation.2` nos marcadores |
| Pulso | `SearchingPulse` (`apps/passenger/src/components/search/SearchingPulse.tsx`) ancorado no marcador de embarque | anel `brand.yellow` traço 2 pt, alfa 0,45 → 0; `motion.duration.pulse` |
| Painel | `BottomSheet` (C-02), o mesmo da P05/P06 | `role.surface`, `elevation.3`, `radius.xxl`, `layout.sheetHandle*` |
| Resumo | `SurfaceRaised` + `RouteSummaryRow` (`src/components/confirmation/RouteSummaryRow.tsx`) | `edgeTop`/`edgeBottom`, `map.pickup`, `map.destination` |
| Preço | `MoneyText estimated` (C-10, já no `packages/ui`) | `body` bold, `tabularNums` |
| Tempo de busca | `Text` com `tabularNums` | `caption`, `textMuted` |
| Cancelar | `DangerButton` + `ConfirmDialog destructive` (C-03, já no `packages/ui`) | — |
| Avisos | `InlineAlert` (info para "o motorista cancelou", warning para erro) | — |
| Sem rede | `NetworkBanner` (C-01, já no `packages/ui`) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão (`searching_driver`) | Como no layout; o tempo de busca conta a partir do `seq` de status recebido, não do toque | `P07-padrao-*` |
| Carregando | Ao reabrir o app com corrida ativa: mapa no tom `map.land` e o painel em esqueleto com as alturas finais, até o `GET /v1/trips/:id` responder. Nunca mostrar "Procurando" antes de saber o estado | `P07-carregando-*` |
| Aguardando pagamento (`requested`) | n/a nesta onda: só existe com Pix antes da corrida (S5, decisão 3). Quando existir, é outro estado do mesmo painel | — |
| Carregando ação (cancelar) | Spinner dentro do botão do diálogo; o diálogo não fecha; segundo toque ignorado (`Idempotency-Key`) | `P07-cancelando-*` |
| Busca demorada | Depois de **2 min** [confirmar com o Atlas; o prazo real é do servidor]: a frase de apoio vira "Está demorando mais que o normal. Você pode continuar esperando ou cancelar." Nada muda de cor | `P07-demorada-*` |
| Vazio: nenhum motorista (`failed`) | O pulso para. Título "Nenhum motorista disponível agora"; apoio "Tente de novo em alguns minutos."; **PrimaryButton "Tentar de novo"** (volta à P05 com a cotação refeita, porque a anterior pode ter vencido) e `LinkButton` "Voltar ao início" | `P07-sem-motorista-*` |
| Motorista cancelou depois de aceitar | A corrida volta para `searching_driver` (`trip-lifecycle.ts:19`): o painel volta a este estado com um `InlineAlert` info no topo, "O motorista cancelou. Estamos procurando outro.", que some ao achar o próximo. O motorista anterior some da tela (A2) | `P07-motorista-cancelou-*` |
| Cancelada por terceiros (sistema ou admin) | Tela de aviso no painel: "Seu pedido foi cancelado." + o motivo do servidor, se houver; `PrimaryButton` "Voltar ao início" | `P07-cancelada-*` |
| Erro ao cancelar | `409 invalid_transition` porque um motorista acabou de aceitar: o diálogo fecha, o `InlineAlert` diz "Um motorista acabou de aceitar." e a tela segue para a P08. Erro de rede: `InlineAlert` no diálogo, com "Tentar de novo" | um por código |
| Sem rede | `NetworkBanner`; **o estado da corrida não muda** (§12); o tempo continua; "Cancelar pedido" desabilitado com "Sem conexão" embaixo | `P07-sem-rede-*` |
| Texto longo | Endereços em até 2 linhas cada; categoria "Motorista mulher" + "R$ 1.234,56" sem cortar o preço | `P07-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | O painel sobe até 85% e rola por dentro; o botão continua no pé | aparelho |
| Teclado / Permissão | n/a: não há campo; a posição já veio da P04 | — |
| Mock | Um selo embaixo do cartão: "busca simulada" (hoje solto no topo, à direita, `buscando.tsx:63-65`) | sim |

## 6. Microinterações

- **Entrada (vindo da P06):** o cartão de resumo sobe e desbota, e o pulso nasce no pino de embarque (`docs/movimento.md`).
  Sem troca de tela visível quando a PP-10 for aceita; até lá, `router.replace` (já usado) com o mapa na mesma posição.
- **Pulso:** dois anéis em laço de 1400 ms (`motion.duration.pulse`), senoidal. Com "reduzir movimento", o pulso para e o
  anel fica parado a 0,45 de opacidade (já respeitado em `SearchingPulse.tsx:21-22`).
- **Motorista encontrado (para a P08):** a troca mais importante do app. O pulso colapsa no pino em 250 ms e o cartão do
  motorista sobe de baixo; resposta tátil de sucesso. Com "reduzir movimento", troca de opacidade em 150 ms.
- **Cancelar:** toque → `ConfirmDialog`. Confirmado: o painel desce, o mapa apaga a rota e volta ao início.
- **Leitor de tela:** "Procurando motorista" ao entrar; "Motorista encontrado: {nome}, placa {placa}" ao achar; "Nenhum
  motorista disponível agora" no `failed`. O tempo de busca **não** é anunciado a cada segundo (só no rótulo do grupo).
- **App em segundo plano:** a notícia chega por push (D5, S4). Ao voltar, a tela lê o estado do servidor antes de mostrar
  qualquer coisa (ressincronização da porta, `trip/types.ts:43-58`).

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Procurando motorista |
| Apoio | Avisamos assim que alguém aceitar. |
| Tempo | há {m:ss} |
| Demorada | Está demorando mais que o normal. Você pode continuar esperando ou cancelar. |
| Botão | Cancelar pedido *(antes do aceite é "pedido"; depois do aceite, na P08, é "corrida")* |
| Diálogo: título | Cancelar o pedido? |
| Diálogo: texto | Você ainda não tem motorista. *(se o servidor devolver taxa, `cancellationFee`, acrescentar "Será cobrada uma taxa de R$ {valor}." Nunca escrever "sem custo" antes da decisão 15)* |
| Diálogo: botões | Cancelar pedido · Continuar procurando |
| Sem motorista | Nenhum motorista disponível agora · Tente de novo em alguns minutos. · Tentar de novo · Voltar ao início |
| Motorista cancelou | O motorista cancelou. Estamos procurando outro. |
| Cancelada | Seu pedido foi cancelado. · Voltar ao início |
| Aceitou no meio | Um motorista acabou de aceitar. |
| Sem rede | Sem conexão. Tentando reconectar… |
| Selo | busca simulada |

## 8. Acessibilidade

- O título do painel é cabeçalho e é anunciado ao entrar.
- O pulso é decorativo (`accessible={false}`); o estado é dito pelo título. Hoje ele tem papel `progressbar` sem valor
  (`SearchingPulse.tsx:51`), o que o leitor anuncia como progresso indeterminado e repetido: sai.
- O resumo é lido como uma frase: "De {origem} para {destino}, {categoria}, preço estimado {valor}".
- O mapa tem descrição em texto: "Rota de {origem} até {destino}".
- O diálogo prende o foco e devolve ao botão ao fechar (`ConfirmDialog` já faz).
- A mudança de estado (achou, cancelou, falhou) usa região viva (`InlineAlert` já anuncia).

## 9. Assets

Nenhum novo. O carro do núcleo do pulso sai; o pino de embarque é o `LocationMarker` do C-12 (até lá, um círculo `map.pickup`
desenhado com `View`).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Estado da busca | simulador (`rideSimulator.ts`) | `PassengerRidePort.subscribe` + `status` (S4, D3) | "busca simulada" |
| Origem, destino, categoria, preço | store (`useRideRequestStore`), vindos da P05/P06 | idem, do pedido feito (`requestedCategory`, F08b) | conforme a P05 |
| Rota | não existe | a mesma da cotação (D1) | "mapa ilustrativo" |
| Taxa de cancelamento | não existe | `cancellationFee` da resposta do cancelamento (B3) | — |

## 11. Lacunas do protótipo

1. Cancela no primeiro toque, sem confirmação (`buscando.tsx:51-54`; C-03 já existe no `packages/ui`).
2. Sem o estado "nenhum motorista" (`failed`): o efeito manda qualquer fase estranha para o início em silêncio
   (`buscando.tsx:46-48`), contra o critério 2 da spec.
3. Sem o estado "o motorista cancelou, procurando outro" (a volta para `searching_driver` do F08).
4. Destino com pino laranja `role.warning` (`buscando.tsx:77`); a regra é `map.destination`.
5. Preço sem o rótulo "estimado" (`buscando.tsx:90-92`, `formatQuotePrice`).
6. Sem mapa: pulso no meio de uma tela `glow` (`buscando.tsx:61,67-70`).
7. Selo solto no topo, à direita (`buscando.tsx:63-65`); vai para baixo do cartão.
8. O botão diz "Cancelar corrida" quando ainda não há corrida atribuída (`buscando.tsx:98`).

## 12. Pedidos de componente

C-02 (`BottomSheet`) e C-12 (mapa) — os mesmos da P05. Pedido local: `RideMapLayout` (mapa em cima + painel), uma vez para
P05, P06, P07, P08 e P09, para o mapa não ser montado de novo a cada fase (ver PP-10 no README).

**Ponto de partida real:** a P05 da onda 3 está sendo construída com um `RouteMapBanner` (mapa ilustrativo + balões,
`apps/passenger/src/components/categoria/RouteMapBanner.tsx`, **ainda fora da `main`** quando esta ficha foi escrita) e o
painel numa rolagem, sem `BottomSheet`. A P07 reaproveita esse mesmo componente, com duas mudanças: `onBack` opcional (aqui
não há voltar) e um ponto de ancoragem para o pulso no balão de origem. Se o componente mudar de nome ou de lugar no merge,
vale o que estiver na `main`.

## 13. Portão: itens próprios

- Zero bloco amarelo (G-04 conta 0); o anel do pulso é traço, nunca preenchimento.
- O toque em "Cancelar pedido" abre o diálogo; o pedido só é cancelado no segundo toque (teste de interação).
- O estado da corrida não muda com a rede cortada (G-18, `setOffline(true)` por 30 s e volta).
- Com "reduzir movimento", o pulso está parado (G-28).
- G-07b não se aplica (sem recorte); a comparação lado a lado é com a captura aprovada da P05.
- Capturas: `passageiro/P07-{padrao,carregando,cancelando,demorada,sem-motorista,motorista-cancelou,cancelada,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O prazo de "busca demorada" (2 min) é proposta minha, não regra do servidor. O `RouteSummaryRow` não foi lido linha a linha.
O simulador **não produz** `failed` nem a volta para a busca (`rideSimulator.ts:179` só trata as fases terminais): para a
Íris fotografar esses estados, a Lyra precisa de um parâmetro de teste só de desenvolvimento (padrão do `?devAprovado=false`
da M05, `apps/driver/app/(app)/index.tsx:42-48`).
