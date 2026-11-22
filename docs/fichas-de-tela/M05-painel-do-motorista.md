# M05 · Painel do motorista (dashboard)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | `/` · `apps/driver/app/(app)/index.tsx` + `apps/driver/src/components/home/*` |
| Spec | `MOTORISTA.md`, M05: status online/offline, mapa, ganhos, corridas, avisos. Regra: não permitir online antes de cadastro e documentação aprovados |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 807, 14, 1037, 462 ("Dashboard Inicial"); detalhe em `referencias/premium/motorista-home-alvo.webp` |
| Estado hoje | UI com mock; logout real |
| Última nota | 4 (18/11, retrato das 16h03). M1, M5, M7, M8 e M11 seguem abertos no código; M2 mudou de 430 para 360 sem medição |
| Depende de decisão | PP-4 (a oferta sai daqui), PP-5 (começa offline, aprovação do servidor), D-16, D-17 (taxa de aceitação), D-18 (dinâmica); 7 (valores) |
| Ordem | Onda 2 (reorganização) e Onda 4 (dados reais, com o D4) |

## 1. Pergunta que a tela responde

"Estou trabalhando agora, e como foi o meu dia?" Sucesso: em 1 toque o motorista fica online (quando pode) e vê o total do dia
sem rolar.

## 2. Layout

Leitura da prancha: saudação com avatar à esquerda ("Olá, Carlos! / Pronto para dirigir?"); o **cartão de status** em
largura total ("Você está **Offline**" + chave à direita) com o CTA **"▶ Ficar Online"** dentro dele; **4 cartões de métrica em
2×2** (ícone em cima, rótulo, valor); e a barra de 4 abas (Início, Ganhos, Histórico, Perfil). **Não tem** mapa, banner, oferta,
atalhos nem "Sair".

```
390×844
┌──────────────────────────────┐
│ (C) Olá, {nome}!          🔔 │  DriverHeader/DriverProfileRow; Avatar com inicial
│     Pronto para dirigir?      │  small, textSecondary
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  cartão de status, SurfaceRaised
│ │ Você está                │ │  small, textSecondary
│ │ Offline            (○—) │ │  title bold + chave (OnlineToggle)
│ │ [   ▶ Ficar online   ]56│ │  PrimaryButton (o único amarelo)
│ └──────────────────────────┘ │
│ ↓ 12                          │
│ ┌───────────┐ ┌───────────┐  │  MetricCard 2×2, vão 8
│ │💳 Ganhos  │ │🚗 Corridas│  │  ícone 20 textSecondary
│ │   hoje    │ │   hoje    │  │
│ │ R$ 0,00   │ │ 0         │  │  subtitle bold tabular
│ └───────────┘ └───────────┘  │
│ ┌───────────┐ ┌───────────┐  │
│ │★ Avaliação│ │⏱ Tempo    │  │  (D-17: no lugar de "Taxa de aceitação")
│ │  —        │ │  online   │  │
│ └───────────┘ └───────────┘  │
│ (selo: dados de exemplo)      │  um só, embaixo da grade
│                               │
├───────────────────────────────┤
│ 🏠Início 💳Ganhos 📋Histórico 👤Perfil │ BottomTabBar, 68 pt + safe area
└──────────────────────────────┘
```

**Online:** o cartão de status vira "Você está **Online** · Procurando corridas" com a chave ligada e o botão "Ficar offline"
(`SecondaryButton`). Abaixo do cartão entra uma **faixa de mapa** de 168 a 200 pt com a posição (o mapa só faz sentido online),
e a grade desce. A oferta chega como **tela cheia** (M06), não como cartão aqui.

**Sem aprovação** (o caso de **todos** hoje): o cartão de status é o da M04 (`not_started`), sem chave e sem CTA amarelo; as
métricas aparecem com "—" e o selo.

- **320×568:** grade 2×2 com rótulo em 2 linhas e valor em 1; o valor em dinheiro **não pode truncar** (auditoria M2): usar
  `subtitle` e cair para `body` bold só se medir corte.
- **430×932:** 2×2 continua (4 em linha só se os 4 valores couberem medidos; a auditoria mediu corte em 430 com 4 em linha).

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Ficar online" |
| N2 | Estado "Offline/Online" |
| N3 | Ganhos de hoje, corridas, avaliação, tempo online |
| N4 | Abas, notificações |
| N5 | "Pronto para dirigir?", selo |

