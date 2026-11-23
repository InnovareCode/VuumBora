# M06 · Nova corrida (oferta em tela cheia)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe como tela.** O `NewRideOfferCard` (`apps/driver/src/components/home/NewRideOfferCard.tsx`) saiu da M05 na onda 2 e hoje não é usado por nenhuma tela. Proposta: `/oferta` · `apps/driver/app/(app)/oferta.tsx`, apresentada como modal de tela cheia sobre a M05 |
| Spec | `MOTORISTA.md`, M06: embarque, destino quando permitido, distância, estimativa, aceite, recusa, expiração. Regras: a oferta expira no servidor (o contador não é fonte de verdade); aceite atômico; nada otimista |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 1053, 14, 1281, 462 ("Solicitação de Corrida") |
| Estado hoje | só o componente, órfão, com mock; nenhuma tela |
| Última nota | (4) como parte da M05 (18/11) |
| Depende de decisão | **Decidido em 22/11:** embarque e destino só pelo bairro antes do aceite (`docs/decisoes-do-dono.md:369-397`). **Abertas:** **7** (o que é o valor mostrado, D-18, D-23), **3** (dinheiro ou não, para dizer a forma de pagamento), **15** (consequência de recusar), D-17 (sem taxa de aceitação), **PP-12** (distância e duração da viagem no contrato), **D-34**; D5 (push com o app fechado); S4 |
| Ordem | Onda 4 |

## 1. Pergunta que a tela responde

"Vale a pena aceitar esta corrida?" Sucesso: em até 15 segundos o motorista sabe quanto falta até o embarque, de que bairro
para que bairro vai, quanto ganha (estimado), e aceita ou recusa com um toque.

## 2. Layout

Leitura da prancha: "×" e "Nova corrida" no topo; um cartão com o carro e "5 min · 2,3 km / Passageiro a 320 m"; um cartão de
rota com pino verde "Local de embarque" e pino vermelho "Destino", ligados por um traço; um cartão "Valor da corrida R$ 18,90"
centralizado; "Aceitar corrida" amarelo e "Recusar" cinza, os dois em largura total.

```
390×844
┌──────────────────────────────┐
│ safe area + glow              │  AppShell glow (não tem mapa)
│        Nova corrida      (12) │  ScreenHeader center; contador em anel 44 no rightSlot
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  SurfaceRaised (cartão 1)
│ │ [🚗] 6 min · 1,8 km       │ │  title 22 bold tabular (N3; o N2 é o valor)
│ │      até o embarque       │ │  small, textSecondary
│ │      (VuumBora)           │ │  chip da categoria, caption
│ └──────────────────────────┘ │
│ ↓ 8                           │
│ ┌──────────────────────────┐ │  cartão 2 (rota)
│ │ ● Embarque                │ │  caption textMuted; círculo map.pickup
│ │ │ Lagoa Nova              │ │  subtitle 18 semibold (só o bairro)
│ │ │                         │ │
│ │ 📍 Destino                 │ │  pino map.destination
│ │   Tirol                   │ │  subtitle 18 semibold (só o bairro)
│ │   Viagem de 4,8 km · 14 min│ │  small, textSecondary (PP-12)
│ └──────────────────────────┘ │
│ ↓ 8                           │
│ ┌──────────────────────────┐ │  cartão 3 (valor), centro
│ │      Ganho estimado       │ │  caption, textSecondary (D-34)
│ │        R$ 18,90           │ │  display 34 bold tabular (N2)
│ └──────────────────────────┘ │
│ (selo: oferta de demonstração)│
│        ↕ espaço flexível      │
│ [     Aceitar corrida     ] 56│  PrimaryButton (N1)
│ ↓ 12                          │
│ [         Recusar         ] 56│  SecondaryButton prominent, mesma altura (M6 da auditoria)
│ safe area                     │
└──────────────────────────────┘
```

