# M07 · A caminho do embarque

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Proposta: `/corrida` · `apps/driver/app/(app)/corrida.tsx`, com M07, M08 e M09 como estados da mesma tela (PP-10, versão do motorista) |
| Spec | `MOTORISTA.md`, M07: instruções de rota, endereço, contato com passageiro. Regras: status com confirmação do servidor; localização em segundo plano com consentimento próprio |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 290, 516, 487, 926 ("Navegação (GPS)"), **só a estrutura**: mapa em tela cheia com um cartão em cima e outro embaixo. O passo a passo ("300 m, vire à direita") não entra (D-21) |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | **10** (navegação: app externo recomendado, D-20/D-21), **11** (contato com o passageiro), **15** (consequência de o motorista cancelar), PP-10 (README); C-12 (D1); D4 (localização em segundo plano); S4 |
| Ordem | Onda 4 (D1 + decisão 10) |

## 1. Pergunta que a tela responde

"Aonde eu vou buscar, e como chego lá?" Sucesso: o motorista vê o endereço exato e o ponto no mapa, abre o Waze ou o Google
Maps com um toque e, ao chegar, avisa o passageiro com outro toque.

## 2. Layout

Da prancha "Navegação", fica a estrutura: mapa ocupando a tela, um cartão escuro no topo e um cartão no pé. Como a navegação
passo a passo é do app externo (decisão 10, recomendação), o cartão do topo deixa de ser a próxima manobra e vira o
**destino desta fase**: o endereço do embarque.

```
390×844
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │  cartão sobre o mapa: glassOnMap, elevation.2, safe area
│ │ Embarque                  │ │  caption textMuted
│ │ Av. Prudente de Morais,   │ │  subtitle 18 semibold, até 2 linhas (N2)
│ │ 1200 · Lagoa Nova        ⋯│ │  small textSecondary · botão "Mais opções" 44×44
│ └──────────────────────────┘ │
│ ░░░░░░░░ mapa ░░░░░░░░░░░░░░░ │  MapView (C-12), estilo de navegação (§3.2 da direção de arte)
│ ░░░ rota 7 pt até o ● ░░░░░░░ │  rota do motorista ao embarque
│ ░░░░░░░░ ▲ (você) ░░░░░░░░░░░ │  marcador do motorista (map.userLocation)
├──────── painel (sheet) ───────┤  BottomSheet baixo (C-02)
│ ━━                            │
│ 6 min · 1,8 km                │  title 22 bold tabular
│ (A) Ana                       │  Avatar 40 com inicial + primeiro nome (D-19)
│ ↓ 12                          │
│ [ ➤ Navegar até o embarque ] 56│  PrimaryButton (N1), abre Waze/Google Maps
│ ↓ 12                          │
│ [   Cheguei ao embarque    ] 56│  SecondaryButton prominent (N4)
│ safe area                     │
└──────────────────────────────┘
```

**Troca do N1 pela proximidade** (recomendação; o limiar é [confirmar] com a Nova): enquanto o motorista está a mais de
200 m do embarque, o amarelo é "Navegar até o embarque"; a menos de 200 m, os dois botões trocam de lugar e o amarelo passa
a ser "Cheguei ao embarque". O motorista volta do Waze para o app justamente para avisar que chegou, e o botão certo já está
no lugar do polegar. Um bloco amarelo de cada vez. Sem posição confiável, fica a ordem padrão.

- **"Mais opções" (⋯)** abre um painel com "Cancelar corrida" (destrutivo, com motivo) e "Suporte" (M14). Cancelar não fica
  à vista: na prancha não existe, e cancelar com o passageiro esperando tem consequência (decisão 15).
- **Contato com o passageiro** (ligar, mensagem): só com canal mascarado (decisão 11). Até lá, não aparece.
- **Endereço exato e ponto exato** chegam agora, depois do aceite, só para o motorista atribuído (`DriverTripSnapshot`,
  decisão de 22/11). O destino da viagem **não** aparece nesta fase: o motorista ainda não precisa dele, e ele volta na M09.
