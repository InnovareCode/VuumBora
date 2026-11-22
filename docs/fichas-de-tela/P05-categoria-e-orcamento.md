# P05 · Categoria e orçamento

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | **Não existe como tela.** As categorias estão no início (`apps/passenger/app/(app)/index.tsx:79-102`, `RideCategoryCard`). Proposta: `/categoria`, `apps/passenger/app/(app)/categoria.tsx` |
| Spec | `PASSAGEIRO.md`, P05: categorias de veículo, ETA e preço estimados, forma de pagamento |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recorte 1061, 12, 1297, 508 ("Escolha de categoria"). Referência em alta: `referencias/premium/passageiro/P05-categoria-confirmar.webp` |
| Estado hoje | parcial, com mock (nomes decididos, preços fabricados) |
| Última nota | n/a (avaliada dentro do início, 8) |
| Depende de decisão | 7 e 13 (preço), 3 (pagamento), D-08 e D-09 (3 das 5 categorias nascem desligadas), PP-2, PP-3 |
| Ordem | Onda 3 |

## 1. Pergunta que a tela responde

"Qual carro e quanto vai custar?" Sucesso: a pessoa vê a rota, compara as categorias pelo preço estimado e pela chegada,
escolhe uma e segue, sem rolar em 390×844.

## 2. Layout

Leitura da prancha: o **mapa ocupa os 45% de cima** com a rota amarela grossa, o pino de origem e o de destino, e dois
**balões escuros** com o endereço (o de origem com "‹" para voltar). Embaixo, um painel com "Escolha uma categoria", linhas de
categoria de cerca de 66 pt (caixa do veículo de 48, nome, legenda e preço à direita), a selecionada com borda amarela de 2 pt e
halo, a linha "Pagamento: Pix ›" e o CTA em largura total.

```
390×844
┌──────────────────────────────┐
│ [‹ ◉ Av. Eng. Roberto Freire]│  balão de origem (map.balloon) + voltar, safe area
│ ░░░░░░ mapa ░░░░░░░░░░░░░░░░░ │
│ ░░░░ rota 7 pt + halo ░░░░░░░ │  RouteOverlay (C-12)
│ ░░░[📍 Midway Mall, Tirol]░░░ │  balão de destino
│ ░░░░░░░░░░░░░░░░ ~380 pt ░░░ │
├──────── painel (sheet) ───────┤  BottomSheet (C-02), radius.xxl em cima, elevation.3
│ ━━ (alça)                     │
│ Escolha uma categoria         │  SectionHeader; selo "preço de demonstração" embaixo
│ ┌──────────────────────────┐ │
│ │[🚗] VuumBora     R$ 23,90│ │  linha 66 pt; VehicleIconBox 48 (C-11)
│ │     Até 4 · chega em 4 min│ │  selecionada: borda 2 pt yellow + glow.selected
│ └──────────────────────────┘ │
│ [🚗] Conforto        R$ 29,90 │  vão 8
│ ↓ 12                          │
│ [◆ Pagamento: Pix          ›] │  ListRow → seletor de pagamento
│ ↓ 12                          │
│ [     Continuar      ] 56     │  PrimaryButton (P06 = o mesmo painel em "revisar", PP-3)
│ safe area                     │
└──────────────────────────────┘
```

- **Categorias no lançamento: 2** (VuumBora e Conforto). Motorista mulher, Entrega e Pet nascem desligadas
  (`docs/plano-mestre.md:235-236`). Quando ligarem, o painel mostra no máximo 3 linhas e o resto rola **dentro** do painel,
  que pode subir até 85% da tela.
- **320×568:** mapa com 168 pt; linhas de 60 pt, sem a ilustração lateral do veículo, só a caixa de ícone; o CTA fica no
  `FooterActions` do painel.
- **≥ 360:** pode usar a `VehicleIllustration` dentro da caixa (`docs/direcao-de-arte.md` §7.1), nunca no lugar dela.
- **430×932:** o mapa ganha a sobra; o painel tem a altura do conteúdo.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Continuar" |
| N2 | Preço estimado da categoria selecionada |
| N3 | Linhas de categoria, rota, endereços |
| N4 | Voltar (no balão), trocar o pagamento |
| N5 | Legenda da categoria, selo |

