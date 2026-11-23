# P09 · Corrida em andamento

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/em-andamento` · `apps/passenger/app/(app)/em-andamento.tsx` + `src/components/trip/TripProgressBar.tsx`. Com a PP-10, vira um estado de `/corrida` |
| Spec | `PASSAGEIRO.md`, P09: rota, ETA, informações do motorista, segurança. Critério 3: estado sincronizado com o servidor; bloquear transições impossíveis |
| Alvo visual | Mesmo recorte da P08: `alvo_passageiro_2026-11-22.png` (1309, 12, 1536, 508) e `referencias/premium/passageiro/P09-corrida-em-andamento.webp` |
| Estado hoje | UI com simulador (progresso e ETA fabricados) |
| Última nota | 3 (18/11). E2 tratado (mesmo `DriverInfoCard`); E1 (sem mapa), E3 (barra chapada) e E5 (ETA sem destaque) abertos |
| Depende de decisão | PP-10, PP-11 (emergência), PP-12 (veículo no contrato), D-31, D-32, **D-33** (sem cancelar); C-02 e C-12 (D1); S4 (`share`, `sos`) |
| Ordem | Onda 4 (depende do D1) |

## 1. Pergunta que a tela responde

"Quanto falta para eu chegar?" Sucesso: a pessoa vê onde está na rota e a hora de chegada, e alcança a segurança sem procurar.

## 2. Layout

Mesmo esqueleto da P08 (é a mesma tela da prancha). O que muda: a rota vai do carro ao **destino**, o N2 é a chegada ao
destino, o cartão do motorista fica compacto, e **não há "Cancelar corrida"**: o domínio só permite cancelar até
`driver_arrived` (`trip-lifecycle.ts:65`, `em-andamento.tsx:12-14`). O pé do painel fica com a segurança.

```
390×844
┌──────────────────────────────┐
│ ░░░░░░ mapa (sem glow) ░░░░░░ │  carro (posição interpolada) + rota até o destino
│ ░░░░ rota 7 pt + halo ░░░░░░░ │  balão de destino (map.balloon) com o nome do lugar
│ ░░░░░░░░░░░░░░░░░░ ~420 pt ░░ │  sem cabeçalho e sem voltar (D-32)
├──────── painel (sheet) ───────┤  BottomSheet (C-02)
│ ━━                            │
│ Chegada ao destino            │  caption, textSecondary
│ 10:36 · em 12 min             │  heading 28 bold tabular (N2)
│ 📍 Midway Mall, Tirol          │  small, textSecondary, até 2 linhas
│ ↓ 12                          │
│ ┌──────────────────────────┐ │  DriverInfoCard compact (SurfaceRaised)
│ │ (C) Carlos · HB20 Prata   │ │  Avatar 40, nome + veículo numa linha
│ │                [QWE 7B34] │ │  placa em pastilha
│ └──────────────────────────┘ │
│ (selo: trajeto simulado)      │
│ ↓ 16                          │
│ [ 🛡  Segurança           ] 52│  SecondaryButton prominent (N4)
│ safe area                     │
└──────────────────────────────┘
```

- **Hora de chegada antes dos minutos.** Na viagem a pessoa planeja ("chego às 10:36"); nos minutos ela já confere o
  andamento. Os dois, no mesmo N2, separados por "·".
- **A barra de progresso sai.** O mapa com a rota já mostra o quanto falta, com mais informação; a barra de hoje
  (`TripProgressBar`, E3) era o substituto do mapa ausente. Até o C-12, ela fica, com a correção do E3.
- **Segurança vira botão de largura total no pé**, porque nesta fase é a única ação. Abre o mesmo painel da P08
  ("Compartilhar viagem", "Ligar 190"). Sem nenhum dos dois decidido, o botão não aparece e o pé fica vazio (G-19).
- **320×568:** mapa com 220 pt; endereço do destino em 1 linha com reticências (o nome do lugar vem antes da rua); cartão
  compacto em uma linha.
- **430×932:** mais mapa.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | nenhum (não há decisão a tomar durante a viagem) |
| N2 | Hora de chegada e minutos restantes |
| N3 | Destino, motorista, placa |
| N4 | Segurança |
| N5 | "Chegada ao destino", selo |

Amarelo: **0 blocos**. Sinais: a rota. Hoje a barra de progresso é a candidata a "bloco" (preenchimento `gradient.cta` pedido
no E3): fica como sinal só enquanto não houver mapa, com 6 pt de altura.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura, mapa, painel | `RideMapLayout` (P07) | `map.*`, `role.surface`, `elevation.3` |
| Balão de destino | `LocationMarker` + balão (C-12) | `map.balloon`, `map.balloonBorderTop`/`Base`, `elevation.2` |
| N2 | `Text` | `heading` bold, `tabularNums` |
| Motorista | `DriverInfoCard variant="compact"` | `SurfaceRaised` |
| Barra (só até o C-12) | `TripProgressBar` | trilho `surfaceElevated`, preenchimento `gradient.cta` horizontal, 6 pt |
| Segurança | `SecondaryButton` prominent + painel com `ListRow` | ícone `Shield` 20 `textPrimary` |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão (`in_progress`) | Como no layout | `P09-padrao-*` |
| Carregando | Ao reabrir o app: mapa em `map.land`, painel em esqueleto | `P09-carregando-*` |
| Carregando ação | n/a: não há ação de servidor nesta tela (compartilhar abre um painel; o envio tem estado próprio dentro dele) | — |
| Compartilhando | No painel de segurança: spinner na linha "Compartilhar viagem" até o link voltar (`POST /v1/trips/:id/share`), e então a folha de compartilhamento do sistema | `P09-compartilhar-*` (depois do S4) |
| Vazio | n/a | — |
| Chegando (menos de 1 min) | N2 "Chegando ao destino"; o minuto some | `P09-chegando-*` |
| Concluída | A tela segue sozinha para a P10 quando o servidor muda o estado (nunca por cálculo do aparelho) | ver P10 |
| Posição atrasada | Igual à P08: carro parado e "posição atualizada há {n} s" | `P09-posicao-atrasada-*` |
| Erro recuperável | Falha ao gerar o link de compartilhar: `InlineAlert` no painel, "Não foi possível gerar o link agora." + "Tentar de novo" | sim |
| Sem rede | `NetworkBanner`; o estado não muda; o carro congela; "Compartilhar viagem" desabilitado com "Sem conexão". **"Ligar 190" continua ativo** (é chamada de voz, não depende de dados) | `P09-sem-rede-*` |
| Texto longo | Destino "Shopping Midway Mall, Av. Bernardo Vieira, 3775, Tirol" em 2 linhas | `P09-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Painel sobe; N2 em 2 linhas ("10:36" / "em 12 min") | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Um selo embaixo do cartão: "trajeto simulado" | sim |