- **320×568:** cartão do topo com o endereço em 1 linha + bairro; o painel perde o avatar (fica só "Ana · 6 min · 1,8 km");
  botões com 52.
- **430×932:** mais mapa.
- **Até o C-12:** `MapPreviewBackground variant="motorista"` com o selo "mapa ilustrativo"; os dois botões funcionam (o
  "Navegar" abre o app externo com o endereço do mock).

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Navegar até o embarque" (longe) ou "Cheguei ao embarque" (perto) |
| N2 | Endereço do embarque |
| N3 | Tempo e distância, primeiro nome da passageira, mapa |
| N4 | O outro botão, "Mais opções" |
| N5 | "Embarque", selo |

Amarelo: 1 bloco. Sinais: a rota. O marcador do motorista é `map.userLocation` (azul), não amarelo.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell padded={false}` sem `glow` | — |
| Mapa | C-12 em estilo de navegação (sem POI, só rótulo de via principal, `docs/direcao-de-arte.md` §3.2) | `map.*` |
| Cartão do topo | `View` sobre o mapa | `role.glassOnMap` (sem blur), `elevation.2`, `radius.lg`, borda `map.balloonBorderTop`/`Base` |
| Painel | `BottomSheet` (C-02), altura do conteúdo | `role.surface`, `elevation.3` |
| Passageira | `Avatar` 40 com inicial | — |
| Ações | `PrimaryButton` + `SecondaryButton` prominent | 56 |
| Mais opções | `Pressable` 44×44 + painel com `ListRow` | ícone `MoreHorizontal` 24 |
| Cancelar | `ConfirmDialog destructive` com motivos (`DriverCancelReason`, provisórios até a decisão 15) | — |
| Abrir navegação | porta `openNavigation(point, label)` com versão web: `waze://` → `google.navigation:` → `geo:`/`maps:` → link web | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão (`driver_en_route`, longe) | Como no layout | `M07-padrao-*` |
| Perto do embarque | Botões trocados | `M07-perto-*` |
| Carregando | Logo depois do aceite, o snapshot com o endereço exato ainda não chegou: cartão do topo em esqueleto (2 linhas), botões desabilitados | `M07-carregando-*` |
| Carregando ação (cheguei) | Spinner no botão; o estado só muda com a resposta do servidor (`arrived`) | `M07-chegando-*` |
| Cheguei aceito | A tela vira a M08 | ver M08 |
| Vazio | n/a | — |
| Nenhum app de navegação | O "Navegar" abre o mapa do sistema; se nada abrir, `InlineAlert` com o endereço e "Copiar endereço" | `M07-sem-app-navegacao-*` |
| Passageiro cancelou | Evento de status `cancelled`: tela de aviso "O passageiro cancelou a corrida." + "Voltar ao painel" (a taxa, se houver, aparece no histórico, M12) | `M07-passageiro-cancelou-*` |
| Erro ao avisar chegada | `409 invalid_transition` (a corrida mudou): a tela relê o estado e segue; rede: `InlineAlert` "Sem conexão. Tentando de novo…" com a mesma chave | um por código |
| Cancelando (motorista) | Spinner no botão do diálogo; ao confirmar, volta ao painel online | `M07-cancelando-*` |
| Sem rede | `NetworkBanner`; nada muda de estado; "Navegar" funciona (o app externo tem o endereço); "Cheguei" desabilitado com "Sem conexão" | `M07-sem-rede-*` |
| Posição negada ou só em primeiro plano | `PermissionPrompt` (C-06): o despacho e a corrida precisam da posição em segundo plano, com consentimento próprio (`MOTORISTA.md`) | `M07-sem-permissao-*` |
| Texto longo | Endereço "Rua Doutor José Gonçalves, 1580, Bloco B, Apto 302 · Lagoa Nova" em 2 linhas + bairro | `M07-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | O cartão do topo cresce até 40% da altura e depois corta o endereço com reticências (o endereço inteiro está no app externo); o painel rola | aparelho |
| Teclado | n/a | — |
| Mock | Um selo no painel, embaixo do nome: "corrida de demonstração" | sim |

## 6. Microinterações

- **Entrada (vindo da M06):** o cartão de rota da oferta cresce e vira o cartão do topo, agora com o endereço exato (300 ms).
- **Navegar:** resposta tátil leve; o app externo abre. Na volta ao app, a tela relê o estado do servidor.
- **Troca por proximidade:** os dois botões trocam de lugar com cross-fade de 200 ms, **uma vez** (sem ficar alternando
  quando o GPS oscila: histerese de 50 m).
- **Mapa:** o marcador do motorista anda interpolado; a câmera segue com o norte para cima por padrão.

## 7. Copy

| Chave | Texto |
|---|---|
| Rótulo do topo | Embarque |
| Painel | {n} min · {d} · {primeiro nome} *(só o nome: o contrato não tem gênero, e não deve ter)* |
| N1 | Navegar até o embarque · Cheguei ao embarque |
| Mais opções | Mais opções · Cancelar corrida · Suporte |
| Cancelar (diálogo) | Cancelar a corrida? · O passageiro volta para a fila e outro motorista é chamado. · {motivos} · Cancelar corrida · Continuar |
| Sem app de navegação | Não encontramos um app de navegação. · Copiar endereço |
| Passageiro cancelou | O passageiro cancelou a corrida. · Voltar ao painel |
| Selo | corrida de demonstração |

No diálogo de cancelar, nenhuma frase sobre penalidade até a decisão 15. A frase "O passageiro volta para a fila" é a regra
do domínio (`trip-lifecycle.ts:19`), não promessa.

## 8. Acessibilidade

- O cartão do topo é cabeçalho da tela: "Embarque: {endereço}".
- "Navegar até o embarque" diz o que acontece: "abre o Waze" ou "abre o Google Maps", conforme o app encontrado.
- A troca dos botões por proximidade é anunciada: "Você está perto do embarque".
- Alvos de 44 no "⋯".

## 9. Assets

O marcador do motorista (seta de navegação) do C-12.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Endereço e ponto exatos do embarque | não existe | `DriverTripSnapshot.pickup` (só o atribuído, A3) | "corrida de demonstração" |
| Primeiro nome | não existe | `DriverTripSnapshot.passenger.firstName` | idem |
| Posição do motorista | não existe | `expo-location` em segundo plano (D4) → `DriverLocationPort` | — |
| Tempo e distância | não existe | Mapbox Directions (D1) | idem |
| Estado | não existe | `DriverTripPort.subscribe` / `status` | — |

## 11. Lacunas do protótipo

A tela não existe. O `DriverMapPreview` da M05 (`apps/driver/src/components/home/DriverMapPreview.tsx`) é o ponto de partida
do mapa ilustrativo.

## 12. Pedidos de componente

C-02, C-06, C-12 (estilo de navegação, marcador do motorista). Porta `openNavigation` com versão web (regra do repositório
para módulo nativo).

## 13. Portão: itens próprios

- G-07b com o recorte "Navegação (GPS)": mapa ocupando a altura, cartão escuro no topo, cartão no pé. Divergência
  permitida: D-21 (sem passo a passo).
- Exatamente 1 bloco amarelo nos dois estados (longe e perto).
- O endereço exato não aparece em nenhuma captura da M06 e aparece nesta.
- Com a rede cortada, "Navegar" ainda abre o app externo (G-18).
- Capturas: `motorista/M07-{padrao,perto,carregando,chegando,sem-app-navegacao,passageiro-cancelou,cancelando,sem-rede,sem-permissao,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O limiar de 200 m e a histerese de 50 m são proposta minha; o servidor pode validar a chegada por distância (a definir no
S4). Não testei os esquemas de URL do Waze e do Google Maps em aparelho.
