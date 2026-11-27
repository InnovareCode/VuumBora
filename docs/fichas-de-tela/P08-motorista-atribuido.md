# P08 · Motorista atribuído (a caminho e chegou)

> **Atualização de 27/11/2026 (Atlas):** o plano D-12 foi decidido pelo dono em 22/11/2026: **PIN em todas as categorias**. Onde esta ficha diz "se o plano D-12 for sim", leia "sempre". Contrato: `PassengerTripSnapshot.pickupCode` (4 algarismos, só de `driver_assigned` a `driver_arrived`) e `start` do motorista com `pickupCode` obrigatório.

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/a-caminho` · `apps/passenger/app/(app)/a-caminho.tsx` + `src/components/assignedDriver/{DriverInfoCard,SafetyActionsRow}.tsx`. Com a PP-10, vira um estado de `/corrida` |
| Spec | `PASSAGEIRO.md`, P08: dados necessários, placa, veículo, ETA, contato e segurança. Critério 5: telefone e chat só por canal realmente disponível |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recorte 1309, 12, 1536, 508 ("Corrida em andamento", cortada na borda direita). Referência em alta: `referencias/premium/passageiro/P09-corrida-em-andamento.webp`. A prancha chama de "em andamento" a fase em que o motorista **vem buscar** (tem "Chegada em 5 min" e "Cancelar corrida"); por isso o recorte serve à P08 e à P09 |
| Estado hoje | UI com simulador; Ligar, Mensagem e SOS sem ação |
| Última nota | 4 (18/11). A1, A2, A3 e A6 tratados no código; A5 (sem mapa) aberto |
| Depende de decisão | **11** (contato e canal mascarado), **15** (taxa de cancelamento), **plano D-12** (código de embarque), PP-10, PP-11 (emergência), PP-12 (contrato do motorista), D-11, D-31, D-32; C-02 e C-12 (D1); S4 |
| Ordem | Onda 4 (depende do D1) |

## 1. Pergunta que a tela responde

"Quem vem me buscar, em que carro, e quando chega?" Sucesso: a pessoa reconhece o carro pela placa e pelo modelo, sabe
quanto falta, e tem à mão a segurança e o cancelamento.

## 2. Layout

Leitura da prancha: **mapa nos 45% de cima** com a rota amarela e o carro; painel embaixo com o cartão do motorista (foto
redonda, nome e nota, modelo e cor, a placa numa pastilha, mensagem e ligar à direita), uma faixa de dois números ("Chegada
em 5 min" | "Distância 2,4 km") e "Cancelar corrida" em contorno vermelho no pé.

```
390×844
┌──────────────────────────────┐
│ ░░░░░░ mapa (sem glow) ░░░░░░ │  MapView (C-12): carro (posição interpolada),
│ ░░░░ rota do carro ao ● ░░░░░ │  rota até o embarque, pino de embarque
│ ░░░░░░░░░░░░░░░░░░ ~380 pt ░░ │  sem cabeçalho e sem voltar (D-32)
│                     [🛡]      │  botão Segurança 44×44, glassOnMap, elevation.2
├──────── painel (sheet) ───────┤  BottomSheet (C-02)
│ ━━                            │
│ Motorista a caminho           │  caption, textSecondary (subfase)
│ Chega em 5 min                │  heading 28 bold tabular (N2), textPrimary
│ ↓ 12                          │
│ ┌──────────────────────────┐ │  SurfaceRaised (cartão do motorista)
│ │ (C)  Carlos   ★ 4,9       │ │  Avatar 56 com inicial (D-27); nota só se vier
│ │      Honda HB20 · Prata   │ │  small, textSecondary (PP-12: falta no contrato)
│ │      [ QWE 7B34 ]         │ │  placa: body bold tabular, pastilha surfaceElevated
│ ├──────────────────────────┤ │
│ │ Distância 2,4 km │ Pix    │ │  2 colunas: distância até você · forma de pagamento
│ └──────────────────────────┘ │
│ (selo: corrida simulada)      │  um só
│ ↓ 16                          │
│ [    Cancelar corrida     ] 52│  DangerButton (N4)
│ safe area                     │
└──────────────────────────────┘
```

**Três subfases, um layout** (`a-caminho.tsx:13-17`): muda só a linha de cima do painel e o N2.

| Subfase | Linha de cima | N2 | Mapa |
|---|---|---|---|
| `driver_assigned` | Motorista encontrado | Chega em {n} min | rota do carro ao embarque |
| `driver_en_route` | Motorista a caminho | Chega em {n} min | idem, carro andando |
| `driver_arrived` | Seu motorista chegou | Confira a placa {placa} | carro parado no embarque; sem rota |

**Chegou** ganha um bloco a mais embaixo do cartão: "Aguardando você há {m:ss}" (caption tabular) e, **se o plano D-12 for
"sim"**, o código de embarque em destaque ("Seu código: 4 8 2 1", `heading` tabular com espaçamento), que a pessoa diz ao
motorista. Sem decisão, o bloco não existe.

- **Mensagem e ligar não aparecem** até existir canal mascarado (decisão 11, D-11). O lugar deles no cartão (os dois botões
  amarelos cheios da prancha) fica vazio; quando entrarem, são `SecondaryButton` de ícone 44×44, **neutros** (D-31).
- **Segurança** fica no mapa, à direita e embaixo, longe do cancelar: abre um painel com "Compartilhar viagem" (S4,
  `POST /v1/trips/:id/share`) e "Ligar 190" (PP-11). Sem nenhum dos dois decidido, o botão não aparece (G-19).
- **Faixa de dois números:** a prancha tem "Chegada em" | "Distância". Como o ETA subiu para o N2, a faixa fica com a
  distância e a forma de pagamento (a pessoa confere como vai pagar antes de entrar). A coluna de pagamento depende da
  decisão 3; sem ela, a faixa tem só a distância, em largura total.
- **320×568:** mapa com 200 pt; a faixa de 2 colunas some (distância vai para a linha de cima: "Motorista a caminho ·
  2,4 km"); o cartão do motorista fica com a placa à direita do nome.
- **430×932:** mais mapa; o painel tem a altura do conteúdo.
- **Até o C-12:** `MapPreviewBackground` com o selo "mapa ilustrativo"; nenhum carro "andando" sobre a imagem.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | nenhum (não há decisão a tomar; esperar é o caminho feliz) |
| N2 | "Chega em {n} min" (ou "Confira a placa", ao chegar) |
| N3 | Nome, modelo e cor, **placa**, distância, forma de pagamento |
| N4 | Cancelar corrida, Segurança |
| N5 | Subfase, tempo de espera, selo |

Amarelo: **0 blocos**. Sinais: a rota, a estrela da nota. A prancha pinta o "5 min" e os dois botões de contato de amarelo:
os três saem (D-31). O ícone do relógio amarelo de hoje (`a-caminho.tsx:87`) sai.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura, mapa, painel | `RideMapLayout` (pedido da P07) = `AppShell padded={false}` + C-12 + C-02 | `map.*`, `role.surface`, `elevation.3` |
| Carro no mapa | `LocationMarker` variante veículo (C-12) | `elevation.2`; posição interpolada |
| Botão Segurança | `Pressable` 44×44 sobre o mapa | `role.glassOnMap`, `elevation.2`, ícone `Shield` 24 `textPrimary` |
| Cartão do motorista | `DriverInfoCard` (`src/components/assignedDriver/DriverInfoCard.tsx`) | `SurfaceRaised`; placa em pastilha `surfaceElevated`, `radius.md` |
| Avatar | `Avatar` (`packages/ui`) com inicial; foto só a real e verificada | — |
| Nota | `StarRating` com o `Star` do lucide (já, `DriverInfoCard.tsx:8-10`) | estrela `brand.yellow` (sinal) |
| ETA | `Text` | `heading` bold, `tabularNums`, `textPrimary` |
| Cancelar | `DangerButton` + `ConfirmDialog destructive` (C-03) | — |
| Avisos | `InlineAlert`, `NetworkBanner` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão a caminho | Como no layout | `P08-a-caminho-*` |
| Motorista encontrado | Linha "Motorista encontrado"; mesma estrutura | `P08-encontrado-*` |
| Chegou | Ver a tabela de subfases; "Aguardando você há {m:ss}" | `P08-chegou-*` |
| Chegou com código (plano D-12 = sim) | Bloco do código embaixo do cartão | `P08-codigo-*` (só depois da decisão) |
| Carregando | Ao reabrir o app: mapa em `map.land`, painel em esqueleto com a forma do cartão | `P08-carregando-*` |
| Carregando ação (cancelar) | Spinner no botão do diálogo; segundo toque ignorado | `P08-cancelando-*` |
| Vazio | n/a: só se chega aqui com motorista atribuído | — |
| Motorista cancelou | A tela volta à P07 com o aviso "O motorista cancelou. Estamos procurando outro." (o motorista some, A2) | ver P07 |
| Cancelamento com taxa | O diálogo mostra a taxa devolvida pelo servidor antes da confirmação [depende da decisão 15 e de o servidor informar a taxa **antes**; hoje o contrato só a devolve **depois** (`passenger/types.ts:85-89`)] | `P08-cancelar-taxa-*` |
| Erro ao cancelar | `409 invalid_transition` (a corrida já começou): o diálogo fecha e a tela segue para a P09 com o aviso "A corrida já começou." Rede: `InlineAlert` no diálogo | um por código |
| Posição atrasada | Sem posição nova há mais de 30 s: o carro fica parado e a linha de cima ganha "posição atualizada há {n} s" em `textMuted`. O ETA não é recalculado no aparelho | `P08-posicao-atrasada-*` |
| Sem rede | `NetworkBanner`; nada muda de estado; o carro congela; "Cancelar corrida" desabilitado com "Sem conexão" | `P08-sem-rede-*` |
| Texto longo | Nome de 20 caracteres (só o primeiro nome vem no contrato); "Volkswagen Polo Track · Cinza Platinum" em 2 linhas; placa nunca corta | `P08-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Painel sobe e rola por dentro; placa e ETA inteiros; o botão no pé | aparelho |
| Teclado | n/a | — |
| Permissão | n/a nesta tela (a posição do passageiro não é usada aqui) | — |
| Mock | Um selo embaixo do cartão: "corrida simulada" | sim |

