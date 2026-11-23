# M09 · Corrida em andamento (motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Estado `in_progress` de `/corrida` (`apps/driver/app/(app)/corrida.tsx`, ver M07 e PP-10) |
| Spec | `MOTORISTA.md`, M09: mapa e progresso, ações de segurança |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 1298, 14, 1528, 462 ("Corrida em Andamento") |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | **10** (navegação externa, D-20), **11** (contato), PP-10 e PP-11 (README), D-19, D-27, D-32, **D-35**; S4 (`complete`) |
| Ordem | Onda 4 |

## 1. Pergunta que a tela responde

"Para onde estou levando, quanto falta, e como encerro?" Sucesso: o motorista reabre a navegação com um toque e, ao chegar,
finaliza a corrida com confirmação.

## 2. Layout

Leitura da prancha: "‹ Corrida em andamento"; cartão com a passageira (foto, nome, nota, ligar e mensagem), embarque e
destino ligados por traço, e duas linhas "Tempo estimado 12 min" e "Distância 4,8 km"; "Navegar com GPS" amarelo com ícone de
seta; "Finalizar corrida" cinza com ícone de ✓.

```
390×844
┌──────────────────────────────┐
│    Corrida em andamento   ⋯   │  ScreenHeader center, sem seta (D-32); Mais opções
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  SurfaceRaised
│ │ (A)  Ana                  │ │  Avatar 48 com inicial; sem nota (D-19)
│ ├──────────────────────────┤ │
│ │ ● Embarque                │ │  textMuted (etapa já cumprida)
│ │   Av. Prudente de Morais  │ │
│ │ 📍 Destino                 │ │  map.destination
│ │   Shopping Midway Mall,   │ │  body semibold, até 2 linhas (N2)
│ │   Av. Bernardo Vieira · Tirol│
│ ├──────────────────────────┤ │
│ │ Tempo estimado     12 min │ │  linha rótulo × valor, valor body bold tabular
│ │ Distância          4,8 km │ │
│ └──────────────────────────┘ │
│ (selo: corrida de demonstração)│
│        ↕ espaço flexível      │
│ [ ➤ Navegar até o destino ] 56│  PrimaryButton (N1), abre o app externo
│ ↓ 12                          │
│ [ ✓  Finalizar corrida    ] 56│  SecondaryButton prominent → ConfirmDialog → M10
│ safe area                     │
└──────────────────────────────┘
```

- **Sem mapa, como na prancha** (D-35). O princípio 6 do padrão ("mapa é protagonista na corrida") cede aqui porque a
  navegação mora no app externo (decisão 10): um mapa no app duplicaria o Waze, custaria posição e bateria, e empurraria o
  "Finalizar" para baixo. Se o Atlas quiser o mapa, ele entra como faixa de 168 pt acima do cartão, igual à M05 online.
- **O embarque fica, desbotado** (já aconteceu): `textMuted`, sem endereço completo, só a rua. O destino é o N2.
- **Finalizar com confirmação**, não na M10 direto: um toque acidental encerraria a corrida e dispararia a cobrança.
- **Segurança e suporte** ficam no "⋯": "Ligar 190" (PP-11) e "Suporte" (M14). Não existe "Cancelar" nesta fase (o domínio
  não permite depois de `in_progress`).
- **320×568:** a linha da passageira se junta ao cabeçalho do cartão; tempo e distância numa linha só ("12 min · 4,8 km").

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Navegar até o destino" |
| N2 | Destino |
| N3 | Nome, tempo estimado, distância, embarque |
| N4 | "Finalizar corrida", "Mais opções" |
| N5 | Selo |

Amarelo: 1 bloco (Navegar). Sinais: nenhum. Os botões de contato da prancha (borda e ícone) e a estrela da nota saem.

