# P04 · Origem e destino

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/destino` · `apps/passenger/app/(app)/destino.tsx` |
| Spec | `PASSAGEIRO.md`, P04: endereços, autocomplete, confirmação no mapa |
| Alvo visual | **Sem recorte na prancha.** Herda o topo da "Escolha de categoria" (1061, 12, 1297, 508): os dois balões de endereço sobre o mapa, e a pílula clara da "Home" |
| Estado hoje | UI com mock (busca numa lista local) |
| Última nota | 7,5 (18/11). D1 e D2 seguem abertos no `ScreenHeader` |
| Depende de decisão | D1 do plano dos apps: onde roda a busca de endereço (app com token público ou API) |
| Ordem | Onda 2 |

## 1. Pergunta que a tela responde

"De onde e para onde?" Sucesso: origem e destino escolhidos em até 3 toques a partir de um lugar salvo, ou em até 5
caracteres digitados.

## 2. Layout

Tela de **digitação**: o teclado vai ocupar metade da tela, então a lista de resultados precisa caber na metade de cima.

```
390×844
┌──────────────────────────────┐
│ ‹      Para onde vamos?       │  ScreenHeader centralizado (C-17)
│ ↓ 12                          │
│ ┌──────────────────────────┐ │  um cartão só, SurfaceRaised, radius.lg
│ │ ● Sua localização atual ⇅│ │  origem (map.pickup, círculo) + trocar
│ │ │                        │ │  traço vertical ligando os dois
│ │ 📍 Para onde você vai?   │ │  destino (map.destination, pino), em foco
│ └──────────────────────────┘ │  cada campo 52 pt
│ ↓ 16                          │
│ [📍 Escolher no mapa       ›]│  ListRow
│ ↓ 16                          │
│ Lugares salvos                │  SectionHeader (selo EMBAIXO)
│ (selo: endereços de exemplo)  │
│ [🏠 Casa · Ponta Negra     ›]│  PlaceRow, 56 pt, vão 8
│ [💼 Trabalho · Centro      ›]│
│ Recentes                      │
│ [🕑 Midway Mall · Tirol    ›]│
│                               │
│ [ Confirmar ] (só sem teclado)│  FooterActions; some com o teclado aberto
└──────────────────────────────┘
```

- **Origem:** começa como "Sua localização atual" (não editável enquanto não for tocada), o que resolve a auditoria D3. Tocar
  nela vira um campo de busca.
- **Escolher ao escolher:** tocar num resultado do destino, com a origem já definida, vai **direto** para a P05 (sem
  "Confirmar"). O "Confirmar" existe só para o caso em que a origem foi editada por último.
- **Escolher no mapa:** abre o mapa com um pino fixo no centro e o endereço num balão em cima; o CTA é "Confirmar este local".
- **320×568:** o cartão de origem e destino fica com 2 × 48; com o teclado aberto, sobram cerca de 3 resultados visíveis e
  isso é aceitável.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | Campo de destino (em foco) / "Confirmar" quando visível |
| N2 | Título "Para onde vamos?" |
| N3 | Resultados, lugares salvos |
| N4 | Voltar, trocar origem e destino, escolher no mapa |
| N5 | Selo, rótulos de seção |

Amarelo: o CTA, quando visível. Sinal: a borda do campo focado. **O ponto da origem deixa de ser amarelo** e passa a
`map.pickup` (verde); o pino do destino deixa de ser `warning` e passa a `map.destination` (§4 do padrão).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` | — |
| Cabeçalho | `ScreenHeader` (C-17) | `title` |
| Origem e destino | `TextInput` + `SearchInput` dentro de um `SurfaceRaised` (novo arranjo: `RouteInputCard`, local do app) | `role.input`, `map.pickup`, `map.destination` |
| Linhas | `PlaceRow` (`apps/passenger/src/components/destination/PlaceRow.tsx`) → `ListRow` (C-08) | `SurfaceRaised`, ícone `textSecondary` |
| Título de seção | `SectionHeader` (C-07) | `textStyle('bold','body')` |
| Vazio | `EmptyState` com ícone `SearchX` (C-09) | — |
| Ação | `PrimaryButton` em `FooterActions` (C-04) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Foco no destino, lugares salvos e recentes | sim |
| Carregando | Busca em andamento: 3 linhas em esqueleto no lugar dos resultados, depois de 300 ms de digitação parada | `P04-buscando-*` |
| Carregando ação | n/a | — |
| Vazio (sem resultado) | `EmptyState` "Nenhum endereço encontrado" + "Tente outro nome de rua, bairro ou ponto de referência." + "Escolher no mapa" (`destino.tsx:105-109` já tem os 2 textos) | sim |
| Vazio (sem salvos nem recentes) | Só "Escolher no mapa" e a dica "Digite um endereço ou um lugar." | sim |
| Erro de busca | Faixa acima da lista: "Não conseguimos buscar agora." + "Tentar de novo"; os salvos continuam | sim |
| Sem rede | `NetworkBanner`; só salvos e recentes; a busca mostra "Sem conexão para buscar endereços novos." | sim |
| Texto longo | Endereço com número e complemento em 2 linhas no resultado; no campo, rola dentro do campo | sim |
| 320×568 | Ver layout | sim |
| 430×932 | Lista não estica além de 480 | sim |
| Fonte 200% | Resultados com 2 linhas por item, sem cortar o nome do lugar | aparelho |
| Teclado aberto | Os campos e pelo menos 2 resultados visíveis; o CTA some | aparelho |
| Permissão negada | Origem vira um campo vazio, "De onde você vai sair?", com foco nele | sim |
| Mock | Um selo embaixo de "Lugares salvos" | sim |

