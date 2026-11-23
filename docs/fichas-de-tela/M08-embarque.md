# M08 · Embarque (cheguei, aguardando e iniciar corrida)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Estado `driver_arrived` de `/corrida` (`apps/driver/app/(app)/corrida.tsx`, ver M07 e PP-10) |
| Spec | `MOTORISTA.md`, M08: confirmação de chegada/embarque. Critério 2: chegada, embarque, início e fim validados no servidor |
| Alvo visual | Metade de cima do recorte "Corrida em Andamento" (`alvo_motorista_2026-11-22.png`, 1298, 14, 1528, 462): cartão da passageira com embarque e destino. O pé é desta ficha |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | **plano D-12** (código de embarque), **15** (quanto esperar e o que acontece se o passageiro não aparecer), **11** (contato), PP-10 (README), D-19, D-27, D-32, **D-35**; S4 |
| Ordem | Onda 4 |

## 1. Pergunta que a tela responde

"Cheguei. Quem eu espero, há quanto tempo, e como começo a corrida?" Sucesso: o motorista confirma quem embarca (pelo nome e,
se decidido, pelo código) e inicia a corrida com um toque.

## 2. Layout

Segue a prancha "Corrida em Andamento" **sem mapa** (D-35): o motorista está parado no ponto, o mapa não acrescenta nada. Tela
de cartões sobre `AppShell glow`.

```
390×844
┌──────────────────────────────┐
│          Embarque        ⋯    │  ScreenHeader center; "Mais opções" no rightSlot
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  SurfaceRaised (cartão da passageira)
│ │ (A)  Ana                  │ │  Avatar 56 com inicial; subtitle bold
│ │      Aguardando há 2:14   │ │  caption tabular, textSecondary (N2 do estado)
│ ├──────────────────────────┤ │
│ │ ● Embarque                │ │  map.pickup
│ │   Av. Prudente de Morais, │ │  small, 2 linhas
│ │   1200 · Lagoa Nova       │ │
│ │ 📍 Destino                 │ │  map.destination
│ │   Shopping Midway Mall    │ │
│ └──────────────────────────┘ │
│ ↓ 12                          │
│ ┌ Código de embarque ───────┐ │  só se o plano D-12 = sim
│ │ [ _ ][ _ ][ _ ][ _ ]      │ │  CodeInput 4 dígitos
│ └──────────────────────────┘ │
│ (selo: corrida de demonstração)│
│        ↕ espaço flexível      │
│ [     Iniciar corrida     ] 56│  PrimaryButton (N1); desabilitado sem código, se houver
│ ↓ 12                          │
│ [ Passageiro não apareceu  ] 52│  SecondaryButton; só depois do tempo da decisão 15
│ safe area                     │
└──────────────────────────────┘
```

- **Sem nota nem número de viagens da passageira** (D-19, decidido: só o passageiro avalia) e **sem foto** (D-27). A prancha
  mostra "★ 4,9 (127 viagens)" e um rosto: os dois saem.
- **Ligar e mensagem** (os dois botões redondos da prancha): só com canal mascarado (decisão 11). É aqui que eles mais
  fazem falta ("estou na portaria"); o lugar deles no cartão fica reservado.
- **"Passageiro não apareceu"** cancela a corrida com o motivo `passenger_no_show` (de `driver_arrived` a corrida vai para
  `cancelled`, `trip-lifecycle.ts:20`). Só aparece depois do tempo mínimo de espera e só com a regra de taxa da decisão 15;
  sem decisão, a saída é o "Cancelar corrida" do "⋯", com motivo.
- **320×568:** destino em 1 linha; `CodeInput` com células de 48; botões com 52.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Iniciar corrida" |
| N2 | "Aguardando há {m:ss}" |
| N3 | Nome, embarque, destino, código |
| N4 | "Passageiro não apareceu", "Mais opções" |
| N5 | Rótulos, selo |

