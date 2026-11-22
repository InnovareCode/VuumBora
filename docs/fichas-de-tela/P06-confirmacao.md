# P06 · Confirmação do pedido

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/confirmacao` · `apps/passenger/app/(app)/confirmacao.tsx` |
| Spec | `PASSAGEIRO.md`, P06: origem, destino, preço, pagamento, botão Solicitar. Critério 1: só solicita com origem, destino, categoria e pagamento válidos |
| Alvo visual | Mesmo recorte da P05 (1061, 12, 1297, 508). A prancha junta escolha e confirmação ("Confirmar corrida" no pé do painel) |
| Estado hoje | UI com mock; regra de "pode solicitar" real (`canRequestRide`, `confirmacao.tsx:25`) |
| Última nota | 7 (18/11). C1, C2 e C4 seguem abertos no código |
| Depende de decisão | **PP-3** (vira o segundo estado do painel da P05); 3 (pagamento); 15 (regras de cancelamento, para o texto de taxa) |
| Ordem | Onda 3 |

## 1. Pergunta que a tela responde

"Está tudo certo para pedir?" Sucesso: a pessoa confere origem, destino, categoria, preço estimado e pagamento num bloco só e
toca uma vez em "Solicitar corrida".

## 2. Layout

**Recomendação (PP-3):** a P06 é o painel da P05 no estado "revisar": o mapa fica em cima, e o painel troca as linhas de
categoria por um **resumo**. Isso evita a tela inteira nova e os 3 toques de hoje. Se o Atlas mantiver uma tela separada, o
layout abaixo vale dentro de um `AppShell scroll glow`.

```
painel no estado "revisar" (390×844)
├──────── painel ───────────────┤
│ ━━                            │
│ Confirme sua corrida          │  title 22 bold
│ ┌──────────────────────────┐ │  SurfaceRaised (um cartão só)
│ │ ● Av. Eng. Roberto Freire │ │  origem, map.pickup
│ │ │                         │ │
│ │ 📍 Midway Mall, Tirol     │ │  destino, map.destination
│ ├──────────────────────────┤ │  divisor edgeBottom
│ │ [🚗] VuumBora · 4 min     │ │  categoria (ícone textSecondary)
│ │      Preço estimado       │ │  caption
│ │      R$ 23,90             │ │  heading 28 bold tabular (N2)
│ ├──────────────────────────┤ │
│ │ ◆ Pix                  ›  │ │  pagamento (trocar)
│ └──────────────────────────┘ │
│ (selo: corrida de demonstração)│ embaixo do cartão, um só
│ ↓ 16                          │
│ [   🚗 Solicitar corrida  ] 56│  PrimaryButton
│ O valor final pode mudar se o │  caption, textMuted, centro
│ trajeto mudar.                │
└──────────────────────────────┘
```

- **Três selos viram um.** Hoje há "preço estimado de demonstração" e "formas de pagamento fictícias", cada um dividindo a
  linha com um título (`confirmacao.tsx:61-63,80-82`). A regra é um selo por bloco, embaixo.
- **320×568:** o cartão com 3 seções mais o CTA precisa caber no painel a 85% da altura; se não couber, o painel rola e o CTA
  fica fixo.
- **430×932:** igual, com mais mapa.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Solicitar corrida" |
| N2 | Preço estimado |
| N3 | Origem, destino, categoria, pagamento |
| N4 | Trocar pagamento; voltar (arrasta o painel ou toca no "‹" do balão) |
| N5 | "O valor final pode mudar…", selo |

Amarelo: 1 bloco (CTA). Nenhum sinal. Hoje o ícone do carro é amarelo (`confirmacao.tsx:67`, C4) e o destino é laranja
(`:53`): os dois mudam.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Painel | `BottomSheet` (C-02), ou `AppShell scroll glow` se ficar tela separada | — |
| Resumo | `SurfaceRaised` (hoje é estilo inline chapado, `confirmacao.tsx:118-128`, C2) + `RouteSummaryRow` (`apps/passenger/src/components/confirmation/RouteSummaryRow.tsx`) | `edgeTop`/`edgeBottom`, `map.pickup`, `map.destination` |
| Preço | `MoneyText` (C-10) | `heading` bold, `tabularNums` |
| Pagamento | `ListRow` (C-08) → painel com `PaymentMethodOption` | selecionado `brand.yellow` 2 pt + `glow.selected` |
| Ação | `PrimaryButton` | — |
| Falta de requisito | `InlineAlert tone="warning"` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Tudo preenchido | sim |
| Carregando | n/a: os dados já vieram da P05 | — |
| Carregando ação | Spinner no CTA; o painel não fecha; um segundo toque é ignorado (o pedido usa `Idempotency-Key`, D3) | `P06-enviando-*` |
| Vazio | n/a | — |
| Requisito faltando | CTA desabilitado e `InlineAlert` "Falta escolher: {itens}." (hoje é um texto solto com role alert, `confirmacao.tsx:106-110`) | sim |
| Erro de envio | `InlineAlert` acima do CTA, com foco: sem motorista na região, cotação vencida (volta ao estado "escolher" com o preço novo), rede, servidor | um por código |
| Sem rede | `NetworkBanner`; CTA desabilitado com "Sem conexão" | sim |
| Texto longo | Endereços com 2 linhas cada; categoria de nome longo ("Motorista mulher") sem cortar | sim |
| 320×568 | CTA alcançável | sim |
| 430×932 | sim | sim |
| Fonte 200% | Preço inteiro; cartão rola dentro do painel | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Um selo embaixo do cartão | sim |

## 6. Microinterações

- "Continuar" da P05 → o painel troca de conteúdo com um cross-fade de 200 ms, sem mudar de tela.
- "Solicitar": resposta tátil leve; o cartão sobe e desbota, e o pulso de busca da P07 nasce de onde ele estava
  (`docs/movimento.md`, Confirmação → buscando).
- A navegação usa `router.replace` para a P07 (`confirmacao.tsx:36`): voltar não reabre a confirmação. Manter.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Confirme sua corrida |
| Rótulos | Origem · Destino · Categoria · Preço estimado · Pagamento |
| CTA | Solicitar corrida |
| Rodapé | O valor final pode mudar se o trajeto mudar. *(depende da decisão 7; se a tarifa for fechada na cotação, a frase sai)* |
| Falta | Falta escolher: {origem, destino, categoria, forma de pagamento}. |
| Sem motorista | Não há motoristas disponíveis agora. Tente de novo em alguns minutos. |
| Selo | corrida de demonstração |

## 8. Acessibilidade

- Título do painel como cabeçalho.
- O resumo é lido em ordem: origem, destino, categoria, preço estimado, pagamento.
- O CTA desabilitado diz por quê: rótulo "Solicitar corrida, indisponível: falta escolher a forma de pagamento".
- Ao enviar, o leitor anuncia "Procurando motorista".

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Origem e destino | store local (`useRideRequestStore`) | idem, vindo da P04 | conforme a P04 |
| Categoria e preço | `findMockRideCategory` | cotação (D2) | sim |
| Pagamento | `MOCK_PAYMENT_METHODS` | provedor (decisão 3) | sim |
| Pedido | `requestRide()` local + simulador | `POST /v1/trips` (D3) | "corrida de demonstração" |

## 11. Lacunas do protótipo

1. Cartões chapados (`confirmacao.tsx:118-128`, C2).
2. Selos na linha do título (`:61-63`, `:80-82`, C1).
3. Carro amarelo (`:67`, C4); origem amarela e destino laranja (`:46,53`).
4. Preço em `subtitle`, com o mesmo peso dos outros dados (`:137`): é o N2 da tela e vai para `heading`.
5. A frase de falta é texto solto (`:106-110`).
6. Margem de 2 pt fora da escala (`:136`).

## 12. Pedidos de componente

C-02, C-07, C-08, C-10.

## 13. Portão: itens próprios

- O preço é o maior texto do painel; zero amarelo fora do CTA.
- Um selo só.
- O segundo toque no CTA durante o envio não gera um segundo pedido (teste de interação).
- Capturas: `passageiro/P06-{padrao,falta-requisito,enviando,erro-sem-motorista,sem-rede}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

`RouteSummaryRow` e `PaymentMethodOption` não foram lidos linha a linha.
