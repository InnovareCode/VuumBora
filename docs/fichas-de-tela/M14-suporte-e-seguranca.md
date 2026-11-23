# M14 · Suporte e segurança (motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Proposta: `/suporte` · `apps/driver/app/(app)/suporte.tsx`. Entradas: M13 ("Ajuda e suporte"), "Mais opções" da M07 a M09, "Relatar um problema" da M10 e do detalhe da M12 |
| Spec | `MOTORISTA.md`, M14: ajuda, contato, comunicação de ocorrência |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 1336, 516, 1532, 926 ("Suporte") |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | Canal: **decidido** (WhatsApp com atendimento humano em Natal, `docs/plano-apps-execucao.md:253-254`); **plano D-15** (horário); **PP-11** (190); **D-26** (sem "Solicitar reavaliação": o processo não existe); S6 (chamado no admin) |
| Ordem | Onda 5 (com o número oficial confirmado para o app) |

## 1. Pergunta que a tela responde

"Com quem eu falo quando algo dá errado, inclusive no meio de uma corrida?" Sucesso: em um toque o motorista abre o WhatsApp
com a corrida identificada, ou liga para o 190.

## 2. Layout

Leitura da prancha: título centralizado com seta; fone grande amarelo; "Como podemos ajudar?"; 4 cartões-linha com ícone
amarelo em pastilha, título e legenda: Central de Ajuda, Falar com o Suporte (via chat), Reportar um problema, Solicitar
reavaliação.

```
390×844
┌──────────────────────────────┐
│ ‹            Suporte          │  ScreenHeader center (não é aba: tem seta)
│ ↓ 16                          │
│          ( 🎧 )               │  pastilha 56, Headset 32 textSecondary (D-30)
│    Como podemos ajudar?       │  title 22 bold, centro (N2)
│ ↓ 20                          │
│ ┌ Corrida em questão ───────┐ │  só quando veio de uma corrida
│ │ Lagoa Nova → Tirol · hoje │ │  bairros, como no histórico (PP-14)
│ └──────────────────────────┘ │
│ ↓ 12                          │
│ [💬 Falar no WhatsApp       › ] │  ListRow 2 linhas
│ [   Atendimento por pessoas de Natal]│
│ [✉  Seus dados pessoais    › ] │  mailto: contato@ (LGPD)
│ ↓ 24                          │
│ Segurança                     │  SectionHeader
│ [📞 Ligar 190               › ] │  PP-11
└──────────────────────────────┘
```

É a mesma tela da P14 do passageiro, com três diferenças: a seta (não é aba), o cartão da corrida em bairros, e o texto da
mensagem pré-preenchida (identifica a conta como motorista). **Uma porta só** (`openSupportChannel`) para os dois apps.

| Linha da prancha | Decisão |
|---|---|
| Central de Ajuda · Dúvidas frequentes | Não entra até haver texto escrito (D-26). As dúvidas do motorista são outras (cadastro, taxa, repasse) e dependem de regras ainda não publicadas: escrever antes seria prometer |
| Falar com o Suporte · Atendimento via chat | Entra como "Falar no WhatsApp" (decidido); o chat no app não existe |
| Reportar um problema | Dentro do WhatsApp, com a corrida na mensagem, até o S6. Não ganha linha própria |
| Solicitar reavaliação · De corrida ou avaliação | **Não entra** (D-26): pressupõe um processo de contestação que não existe. Pedido de contestação chega pelo WhatsApp como qualquer outro |

- **Mensagem pré-preenchida:** código público da corrida e data, nunca dados do passageiro. Ex.: "Olá! Sou motorista e
  preciso de ajuda com a corrida VB-7K2Q de 12/11."
- **No meio da corrida** (vindo do "⋯" da M07 a M09), a seção "Segurança" sobe para o topo da lista: numa ocorrência, o 190
  vem antes da conversa.
- **320×568 / 430×932:** como na P14.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | nenhum botão amarelo; a primeira linha é a ação principal |
| N2 | "Como podemos ajudar?" |
| N3 | Linhas, corrida em questão |
| N4 | Voltar |
| N5 | Legendas |

Amarelo: **0 blocos**. O fone e os ícones de linha amarelos da prancha seguem a D-30.

## 4. Componentes e tokens

Os mesmos da P14: `AppShell scroll glow`, `ScreenHeader align="center"`, pastilha 56, `SurfaceRaised` para a corrida,
`ListRow` com legenda, `SectionHeader`, porta `openSupportChannel` com versão web.

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Sem corrida | `M14-padrao-*` |
| Com corrida | Cartão da corrida no topo | `M14-com-corrida-*` |
| Durante a corrida | "Segurança" no topo, depois o WhatsApp | `M14-em-corrida-*` |
| Carregando | n/a: a tela é estática; a corrida já vem de quem chamou | — |
| Carregando ação | Spinner no lugar do chevron se o app externo demorar mais de 1 s | — |
| Vazio | n/a | — |
| Erro recuperável | n/a como erro de API (a tela não chama o servidor); as falhas são de abrir o app externo, abaixo | — |
| WhatsApp não instalado | Igual à P14 | `M14-sem-whatsapp-*` |
| Ligação indisponível | Igual à P14 | sim |
| Sem rede | Igual à P14 | `M14-sem-rede-*` |
| Texto longo | Bairros longos com reticências no cartão | `M14-texto-longo-*` |
| 320×568 / 430×932 | Ver P14 | sim |
| Fonte 200% | Linhas crescem; legenda em até 3 linhas | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | n/a: a tela não entra com número de demonstração | — |

## 6. Microinterações

Iguais à P14.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Suporte |
| N2 | Como podemos ajudar? |
| Corrida | Corrida em questão · {bairro} → {bairro} · {data} · Trocar |
| WhatsApp | Falar no WhatsApp · Atendimento por pessoas de Natal |
| Dados | Seus dados pessoais · Pedidos sobre os seus dados (LGPD) |
| Seção | Segurança |
| 190 | Ligar 190 · Polícia Militar, em emergência. |
| Mensagem | Olá! Sou motorista e preciso de ajuda com a corrida {código} de {dd/mm}. · Olá! Sou motorista e preciso de ajuda com o app VuumBora. |

**Não usar:** "Suporte 24h", "Atendimento via chat", "Solicitar reavaliação", "resposta em até X horas".

## 8. Acessibilidade

Igual à P14.

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

Iguais à P14 (número do WhatsApp por configuração, a confirmar com o dono para o app do motorista; e-mail decidido; código
público da corrida do S4).

## 11. Lacunas do protótipo

A tela não existe. Os atalhos "Suporte" que existiam na M05 saíram na onda 2 (`apps/driver/app/(app)/index.tsx:23-26`).

## 12. Pedidos de componente

A mesma porta `openSupportChannel` da P14.

## 13. Portão: itens próprios

- G-07b com o recorte "Suporte": ícone central, pergunta, cartões-linha com título e legenda. Divergências permitidas: D-26,
  D-30.
- Nenhuma linha sem destino; nada de "reavaliação" (G-19, D-26).
- A mensagem pré-preenchida não contém dado do passageiro (teste unitário).
- Capturas: `motorista/M14-{padrao,com-corrida,em-corrida,sem-whatsapp,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não sei se o atendimento do WhatsApp vai separar motorista de passageiro (mesma fila ou não). Isso muda só o texto da
mensagem pré-preenchida.