**Por que "Finalizar" não é o N1:** na maior parte do tempo desta tela o motorista está dirigindo; o toque mais frequente ao
voltar ao app é reabrir a navegação. Finalizar acontece uma vez, no fim, e é a ação que **não** pode ser tocada sem querer.
A prancha decide igual.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell glow` + `FooterActions` (C-04) | — |
| Cartão | `SurfaceRaised` com divisores | `edgeBottom` |
| Linhas de valor | `View` rótulo × valor | `body`, valor bold `tabularNums` |
| Ações | `PrimaryButton` (ícone `Navigation` 20 em `ctaText`), `SecondaryButton` prominent (ícone `Check`) | — |
| Confirmação | `ConfirmDialog` (não destrutivo) | — |
| Abrir navegação | porta `openNavigation` (M07) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Como no layout | `M09-padrao-*` |
| Carregando | Ao reabrir o app: cartão em esqueleto | `M09-carregando-*` |
| Confirmar finalização | `ConfirmDialog`: "Finalizar a corrida?" · "Confirme a chegada ao destino." · Finalizar · Voltar | `M09-confirmar-*` |
| Longe do destino | Se a posição estiver a mais de 500 m do destino [confirmar], o diálogo acrescenta "Você está a {d} do destino." (não impede; o servidor decide) | `M09-confirmar-longe-*` |
| Carregando ação (finalizar) | Spinner no botão do diálogo; o estado muda só com a resposta (`complete`) | `M09-finalizando-*` |
| Finalizada | A tela vira a M10 | ver M10 |
| Erro ao finalizar | Rede: `InlineAlert` "Sem conexão. Tentando de novo…" com a mesma chave de idempotência; `409 invalid_transition`: relê o estado | um por código |
| Vazio | n/a | — |
| Sem rede | `NetworkBanner`; "Navegar" funciona; "Finalizar" desabilitado com "Sem conexão" (sem corrida duplicada nem finalização perdida: critério 5 da spec) | `M09-sem-rede-*` |
| Texto longo | Destino com nome do lugar e rua em 2 linhas | `M09-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Cartão rola; botões fixos | aparelho |
| Teclado | n/a | — |
| Permissão | Posição em segundo plano revogada no meio da corrida: `InlineAlert` warning "Sem a sua localização, o passageiro não acompanha a corrida." + "Abrir ajustes" | `M09-sem-permissao-*` |
| Mock | Um selo embaixo do cartão | sim |

## 6. Microinterações

- Entrada (vindo da M08): o bloco do código some, o destino ganha peso (fade de 200 ms); resposta tátil de sucesso já veio do
  "Iniciar".
- Tempo e distância trocam com fade de 150 ms.
- Ao voltar do app externo, a tela relê o estado do servidor.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Corrida em andamento |
| Rótulos | Embarque · Destino · Tempo estimado · Distância |
| N1 | Navegar até o destino *(a prancha diz "Navegar com GPS"; o rótulo diz para onde, e "GPS" sugere navegação no app)* |
| N4 | Finalizar corrida |
| Diálogo | Finalizar a corrida? · Confirme a chegada ao destino. · Finalizar · Voltar |
| Longe | Você está a {d} do destino. |
| Mais opções | Ligar 190 · Suporte |
| Selo | corrida de demonstração |

Na copy, "passageiro" é o papel (genérico); o nome da pessoa vem do dado. Nenhum texto escolhe gênero por ela.

## 8. Acessibilidade

- Título como cabeçalho; destino lido como "Destino: {lugar}, {rua}".
- "Navegar até o destino, abre o Waze".
- O diálogo prende o foco e começa no "Voltar" (ação segura).

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Destino exato | não existe | `DriverTripSnapshot.destination` (só o atribuído) | "corrida de demonstração" |
| Tempo e distância | não existe | Mapbox Directions a partir da posição (D1) | idem |
| Finalizar | não existe | `DriverTripPort.complete(tripId, {}, key)` | — |

## 11. Lacunas do protótipo

A tela não existe.

## 12. Pedidos de componente

Nenhum novo além dos da M07.

## 13. Portão: itens próprios

- G-07b com o recorte "Corrida em Andamento": cartão com passageira, embarque e destino, linhas de tempo e distância, botão
  amarelo de navegar e botão cinza de finalizar. Divergências permitidas: D-19, D-20, D-27, D-35.
- Finalizar exige dois toques (teste de interação).
- Nenhum botão de contato sem canal (G-19).
- Capturas: `motorista/M09-{padrao,carregando,confirmar,confirmar-longe,finalizando,sem-rede,sem-permissao,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O limiar de 500 m é proposta minha. Não sei se o servidor recusa finalizar longe do destino.