- **Bairro, nunca endereço** (decidido): o cartão de rota mostra só o bairro do embarque e do destino. A prancha mostra
  "Av. Prudente de Morais, 1200" acima do bairro: essa linha **não existe** aqui. Se o embarque for em outra cidade
  (região metropolitana, plano D-04), "Bairro, Cidade".
- **Sem mapa.** A prancha não tem, e o único ponto que a oferta poderia mostrar é arredondado (decidido): um mapa com ponto
  impreciso convida o motorista a tirar conclusões erradas. O mapa entra na M07, com o endereço exato.
- **O "×" do topo sai** (D-34): repete o "Recusar" e parece "fechar sem consequência". O lugar dele vira o **contador**,
  que a prancha não tem e a spec exige.
- **Distância e duração da viagem** (embarque → destino) não estão no `RideOffer` de hoje (`packages/domain/src/driver/index.ts:33-46`):
  é a informação que mais pesa para decidir, e é tão pouco reveladora quanto o bairro. Pedido de contrato (PP-12). Sem ela,
  a linha não existe.
- **Ações no pé**, fixas: Aceitar e Recusar ficam sempre no mesmo lugar, para o polegar decidir sem procurar.
- **320×568:** cartão 1 e cartão 2 se fundem (ETA + bairros num cartão só); valor em `heading` 28; os botões com 52 de
  altura (altura < 640), sempre visíveis sem rolar.
- **430×932:** o espaço flexível cresce entre o valor e os botões; nada estica.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Aceitar corrida" |
| N2 | Ganho estimado |
| N3 | Tempo e distância até o embarque, bairros, distância da viagem, categoria |
| N4 | "Recusar" |
| N5 | Contador (é prazo, não informação de decisão), selo |