## 6. Microinterações

- **Entrada (vindo da P07):** o pulso colapsa no pino e o cartão do motorista sobe de baixo, 250 ms; resposta tátil de sucesso
  (PP-8). É a notícia boa da jornada e tem de ser diferente das outras transições (`docs/movimento.md`).
- **Carro no mapa:** anda interpolado entre posições; a câmera acompanha sem recentrar enquanto a pessoa arrasta o mapa.
- **Chegou:** resposta tátil de aviso e a linha de cima troca com fade de 150 ms. Leitor de tela: "Seu motorista chegou. Placa
  {placa}".
- **Mudança de ETA:** o número troca com fade de 150 ms, sem dançar (`tabularNums`).
- **Para a P09:** o painel encolhe para o estado da viagem; o mapa troca a rota (carro → destino) desenhando em 500 ms.
- **Voltar do Android:** minimiza o app, como na P07. Cancelar exige o botão: cancelamento que pode ter taxa não nasce de um
  gesto acidental.

## 7. Copy

| Chave | Texto |
|---|---|
| Subfases | Motorista encontrado · Motorista a caminho · Seu motorista chegou |
| N2 | Chega em {n} min · Chega em menos de 1 min · Confira a placa {placa} |
| Espera | Aguardando você há {m:ss} |
| Código (plano D-12) | Seu código de embarque · Diga ao motorista antes de entrar no carro. |
| Faixa | Distância · {d} até você · Pagamento · {forma} |
| Botão | Cancelar corrida |
| Diálogo | Cancelar a corrida? · O motorista já está a caminho. *(+ "Será cobrada uma taxa de R$ {valor}." só se o servidor informar)* · Cancelar corrida · Manter corrida |
| Segurança (painel) | Segurança · Compartilhar viagem · Ligar 190 *(cada linha só existe se decidida: S4 e PP-11)* |
| Já começou | A corrida já começou. |
| Sem rede | Sem conexão. Tentando reconectar… |
| Selo | corrida simulada |