Amarelo: 1 bloco (CTA). Sinais: a rota, a borda e o halo da linha selecionada. O preço **não** é amarelo (a prancha também não).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell padded={false}`, **sem** `glow` (tem mapa) | — |
| Mapa, rota, pinos, balões | C-12 (`MapView`, `RouteOverlay`, `LocationMarker`); até lá, `MapPreviewBackground` com um traço ilustrativo e o selo | `map.*`, `map.balloon` (PP-7), `elevation.2` |
| Painel | `BottomSheet` (C-02) | `role.surface`, `elevation.3`, `radius.xxl` |
| Linha de categoria | `RideCategoryCard` (`apps/passenger/src/components/home/RideCategoryCard.tsx`) em modo linha + `VehicleIconBox` (C-11) | `SurfaceRaised`, selecionado `brand.yellow` 2 pt + `glow.selected` |
| Preço | `MoneyText` com "estimado" (C-10) | `subtitle` bold, `tabularNums` |
| Pagamento | `ListRow` (C-08) + seletor em painel | logo do Pix na cor da marca Pix |
| Ação | `PrimaryButton` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Rota desenhada, 2 categorias, uma pré-selecionada (a última usada, senão a primeira) | sim |
| Carregando (cotação) | Mapa com a rota já desenhada; linhas com nome e ícone reais e preço/ETA em esqueleto; CTA desabilitado | `P05-cotando-*` |
| Carregando ação | Spinner no CTA | sim |
| Vazio (nenhuma categoria atende a rota) | No painel: "Ainda não atendemos este trajeto." + "Trocar destino" | sim |
| Erro (cotação falhou) | No painel: "Não conseguimos calcular o preço agora." + "Tentar de novo"; mapa continua | sim |
| Cotação vencida (`409 quote_expired`) | Faixa no painel: "O preço foi atualizado." e os valores novos aparecem; o CTA pede um segundo toque | sim |
| Sem motorista na região | Na linha: "Sem motoristas por perto agora", em `textMuted`, e a linha desabilitada | sim |
| Sem rede | `NetworkBanner`; o CTA desabilitado com "Sem conexão" embaixo | sim |
| Texto longo | Endereço de 2 linhas no balão (depois, reticências); preço de 4 dígitos (R$ 1.234,56) sem cortar | sim |
| 320×568 | Ver layout | sim |
| 430×932 | Ver layout | sim |
| Fonte 200% | O painel sobe e rola; nome e preço em 2 linhas, o preço inteiro | aparelho |
| Teclado | n/a | — |
| Permissão | n/a (a origem já veio da P04) | — |
| Mock | Selo "preço de demonstração" embaixo do título do painel; selo "mapa ilustrativo" até o C-12 | sim |

## 6. Microinterações

- Entrada: a rota se desenha em 500 ms (`docs/movimento.md`, mapa), e o painel sobe 250 ms depois.
- Seleção: a borda acende e a linha sobe 2 pt (150 ms); a anterior apaga **ao mesmo tempo**; resposta tátil leve.
- Arrastar a alça do painel para cima mostra mais categorias; para baixo, mostra mais mapa (nunca fecha o painel).
- Preço que muda (cotação nova): troca com fade de 150 ms, sem "dançar" (`tabularNums`).

## 7. Copy

| Chave | Texto |
|---|---|
| Título do painel | Escolha uma categoria |
| Linha | {nome} · {legenda curta da categoria} · chega em {n} min · R$ {valor} |
| Rótulo do preço | Preço estimado (em `caption`, acima do valor da selecionada, ou no rótulo acessível) |
| Pagamento | Pagamento: {forma} |
| CTA | Continuar |
| Vazio | Ainda não atendemos este trajeto. · Trocar destino |
| Erro | Não conseguimos calcular o preço agora. · Tentar de novo |
| Preço atualizado | O preço foi atualizado. Confira antes de continuar. |
| Sem motorista | Sem motoristas por perto agora |
| Selo | preço de demonstração |

Legenda por categoria: a escrever com o dono (decisão 13). **Não usar** "Mais econômico" (é comparação de preço que depende
da tarifa) nem "Veículos executivos" (não decidido).

## 8. Acessibilidade

- As linhas formam um grupo de opção única (`radiogroup`); cada uma é lida como "VuumBora, preço estimado 23 reais e 90
  centavos, chega em 4 minutos, selecionada".
- O mapa tem uma descrição em texto: "Rota de {origem} até {destino}, {distância}".
- O painel recebe o foco depois que a rota aparece, não antes.
- O alvo de cada linha é a linha inteira (≥ 60 pt).

## 9. Assets

Existem: `vehicles/veiculo-{economico,comfort,plus}.png` (fundo preto aceito). Falta: o carro de frente em SVG (C-11) e os
ícones das categorias modificadoras (Motorista mulher, Entrega e Pet: lucide `UserRound`, `Package`, `PawPrint`, já usados
em `index.tsx:31-33`).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Categorias | `MOCK_RIDE_CATEGORIES` (5) | `GET /v1/categories` (D2) | não, quando real |
| Preço e ETA | fabricados (`mockRideCategories.ts:37-41`) | `POST /v1/quotes` | **sim** |
| Rota | não existe | Mapbox Directions (D1) | "mapa ilustrativo" |
| Pagamento | `MOCK_PAYMENT_METHODS` | provedor (decisão 3) | sim |

## 11. Lacunas do protótipo

1. A tela não existe; as categorias estão no início, **antes** de haver rota (PP-2).
2. As 5 categorias aparecem, quando 3 nascem desligadas (D-08, D-09).
3. Não há mapa, rota nem painel.
4. O preço não diz "estimado" na linha; só o selo diz.

## 12. Pedidos de componente

C-02, C-10, C-11, C-12, C-07, C-08; tokens `map.*` e `map.balloon` (PP-7).

## 13. Portão: itens próprios

- G-07b com o recorte "Escolha de categoria" (e G-07 com `P05-categoria-confirmar.webp`): linha de 64 a 68 pt, vão de 8, caixa
  de 48 com raio 12, borda do selecionado de 2 pt, CTA de 56.
- Em 390×844, mapa + painel com 2 categorias + pagamento + CTA cabem sem rolar.
- Rota: amarelo sobre o solo ≥ 3:1 (previsto 10,5:1).
- Capturas: `passageiro/P05-{padrao,cotando,vazio,erro,preco-atualizado,sem-rede}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O `RideCategoryCard` de hoje não foi lido linha a linha. O preço de "Motorista mulher", "Entrega" e "Pet" na prancha não existe
(a prancha só mostra 3 categorias genéricas).