Amarelo: 1 bloco (Iniciar). Sinais: o foco do `CodeInput` (borda amarela de campo focado, permitida).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell glow` + `FooterActions` (C-04) | — |
| Cartão | `SurfaceRaised` com divisor `edgeBottom` | `radius.lg`, padding 16 |
| Código | `CodeInput` (`packages/ui`, hoje com 6 dígitos; precisa aceitar 4) | `inputHeight` |
| Ações | `PrimaryButton`, `SecondaryButton` | — |
| Mais opções | o mesmo painel da M07 (Cancelar corrida, Suporte) | — |
| Tempo | `useSecondsUntil`/`formatWait` invertidos (tempo desde a chegada) ou contagem própria a partir do instante do servidor | `tabularNums` |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão (`driver_arrived`) | Como no layout, sem código | `M08-padrao-*` |
| Com código (plano D-12) | Bloco do código; Iniciar desabilitado até 4 dígitos | `M08-codigo-*` |
| Carregando | Ao reabrir o app: cartão em esqueleto com a forma final | `M08-carregando-*` |
| Carregando ação (iniciar) | Spinner no Iniciar; o estado muda só com a resposta (`start`) | `M08-iniciando-*` |
| Código errado (`400 validation`) | Erro no campo: "Código incorreto. Confira com o passageiro."; o campo limpa e recebe o foco | `M08-codigo-errado-*` |
| Muitas tentativas (`429 rate_limited`) | `InlineAlert`: "Muitas tentativas. Fale com o suporte." + link para a M14; Iniciar desabilitado | `M08-bloqueado-*` |
| Espera longa | Depois do tempo da decisão 15, "Passageiro não apareceu" aparece; antes disso, não | `M08-espera-longa-*` |
| Passageiro cancelou | Aviso "O passageiro cancelou a corrida." + "Voltar ao painel" | `M08-passageiro-cancelou-*` |
| Erro de transição (`409 invalid_transition`) | Relê o estado e segue para onde o servidor disser | — |
| Vazio | n/a | — |
| Sem rede | `NetworkBanner`; Iniciar desabilitado com "Sem conexão"; o tempo continua | `M08-sem-rede-*` |
| Texto longo | Endereço com complemento em 2 linhas; nome de 20 caracteres | `M08-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Cartão rola; botões fixos no rodapé | aparelho |
| Teclado aberto | Com código: o campo e o "Iniciar" visíveis (G-15) | aparelho |
| Permissão | n/a (herdada da M07) | — |
| Mock | Um selo embaixo do cartão | sim |

## 6. Microinterações

- Entrada (vindo da M07): o mapa desbota e os cartões sobem (300 ms); resposta tátil leve.
- Código completo: o Iniciar habilita com a transição padrão; **não** envia sozinho (o motorista confirma).
- Iniciar aceito: resposta tátil de sucesso; a tela vira a M09.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Embarque |
| N2 | Aguardando há {m:ss} |
| Rótulos | Embarque · Destino · Código de embarque |
| Código | Peça o código ao passageiro. · Código incorreto. Confira com o passageiro. · Muitas tentativas. Fale com o suporte. |
| N1 | Iniciar corrida |
| N4 | Passageiro não apareceu *(só com a decisão 15)* |
| Cancelou | O passageiro cancelou a corrida. · Voltar ao painel |
| Selo | corrida de demonstração |

## 8. Acessibilidade

- Título como cabeçalho; o tempo de espera é região viva só a cada minuto (não a cada segundo).
- O cartão é lido como "Ana. Embarque {endereço}. Destino {lugar}".
- `CodeInput` com rótulo "Código de embarque, 4 dígitos".

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Nome, embarque e destino exatos | não existe | `DriverTripSnapshot` (A3/B4) | "corrida de demonstração" |
| Instante da chegada | não existe | evento `status` com `sentAt` | — |
| Início | não existe | `DriverTripPort.start(tripId, { pickupCode? }, key)` | — |

## 11. Lacunas do protótipo

A tela não existe.

## 12. Pedidos de componente

`CodeInput` com número de células configurável (hoje 6, para o código do e-mail). C-04.

## 13. Portão: itens próprios

- G-07b com a metade de cima do recorte "Corrida em Andamento": cartão da passageira com embarque e destino ligados.
  Divergências permitidas: D-19, D-27, D-35.
- Nenhuma nota, número de viagens ou foto da passageira na tela.
- Exatamente 1 bloco amarelo.
- Capturas: `motorista/M08-{padrao,codigo,carregando,iniciando,codigo-errado,bloqueado,espera-longa,passageiro-cancelou,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não conferi se o `CodeInput` aceita outro número de células sem mudança. O tempo mínimo de espera não existe em nenhum
documento.
