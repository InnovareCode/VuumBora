# M12 · Histórico de corridas (motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Proposta: aba `/historico` · `apps/driver/app/(app)/historico.tsx` e `/historico-detalhe?id=` · `historico-detalhe.tsx` |
| Spec | `MOTORISTA.md`, M12: lista, valores, detalhes, suporte. Critério 4: histórico e métricas nunca usam dados de outros motoristas |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 708, 516, 906, 926 ("Histórico de Corridas") |
| Estado hoje | não existe; a aba "Histórico" do painel não faz nada (`apps/driver/app/(app)/index.tsx:68-73`) |
| Última nota | n/a |
| Depende de decisão | **7** (o que o valor por corrida é, D-23), **PP-14** (só bairros no histórico), **D-36**; contrato de histórico do motorista (não existe, S4) |
| Ordem | Onda 5 |

## 1. Pergunta que a tela responde

"Quais corridas eu fiz neste período, e quanto cada uma rendeu?" Sucesso: o motorista confere as corridas do dia ou da
semana, abre uma e, se houver problema, chega ao suporte com ela identificada.

## 2. Layout

Leitura da prancha: título centralizado; pílulas "Hoje / Semana / Mês / Todos"; linhas com o carro em pastilha, "Hoje, 10:12"
e "Lagoa Nova → Midway", valor à direita; um cabeçalho de grupo "Ontem" com seta; barra de 4 abas com "Histórico" ativa.

```
390×844
┌──────────────────────────────┐
│      Histórico de corridas    │  ScreenHeader center, **sem seta** (é aba, D-36)
│ ↓ 12                          │
│ ( Hoje )( Semana )( Mês )( Todos ) │  SegmentedControl (C-16)
│ ↓ 16                          │
│ Hoje · 3 corridas             │  SectionHeader do grupo (caption, textSecondary)
│ ┌──────────────────────────┐ │  cartão-linha 64 pt, SurfaceRaised
│ │[🚗] 10:12        R$ 18,90 │ │  VehicleIconBox 40, ícone textSecondary (D-30)
│ │     Lagoa Nova → Tirol    │ │  small textSecondary (bairros, PP-14)
│ └──────────────────────────┘ │  valor body bold tabular, textPrimary (D-36)
│ ↓ 8                           │
│ [🚗] 09:36  Petrópolis → Tirol  R$ 12,50 │
│ ↓ 16                          │
│ Ontem · 2 corridas            │
│ [🚗] 18:20  Capim Macio → Alecrim R$ 19,90│
│ (selo: corridas de exemplo)   │
├───────────────────────────────┤
│ 🏠Início 💳Ganhos 📋Histórico 👤Perfil │ BottomTabBar, "Histórico" ativa
└──────────────────────────────┘
```

- **Grupos por dia, abertos.** A prancha tem uma seta para recolher "Ontem": recolher esconde informação sem ganho numa
  lista que já rola. Cabeçalho simples, com a contagem.
- **Só bairros** (PP-14): durante a corrida o motorista viu o endereço exato; no histórico, guardado por meses no aparelho
  e na tela, o endereço de casa do passageiro não serve para nada ao motorista e é dado pessoal de outra pessoa. Bairro →
  bairro basta para reconhecer a corrida.
- **Total do período** no topo da lista? A prancha não tem, e o total é a tela de Ganhos (M11). Não repetir.
- **320×568:** controle segmentado com 4 pílulas em 280: se "Semana" cortar, os rótulos ficam "Hoje / 7 dias / Mês /
  Tudo" [medir antes]; a pastilha do carro some.
- **430×932:** igual, até 480.

### Detalhe

```
┌──────────────────────────────┐
│ ‹       Corrida de 12 nov     │  ScreenHeader center (aqui tem seta: não é aba)
│ ┌──────────────────────────┐ │
│ │      Ganho da corrida     │ │  rótulo por D-23
│ │        R$ 18,90           │ │  heading 28 bold tabular
│ │       (Concluída)         │ │  StatusBadge tingido
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ● Lagoa Nova              │ │  embarque (bairro)
│ │ 📍 Tirol                   │ │  destino (bairro)
│ ├──────────────────────────┤ │
│ │ 10:12 → 10:31 · 4,8 km    │ │
│ │ VuumBora                  │ │  categoria
│ └──────────────────────────┘ │
│ [!  Relatar um problema    › ] │  → M14 com a corrida
└──────────────────────────────┘
```

Corrida cancelada: o selo "Cancelada" e, se houve taxa a favor do motorista (decisão 15), a linha dela; sem taxa, "—".

## 3. Hierarquia

| Nível | Lista | Detalhe |
|---|---|---|
| N1 | nenhum | nenhum |
| N2 | o período escolhido | Ganho da corrida |
| N3 | Linhas (hora, bairros, valor) | bairros, horários, distância, categoria |
| N4 | Abas | Voltar, relatar |
| N5 | Cabeçalho de grupo, selo | selo |