## 6. Microinterações

- Entrada: vem da pílula da P03, que cresce e vira o cartão de origem e destino (300 ms).
- ⇅ troca origem e destino com os dois campos cruzando em 200 ms.
- Resultados entram em escada de 30 ms, até 6 itens.
- Toque num resultado: a linha escurece (pressionado) e a tela segue.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Para onde vamos? |
| Origem | Sua localização atual · placeholder ao editar: "De onde você vai sair?" |
| Destino | placeholder: "Para onde você vai?" |
| Linha do mapa | Escolher no mapa |
| Seções | Lugares salvos · Recentes · Resultados |
| Vazio | **Nenhum endereço encontrado.** Tente outro nome de rua, bairro ou ponto de referência. |
| Erro | Não conseguimos buscar agora. · Tentar de novo |
| CTA | Confirmar |
| Mapa | Confirmar este local |
| Selo | endereços de exemplo |

## 8. Acessibilidade

- O foco abre no campo de destino (com o teclado), e o leitor anuncia "Destino, campo de busca".
- A quantidade de resultados é anunciada ("5 resultados") numa região polida.
- ⇅ com o rótulo "Trocar origem e destino".
- Linha de resultado: "{nome}, {endereço}. Tocar para escolher como destino".

## 9. Assets

Nenhum novo. Ícones: `Circle` (origem), `MapPin` (destino), `ArrowUpDown`, `Map`, `Home`, `Briefcase`, `Clock`, `SearchX`.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Busca | `searchMockPlaces` local (`destino.tsx:31`) | `PlacesPort` (Mapbox Search, D1) | sim |
| Lugares salvos | `MOCK_SAVED_PLACES` (`destino.tsx:97`) | API do usuário | sim |
| Localização atual | não existe | `expo-location` | — |

## 11. Lacunas do protótipo

1. Sem "confirmação no mapa" (está na spec) nem localização atual.
2. O selo divide a linha com o título (`destino.tsx:91-93`, regra C1).
3. Origem com o ponto amarelo (`destino.tsx:74`).
4. Título trunca em 320 porque o `ScreenHeader` reserva a caixa da direita (`ScreenHeader.tsx:30`, D1); seta em glifo
   (`:50`, D2).
5. Sem estado de carregamento nem de erro da busca (a busca de hoje é síncrona).
6. `router.back()` depois de confirmar (`destino.tsx:61`) volta ao início em vez de seguir para a P05.

## 12. Pedidos de componente

C-04, C-07, C-08, C-09, C-17; componente local `RouteInputCard`.

## 13. Portão: itens próprios

- Com o teclado aberto em 390×844 (aparelho): os 2 campos e ≥ 2 resultados visíveis.
- Marcadores: origem = círculo `map.pickup`; destino = pino `map.destination`. Nenhum amarelo.
- Capturas: `passageiro/P04-{padrao,buscando,vazio,erro,sem-rede,sem-permissao}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

`PlaceRow` e `SearchInput` não foram lidos linha a linha.