**Não usar:** "motorista verificado", "suporte 24h", "viagem segura" (promessas do `DESIGN_SYSTEM_MESTRE.md` §9).

## 8. Acessibilidade

- O cartão do motorista é lido como um grupo: "Carlos, Honda HB20 prata, placa Q W E 7 B 3 4, nota 4,9". A placa é lida
  caractere a caractere (`accessibilityLabel` com espaços).
- O N2 é região viva educada: muda de ETA sem interromper; "chegou" interrompe.
- O botão Segurança tem rótulo "Segurança: compartilhar viagem e emergência" e vem **antes** do cancelar na ordem de foco:
  quem navega por foco não precisa passar por uma ação destrutiva para chegar a ele.
- O mapa tem descrição: "Motorista a {d} do embarque".
- Alvos: botão de segurança e botões de contato (quando existirem) com 44×44.

## 9. Assets

Falta: o marcador de veículo do mapa (C-12; carro visto de cima, SVG, sem modelo reconhecível, `docs/direcao-de-arte.md`
§7.2). A foto do motorista vem do cadastro verificado (M03); sem ela, inicial.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Subfase | simulador | `PassengerRidePort.subscribe` (S4) | "corrida simulada" |
| Primeiro nome e placa | `mockDriverAssignment.ts` | `PassengerTripSnapshot.driver` (`passenger/types.ts:58-62`) | idem |
| Modelo e cor do veículo | mock | **não existe no contrato** (PP-12); o plano prevê "motorista, veículo" no `Trip` (`plano-sistema-arquitetura.md:615`) | idem |
| Nota do motorista | mock | não existe no contrato (PP-12) | idem |
| Foto | não | só a do cadastro verificado (M03, decisão 9) | — |
| ETA e posição | simulador | evento `location` do canal (`trip/types.ts:31-41`); ETA do servidor | idem |
| Código de embarque | não existe | plano D-12 | — |