Amarelo: 1 bloco ("Ficar online"); sinais: aba ativa, estrela da avaliação. Hoje são 6 blocos amarelos (auditoria): banner
"Alta demanda" em `gradient.cta` (`HighDemandBanner.tsx:7-8`), selo "Nova corrida" cheio (`NewRideOfferCard.tsx:146-147`),
ícones amarelos de atalho (`index.tsx:28-30`) e de métrica (`DailySummarySection.tsx:40` (carteira; a estrela da `:59` pode ficar amarela, por semântica)).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` (hoje sem, `index.tsx:88`) + `footer` com `BottomTabBar` | `gradient.screen`, `tabBarSurface`, `elevation.3` |
| Saudação | `DriverHeader` + `DriverProfileRow` (fundir) + `Avatar` | — |
| Status | `OnlineToggle` (`apps/driver/src/components/home/OnlineToggle.tsx`, já tem `approved` e `disabled`, `:35-52`) dentro de um cartão com o `PrimaryButton` | chave desligada em `borderControl` (não branca, `docs/direcao-de-arte.md` §3.1) |
| Métricas | `DailySummarySection` + `MetricCard` (`packages/ui/src/MetricCard.tsx`, já com `SurfaceRaised`, `:41`) | ícone `textSecondary`; valor `tabularNums` |
| Mapa (online) | `DriverMapPreview` → `MapView` (C-12) | sem `glow` sobre ele |
| Bloqueio | cartão M04 | `InlineAlert` info |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão sem aprovação | cartão M04, métricas "—" | `M05-sem-aprovacao-*` |
| Offline aprovado | como no layout | `M05-offline-*` |
| Online | cartão online + mapa | `M05-online-*` |
| Carregando | cartão de status e grade em esqueleto; nunca mostrar "Offline" antes de saber | sim |
| Carregando ação ("Ficar online") | spinner no CTA; a chave só muda **depois** da confirmação do servidor (sem otimismo, `MOTORISTA.md`) | sim |
| Vazio (dia sem corrida) | métricas com "R$ 0,00" e "0" (zero é zero) | sim |
| Erro ao ficar online | `InlineAlert` no cartão com o motivo do servidor (documento vencido, fora da área, sem rede) | um por motivo |
| Sem rede | `NetworkBanner`; online continua online no servidor até ele decidir; "Ficar online" desabilitado | sim |
| Texto longo | nome de 30 caracteres; ganhos de R$ 1.234,56 sem cortar | sim |
| 320×568 / 430×932 | ver layout | sim |
| Fonte 200% | grade vira 1 coluna; CTA inteiro | aparelho |
| Teclado | n/a | — |
| Permissão (localização) | ao tocar "Ficar online" sem permissão: `PermissionPrompt` (C-06) com o motivo (segundo plano tem consentimento próprio, `MOTORISTA.md`) | sim |
| Mock | um selo embaixo da grade | sim |

## 6. Microinterações

- "Ficar online": a chave desliza, o fundo do cartão muda e o texto troca **em sequência**, nunca tudo junto (`docs/movimento.md`);
  resposta tátil leve quando o servidor confirma.
- O mapa entra com fade de 200 ms ao ficar online.
- Sem animação de entrada da tela.

## 7. Copy

| Chave | Texto |
|---|---|
| Saudação | Olá, {primeiro nome}! · Pronto para dirigir? |
| Status | Você está · **Offline** / **Online** |
| Online, apoio | Procurando corridas perto de você |
| CTA | Ficar online · (online) Ficar offline |
| Métricas | Ganhos hoje · Corridas hoje · Avaliação · Tempo online |
| Sem aprovação | **Você entrou com uma conta de motorista.** O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas. (`RegistrationNotice.tsx`) |
| Erro | Não foi possível ficar online: {motivo do servidor}. |
| Selo | dados de exemplo |

## 8. Acessibilidade

- O cartão de status é lido como "Você está offline. Ficar online, botão".
- A chave tem papel `switch` com `checked` e `disabled` (`OnlineToggle.tsx:49-50`, já está).
- A mudança de estado é anunciada ("Você está online").
- As abas têm papel `tab` e estado `selected`.

## 9. Assets

Nenhum novo. O `driverDemoAvatarSource` (`index.tsx:95`) sai: avatar com inicial (D-27).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Nome | "Carlos Santos" fixo (`index.tsx:95`) | `me()` | não, quando real |
| Aprovação | `true` fixo (`index.tsx:54`) | `GET /v1/driver/verification` (S2) | — (nunca fingir) |
| Online | `useState(true)` (`index.tsx:48`) | servidor (D4) | — |
| Métricas | fixas (`index.tsx:100`) | API (D4/D6) | sim |
| Cidade | "São Paulo - SP" (`index.tsx:97`) | posição real | — |

## 11. Lacunas do protótipo

1. Começa online e aprovado, contradizendo o próprio aviso (`index.tsx:48,54,94`; PP-5).
2. Oferta embutida, com nome do passageiro e "Dinâmica +20%" (`index.tsx:102-112`; PP-4, D-18).
3. Banner "Alta demanda" amarelo (`HighDemandBanner.tsx:7-8`; M1), selo "Nova corrida" amarelo cheio (`NewRideOfferCard.tsx:146-147`; M5).
4. Ícones amarelos de atalho e métrica (`index.tsx:28-30`; `DailySummarySection.tsx:40` (carteira; a estrela da `:59` pode ficar amarela, por semântica); M7).
5. Sem brilho de topo (`index.tsx:88`; M8).
6. Abas sem ação (`index.tsx:73-84`) e 5 abas onde a prancha tem 4 ("Corridas" e "Métricas" a mais).
7. "Taxa de aceitação" (`index.tsx:100`; D-17).
8. "Sair da conta" como andaime no painel (`index.tsx:116-124`): vai para a M13.
9. Grade com 4 colunas a partir de 360 (`DailySummarySection.tsx:33`), quando a auditoria mediu corte até 430.

## 12. Pedidos de componente

C-06, C-12, C-01, C-13; o cartão de status (local, `DriverStatusCard`) que junta `OnlineToggle`, CTA e os estados da M04.

## 13. Portão: itens próprios

- G-07b com o recorte "Dashboard Inicial": saudação → cartão de status com CTA → grade 2×2 → barra de 4 abas.
- Exatamente 1 bloco amarelo.
- Nenhum valor em dinheiro truncado em 320, 360, 390 e 430.
- A chave não muda antes da resposta do servidor (teste de interação com o adaptador atrasado).
- Capturas: `motorista/M05-{sem-aprovacao,offline,online,carregando,erro-online,sem-rede,sem-permissao}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

O retrato da auditoria é das 16h03 de 18/11 e o código mudou depois; não li `DriverHeader`, `DriverProfileRow`,
`DriverMapPreview` e `QuickActionsRow` linha a linha.