## 6. Microinterações

- **Entrada (vindo da P08):** a rota do embarque some e a rota até o destino se desenha em 500 ms; o painel encolhe para o
  cartão compacto em 250 ms. Leitor de tela: "Corrida iniciada. Chegada às {hora}".
- **Minutos restantes:** trocam com fade de 150 ms; a hora de chegada só muda se mudar de fato.
- **Câmera:** acompanha o carro e enquadra carro e destino; não recentra enquanto a pessoa arrasta. Botão "recentrar" (44×44,
  `glassOnMap`) aparece só depois de arrastar.
- **Para a P10:** o painel sobe até a tela cheia e vira a P10 (300 ms); resposta tátil de sucesso.

## 7. Copy

| Chave | Texto |
|---|---|
| Rótulo | Chegada ao destino |
| N2 | {hh:mm} · em {n} min · Chegando ao destino |
| Botão | Segurança |
| Painel de segurança | Segurança · Compartilhar viagem · Envie o trajeto ao vivo para alguém de confiança. · Ligar 190 · Polícia Militar, em emergência. |
| Erro de link | Não foi possível gerar o link agora. · Tentar de novo |
| Selo | trajeto simulado |

"Ligar 190" não pode ser chamado de "SOS" nem sugerir que a VuumBora é avisada: o aparelho só liga para a polícia (PP-11).
Quando o `POST /v1/trips/:id/sos` existir (S4), o texto muda para dizer o que a central faz.

## 8. Acessibilidade

- N2 é região viva educada (minutos mudam sem interromper).
- O cartão compacto é lido como "Motorista Carlos, Honda HB20 prata, placa Q W E 7 B 3 4".
- O mapa tem descrição: "Rota até {destino}, chegada às {hora}".
- O painel de segurança prende o foco e tem título como cabeçalho.
- "Ligar 190" tem rótulo explícito: "Ligar para a polícia, 190".

## 9. Assets

Os mesmos da P08 (marcador de veículo do C-12).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Estado | simulador | `PassengerRidePort.subscribe` (S4) | "trajeto simulado" |
| Posição e ETA | simulador (`tripProgressPercent`, `tripEtaMinutes`) | evento `location` + ETA do servidor | idem |
| Rota | não existe | Mapbox Directions (D1) | "mapa ilustrativo" |
| Link de compartilhar | não existe | `POST /v1/trips/:id/share` (S4) e a página web pública (`plano-sistema.md:331`) | — |
| Emergência | `onPress={() => {}}` | `tel:190` (PP-11); depois `POST /v1/trips/:id/sos` (S4) | — |

## 11. Lacunas do protótipo

1. Sem mapa; metade da tela vazia (E1; `em-andamento.tsx:45`).
2. ETA sem destaque (E5): dentro da barra de progresso, em corpo pequeno.
3. Barra de progresso chapada (E3; `TripProgressBar.tsx:52`, trilho com altura 8 fora da regra de 6).
4. Ligar, Mensagem e SOS sem ação (`SafetyActionsRow`, ver P08).
5. Título curto "Em andamento" por causa do corte em 1 linha (`em-andamento.tsx:47-50`); o `ScreenHeader` já quebra em 2
   linhas, mas sobre o mapa a tela fica sem cabeçalho (D-32).
6. Selo no topo, à direita (`:51-56`).

## 12. Pedidos de componente

C-02, C-12 (balão de destino e botão recentrar). `RideMapLayout` (P07). Painel de segurança: componente local
`SafetySheet`, compartilhado por P08 e P09.

## 13. Portão: itens próprios

- G-07b com o recorte "Corrida em andamento": mapa em cima, cartão do motorista, sem botão vermelho (D-33).
- Nenhum caminho para cancelar a partir desta tela (teste de interação: não existe elemento com papel de botão e rótulo
  "Cancelar").
- O estado só muda para a P10 por evento do servidor (teste com o adaptador mock emitindo `completed`).
- Capturas: `passageiro/P09-{padrao,carregando,chegando,posicao-atrasada,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O `TripProgressBar` foi lido só nas linhas de cor e altura. O comportamento do link compartilhado (validade, o que a página
mostra) é do S4 e não tem ficha: é web, fora deste inventário.