## 11. Lacunas do protótipo

1. Sem mapa (A5): tela de cards num `AppShell scroll glow` (`a-caminho.tsx:62`).
2. Ligar, Mensagem e SOS com `onPress={() => {}}` (`SafetyActionsRow.tsx:29,38,47`), contra o G-19. Um SOS que não faz nada
   é pior que nenhum: sai até existir (PP-11).
3. Cancela no primeiro toque (`a-caminho.tsx:54-57`), sem diálogo nem taxa.
4. Destino com pino laranja (`a-caminho.tsx:71`).
5. Relógio amarelo no cartão de ETA (`a-caminho.tsx:87`) e ETA em `body` (`:129`): o N2 da tela vai para `heading`.
6. Margem de 2 pt fora da escala (`a-caminho.tsx:129`).
7. Título "Seu motorista" num `ScreenHeader` (`:64`) que não existe na prancha nem cabe sobre o mapa.
8. Selo na mesma faixa do título (`:65-67`).

## 12. Pedidos de componente

C-02, C-03, C-12 (com marcador de veículo e interpolação). `RideMapLayout` (P07). Contrato (PP-12, para Nova e Vega):
`TripDriverSummary` com `vehicle: { model, color }` e `rating?`.

## 13. Portão: itens próprios

- G-07b com o recorte "Corrida em andamento": mapa em cima (±10% de altura), cartão do motorista com placa em pastilha, faixa
  de dois números, botão vermelho de contorno no pé. Divergências permitidas: D-11, D-31, D-32.
- Zero bloco amarelo; a placa e o ETA nunca truncam em 320.
- Nenhum botão de contato ou de segurança sem ação (G-19).
- Com a rede cortada, a subfase não muda e o carro congela (G-18).
- Capturas: `passageiro/P08-{encontrado,a-caminho,chegou,carregando,cancelando,posicao-atrasada,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O `SafetyActionsRow` e o `DriverInfoCard` foram lidos; o `TripProgressBar` e o `rideSimulator` não. Não sei se o servidor vai
informar a taxa de cancelamento **antes** de cancelar (o contrato de hoje só devolve depois): se não, o diálogo não pode citar
valor.