Amarelo: o segmento ativo e a aba ativa (sinais e o "bloco" do controle, §18.1 item 3). A prancha tem o carro amarelo em
cada linha e o primeiro valor em amarelo: os dois saem (D-30, D-36).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` + `footer` com `BottomTabBar` | — |
| Navegação | grupo de abas de verdade do expo-router (`Tabs`) com a `BottomTabBar` como barra; hoje é `router.replace` com abas sem ação | — |
| Filtro | `SegmentedControl` (C-16) | — |
| Grupo | `SectionHeader` (C-07) | `caption` |
| Linha | componente local `DriverTripRow` sobre `SurfaceRaised` + `VehicleIconBox` 40 (C-11) + `PressableScale` | `tabularNums` no valor e na hora |
| Estado | `StatusBadge` tingido | — |
| Detalhe | `SurfaceRaised`, `MoneyText`, `ListRow` | — |
| Estados | `EmptyState`/`ErrorState` com ícone, `LoadingSkeleton` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Dois grupos de dias | `M12-padrao-*` |
| Carregando | Cabeçalho de grupo e 4 linhas em esqueleto, altura 64 | `M12-carregando-*` |
| Carregando mais | 2 linhas em esqueleto no fim | `M12-carregando-mais-*` |
| Carregando ação | n/a: trocar o período é carga, não ação; não há ação de servidor na lista nem no detalhe | — |
| Vazio (nunca dirigiu) | `EmptyState` com `Car`: "Nenhuma corrida ainda" · "Suas corridas aparecem aqui depois da primeira." · sem ação (ficar online é na aba Início) | `M12-vazio-*` |
| Vazio no período | "Nenhuma corrida hoje" · "Veja todas" (troca o filtro) | `M12-vazio-periodo-*` |
| Sem aprovação | Igual ao vazio, com a frase da M04: o cadastro de motorista ainda não abriu | `M12-sem-aprovacao-*` |
| Erro de carga | `ErrorState` "Não foi possível carregar suas corridas." · "Tentar de novo" | `M12-erro-*` |
| Sem rede | `NetworkBanner`; o que carregou fica | `M12-sem-rede-*` |
| Texto longo | "Parque das Nações → Cidade da Esperança" com reticências no fim; R$ 1.234,56 inteiro | `M12-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Linhas crescem; valor desce para baixo dos bairros | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Um selo embaixo do controle | sim |

## 6. Microinterações

As mesmas da P11: entrada escalonada só na primeira carga (30 ms, até 6 linhas); segmento desliza em 150 ms; puxar para
atualizar; toque com escala 0,97.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Histórico de corridas |
| Filtros | Hoje · Semana · Mês · Todos |
| Grupo | Hoje · Ontem · {dia da semana}, {d} {mês} · {n} corrida(s) |
| Linha | {hh:mm} · {bairro} → {bairro} · R$ {valor} |
| Detalhe | Corrida de {d} {mês} · Ganho da corrida *(D-23)* · Relatar um problema |
| Vazio | Nenhuma corrida ainda · Suas corridas aparecem aqui depois da primeira. · Nenhuma corrida hoje · Veja todas |
| Erro | Não foi possível carregar suas corridas. · Tentar de novo |
| Selo | corridas de exemplo |

## 8. Acessibilidade

- Cada linha é um botão lido como "10 e 12, de Lagoa Nova para Tirol, 18 reais e 90 centavos. Abre os detalhes".
- Cabeçalhos de grupo com papel de cabeçalho.
- Aba ativa com papel `tab` e `selected`.

## 9. Assets

`VehicleIconBox` (C-11).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Lista | não existe | **não há rota** no plano para o histórico do motorista (`plano-sistema-arquitetura.md:625-640` só tem ganhos agregados e repasses); pedido de contrato à Nova e à Vega: `GET /v1/driver/trips?cursor&from&to` com bairros, horários, distância, categoria e valor | "corridas de exemplo" |
| Valor por corrida | não existe | o mesmo campo da M10 (D-23) | idem |

## 11. Lacunas do protótipo

A tela não existe; a aba "Histórico" e a aba "Ganhos" do painel têm `onPress={() => {}}` (`apps/driver/app/(app)/index.tsx:67,72`;
`perfil.tsx:45,50`), contra o G-19.

## 12. Pedidos de componente

C-11 (tamanho 40), C-16 (já existe). Navegação por abas de verdade no app do motorista. Contrato do histórico (acima).

## 13. Portão: itens próprios

- G-07b com o recorte "Histórico de Corridas": título, 4 pílulas, linhas de altura igual com pastilha à esquerda e valor à
  direita, barra de 4 abas com a terceira ativa. Divergências permitidas: D-30, D-36, PP-14.
- Nenhum endereço com rua e número na lista nem no detalhe.
- O título **não** tem seta (é aba).
- Capturas: `motorista/M12-{padrao,carregando,carregando-mais,vazio,vazio-periodo,sem-aprovacao,erro,sem-rede,texto-longo}-*.png`
  e `motorista/M12-detalhe-{padrao,cancelada}-*.png`, nos 4 tamanhos.

## 14. Não conferido

A largura das 4 pílulas em 320 não foi medida. A aba "Ganhos" continua sem destino enquanto a M11 estiver bloqueada: decisão
do Atlas (README, pendências).