Amarelo: 1 bloco (Aceitar). Sinais: nenhum. Hoje o selo "Nova corrida" é amarelo cheio (`NewRideOfferCard.tsx`, M5 da
auditoria) e havia "Dinâmica +20%" com `Zap` (D-18): os dois saem. O contador **não** é amarelo: `textPrimary`, e
`role.warning` com o número nos últimos 5 s (cor nunca sozinha).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Apresentação | rota `oferta` com `presentation: 'fullScreenModal'` (expo-router); voltar do Android **não** fecha (recusar é decisão) | — |
| Moldura | `AppShell glow` + `FooterActions` (C-04) com os dois botões | `gradient.screen`, `elevation.3` no rodapé |
| Contador | `OfferCountdown` (C-14, `apps/driver/src/components`), sobre `useSecondsUntil(expiresAt)` (`packages/ui/src/countdown.ts`) | anel 44, traço 3, `textPrimary` → `role.warning`; número `caption` bold `tabularNums` |
| Cartões | `SurfaceRaised` × 3 | `radius.lg`, padding 16, vão 8 |
| Rota | linhas do cartão com marcadores `map.pickup` (círculo) e `map.destination` (pino) + traço `role.border` | `subtitle` semibold |
| Valor | `MoneyText estimated label="Ganho estimado"` (C-10) | `display` bold, `tabularNums` |
| Formatação | `formatPickupDistance`, `formatPickupEta` (já no `NewRideOfferCard.tsx:23-35`; mover para `src/utils`) | — |
| Ações | `PrimaryButton`, `SecondaryButton` prominent | 56 (52 em altura < 640) |
| Avisos | `InlineAlert` (no lugar do valor, quando a oferta morre) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Como no layout, contador correndo | `M06-padrao-*` |
| Carregando | n/a: a oferta chega inteira no evento `offer.created`; não há carga parcial | — |
| Carregando ação (aceitar) | Spinner no Aceitar; Recusar desabilitado; o contador continua; segundo toque ignorado (`Idempotency-Key`) | `M06-aceitando-*` |
| Carregando ação (recusar) | Recusar mostra spinner por no máximo 1 s; a recusa é idempotente e a tela fecha mesmo se a resposta demorar (`driver/types.ts:48-49`) | — |
| Aceita | A tela vira a M07 (`router.replace`), com o endereço exato que só agora chega (`DriverTripSnapshot`) | ver M07 |
| Outro motorista aceitou (`409 offer_taken` ou `offer.revoked: taken`) | Os cartões apagam a 40%; `InlineAlert` info: "Outro motorista aceitou antes."; em 2 s volta à M05 | `M06-tomada-*` |
| Expirou (`409 offer_expired` ou `offer.revoked: expired`) | "A oferta expirou." e volta à M05 em 2 s | `M06-expirou-*` |
| Passageiro cancelou (`offer.revoked: cancelled`) | "O passageiro cancelou o pedido." e volta em 2 s | `M06-cancelada-*` |
| Contador local em zero | O anel mostra 0 e os botões **continuam ativos** até o servidor dizer que acabou (se o toque chegar a tempo, o servidor aceita; se não, `offer_expired`). Sem resposta do servidor em 3 s, a tela fecha com "A oferta expirou." | `M06-zero-*` |
| Vazio | n/a | — |
| Erro de rede ao aceitar | `InlineAlert` warning acima dos botões: "Sem conexão. Tentando de novo…"; a mesma chave de idempotência é reenviada enquanto a oferta valer | `M06-erro-rede-*` |
| Sem rede | `NetworkBanner`; Aceitar desabilitado com "Sem conexão"; Recusar continua (fecha a tela localmente; o servidor deixa expirar) | `M06-sem-rede-*` |
| Texto longo | Bairros "Parque das Nações, Parnamirim" e "Cidade da Esperança" em 2 linhas; R$ 1.234,56 sem cortar | `M06-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Os cartões rolam por dentro; os dois botões fixos no rodapé, rótulo em 2 linhas | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Um selo embaixo do cartão de valor: "oferta de demonstração" | sim |

## 6. Microinterações

- **Chegada:** a tela sobe de baixo em 300 ms sobre a M05; resposta tátil de aviso (PP-8) e o som de notificação do sistema.
  Com o app em segundo plano ou a tela bloqueada, a oferta chega por push com tela cheia no Android (D5, S4); isto é do
  serviço, não desta ficha.
- **Contador:** o anel esvazia de forma linear (`docs/movimento.md`, contador); nos últimos 5 s fica `role.warning` e há uma
  resposta tátil de aviso **uma vez**, aos 5 s.
- **Aceitar:** escala 0,97 no toque; spinner; ao confirmar, resposta tátil de sucesso e transição para a M07 (o cartão de
  rota cresce e vira o painel da M07).
- **Oferta morta:** fade dos cartões para 40% em 200 ms, aviso entra, a tela desce em 300 ms.
- **Reduzir movimento:** o anel vira número que troca a cada segundo, sem animação; entradas e saídas só com opacidade.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Nova corrida |
| Cartão 1 | {n} min · {d} · até o embarque *(com `formatPickupEta`/`formatPickupDistance`: "menos de 1 min", "menos de 100 m")* |
| Rota | Embarque · {bairro} · Destino · {bairro} · Viagem de {d} · {n} min *(PP-12)* |
| Valor | Ganho estimado *(o campo do contrato é `estimatedPayout`, o repasse estimado; se a decisão 7 disser que o motorista vê o valor cobrado do passageiro, o rótulo muda para "Valor da corrida" e o campo também)* |
| CTA | Aceitar corrida |
| Recusa | Recusar |
| Tomada | Outro motorista aceitou antes. |
| Expirou | A oferta expirou. |
| Cancelada | O passageiro cancelou o pedido. |
| Rede | Sem conexão. Tentando de novo… |
| Selo | oferta de demonstração |

**Não usar:** nome do passageiro, endereço, "Dinâmica", percentual de taxa, "Passageiro a 320 m" (a prancha mistura a
distância até o embarque com a do passageiro, que não é dado nosso).

## 8. Acessibilidade

- Ao chegar, o leitor anuncia: "Nova corrida. {n} minutos até o embarque em {bairro}. Destino {bairro}. Ganho estimado {valor}.
  {s} segundos para responder." O foco vai para o título.
- O prazo é anunciado no início e aos 5 s (§13 do padrão: tempo); não a cada segundo.
- O contador tem papel de temporizador com rótulo "Tempo para responder: {s} segundos".
- Aceitar e Recusar com 56 de altura, separados por 12 (sem toque errado com pressa).
- **Prazo e acessibilidade:** 15 s com leitor de tela é apertado. O servidor decide o prazo; registro aqui a pergunta para a
  Nova: o prazo pode ser maior para quem usa leitor de tela? (WCAG 2.2.1 pede ajuste de tempo, salvo quando o limite é
  essencial, e numa fila sequencial ele é.)

## 9. Assets

Nenhum novo. O carro do cartão 1 é o `VehicleIconBox` 48 (C-11) em estado normal.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Oferta inteira | nenhuma tela a recebe | `DriverOfferPort.subscribeOffers` → `offer.created` (`packages/api-client/src/driver/types.ts:40-52`) | "oferta de demonstração" |
| Bairros | props do componente órfão | `RideOffer.pickup`/`destination: ApproximatePlace` | idem |
| Tempo e distância até o embarque | idem | `pickupEtaS` (arredondado a 1 min) e `pickupDistanceM` (a 100 m) | idem |
| Distância e duração da viagem | não existe | **pedido de contrato** (PP-12) | — |
| Valor | `priceLabel` fabricado | `RideOffer.estimatedPayout` | idem |
| Prazo | contador local | `RideOffer.expiresAt` (servidor) | — |
| Aceite e recusa | callbacks vazios | `accept(offer, idempotencyKey)` e `decline(offer)` | — |

## 11. Lacunas do protótipo

1. Não é tela: o componente é um cartão pensado para dentro do painel (PP-4, aceita) e hoje está órfão.
2. "Dinâmica +20%" com ícone de raio (`surgeLabel`, `NewRideOfferCard.tsx:15`; D-18).
3. Selo "Nova corrida" amarelo cheio (M5 da auditoria).
4. Recusar com 52 e Aceitar com 56 (M6 da auditoria): mesma altura.
5. O contador é local e o selo dele fica ao lado do relógio; com o `expiresAt` real, o selo sai do contador.
6. Rótulo "Valor estimado" sem dizer de quem é o valor (D-23).

## 12. Pedidos de componente

C-14 (`OfferCountdown`), C-11, C-04 (já existe). Contrato (PP-12, para Nova e Vega): distância e duração da viagem no
`RideOffer`, arredondadas como as do embarque.

## 13. Portão: itens próprios

- G-07b com o recorte "Solicitação de Corrida": título, cartão de tempo e distância, cartão de rota com os dois marcadores,
  cartão de valor centralizado, Aceitar e Recusar em largura total. Divergências permitidas: D-18, D-34.
- **Nenhum texto da tela contém endereço** (teste: o fixture tem rua e número no `DriverTripSnapshot` e só bairro no
  `RideOffer`; a tela da oferta não pode exibir a rua).
- Aceitar e Recusar com a mesma altura (±0) e visíveis sem rolar em 320×568.
- Teste de interação com o adaptador mock: `offer_taken`, `offer_expired`, revogação por cancelamento e aceite duplo (segundo
  toque não gera segunda chamada).
- O contador em zero não fecha a tela antes do servidor (ou dos 3 s de tolerância).
- Capturas: `motorista/M06-{padrao,aceitando,tomada,expirou,cancelada,zero,erro-rede,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O prazo da oferta (15 s) vem do favorito no plano (`plano-sistema.md:252`); o prazo da oferta comum não está escrito. Não
li o `NewRideOfferCard` além da linha 80.
