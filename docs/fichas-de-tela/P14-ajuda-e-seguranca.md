# P14 · Ajuda e segurança

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | **Não existe.** Proposta: `/ajuda` · `apps/passenger/app/(app)/ajuda.tsx`. Entradas: menu ☰ da P03 (item "Ajuda", PP-9), Perfil (P13), "Ajuda com esta corrida" (P10 e comprovante da P11) |
| Spec | `PASSAGEIRO.md`, P14: central de ajuda, relatar problema, canal de suporte |
| Alvo visual | Sem recorte: herda o "Suporte" do motorista (`alvo_motorista_2026-11-22.png`, recorte 1336, 516, 1532, 926) |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | Canal: **decidido** (WhatsApp com atendimento humano em Natal, `docs/plano-apps-execucao.md:253-254`); **plano D-15** (horário de atendimento); **PP-11** (emergência 190); D-26; S4 (`sos`) e S6 (chamado no admin) para o que vem depois |
| Ordem | Onda 5 (só com o número oficial confirmado para o app) |

## 1. Pergunta que a tela responde

"Com quem eu falo, e o que faço numa emergência?" Sucesso: em um toque a pessoa abre uma conversa no WhatsApp com a corrida
já identificada, ou liga para o 190.

## 2. Layout

Leitura da prancha (Suporte do motorista): título centralizado, ícone de fone grande no centro, "Como podemos ajudar?", e
cartões-linha de 56 a 64 pt com ícone em pastilha, título, legenda e chevron.

```
390×844
┌──────────────────────────────┐
│ ‹            Ajuda            │  ScreenHeader center
│ ↓ 16                          │
│          ( 🎧 )               │  pastilha 56, ícone Headset 32 em textSecondary (D-30)
│    Como podemos ajudar?       │  title 22 bold, centro (N2)
│ ↓ 20                          │
│ ┌ Corrida em questão ───────┐ │  só quando veio de uma corrida (P10, P11)
│ │ Shopping Norte · 12 nov   │ │  small; SurfaceRaised; "Trocar" LinkButton
│ └──────────────────────────┘ │
│ ↓ 12                          │
│ [💬 Falar no WhatsApp       › ] │  ListRow 2 linhas: título + legenda
│ [   Atendimento por pessoas de Natal]│
│ [✉  Seus dados pessoais    › ] │  mailto: contato@ (LGPD)
│ ↓ 24                          │
│ Segurança                     │  SectionHeader (C-07)
│ [📞 Ligar 190               › ] │  PP-11; legenda "Polícia Militar, em emergência"
│                               │
└──────────────────────────────┘
```

**Quais linhas existem.** Mesma regra da P13 (PP-15): entra a linha que leva a algum lugar real.

| Linha da prancha do motorista | No passageiro | Por quê |
|---|---|---|
| Central de Ajuda · Dúvidas frequentes | **não**, até haver texto escrito | Uma central vazia é um botão de mentira (D-26). O conteúdo (10 a 15 perguntas) é tarefa minha com o dono, depois do S4 |
| Falar com o Suporte · Atendimento via chat | **sim**, como "Falar no WhatsApp" | Canal decidido; o chat dentro do app não existe |
| Reportar um problema | **sim**, dentro do WhatsApp | Até o S6 (chamado no admin), "relatar" é a mesma conversa, com a corrida no texto. Não ganha linha própria: seriam duas portas para o mesmo lugar |
| Solicitar reavaliação | não existe no passageiro | — |
| (novo) Seus dados pessoais | **sim** | O pedido do titular da LGPD tem canal decidido: `contato@vuumbora.com.br` (`docs/decisoes-do-dono.md:502-509`) |
| (novo) Ligar 190 | **depende da PP-11** | É o único recurso de emergência real sem backend |

- **A mensagem pré-preenchida do WhatsApp** leva o **código público da corrida** e a data, nunca nome, endereço ou telefone
  (o texto fica no aplicativo do WhatsApp, fora do nosso controle). Ex.: "Olá! Preciso de ajuda com a corrida VB-7K2Q de
  12/11." Sem corrida: "Olá! Preciso de ajuda com o app VuumBora."
- **Horário de atendimento:** só aparece quando o plano D-15 for decidido. Nunca "24h" (`DESIGN_SYSTEM_MESTRE.md` §9).
- **320×568:** a pastilha do ícone some; o título fica à esquerda, logo abaixo do cabeçalho.
- **430×932:** igual, até 480.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | nenhum como botão amarelo: a ação principal é a linha "Falar no WhatsApp", a primeira da lista |
| N2 | "Como podemos ajudar?" |
| N3 | Linhas de canal, corrida em questão |
| N4 | Voltar, "Trocar" a corrida |
| N5 | Legendas, rótulo de seção |

Amarelo: **0 blocos**. A prancha tem o fone e os ícones de linha em amarelo: seguem a D-30. O ícone do WhatsApp é marca de
terceiro e, se usado, fica na cor da marca dele (mesma regra do Pix, §8 do padrão); recomendo o `MessageCircle` do lucide, para
não depender do uso de marca.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` | — |
| Cabeçalho | `ScreenHeader align="center"` | — |
| Ícone | pastilha 56 + `Headset` 32 | `surfaceElevated`, `textSecondary` |
| Corrida em questão | `SurfaceRaised` + `LinkButton` | `small` |
| Linhas | `ListRow` com legenda (`valueLines`, C-08) | ícone 20 `textSecondary` |
| Seção | `SectionHeader` (C-07) | — |
| Abrir canal | `Linking.openURL` (`https://wa.me/…`, `mailto:`, `tel:190`) atrás de uma porta com versão web (regra do repositório para módulo nativo) | — |
| Aviso | `InlineAlert` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão (sem corrida) | Como no layout, sem o cartão "Corrida em questão" | `P14-padrao-*` |
| Com corrida | Cartão "Corrida em questão" no topo | `P14-com-corrida-*` |
| Carregando | n/a: a tela é estática; o código da corrida já vem de quem chamou | — |
| Carregando ação | O toque na linha abre o app externo; se demorar mais de 1 s, a linha mostra spinner no lugar do chevron | — |
| Vazio | n/a | — |
| Erro recuperável | n/a como erro de API: a tela não chama o servidor. As falhas possíveis são de abrir o app externo, nas duas linhas abaixo | — |
| WhatsApp não instalado | O `wa.me` abre no navegador (a página do WhatsApp oferece a versão web). Se nem isso abrir: `InlineAlert` com o número para copiar e "Copiar número" | `P14-sem-whatsapp-*` |
| Ligação indisponível | Aparelho sem telefonia (tablet): a linha "Ligar 190" diz "Este aparelho não faz ligações." e fica desabilitada | sim |
| Sem rede | `NetworkBanner`; o WhatsApp abre mesmo assim (o app dele lida com a falta de rede); "Ligar 190" funciona | `P14-sem-rede-*` |
| Texto longo | Legenda em 2 linhas; destino longo no cartão da corrida com reticências | `P14-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Linhas crescem; legenda em até 3 linhas | aparelho |
| Teclado / Permissão | n/a (`tel:` não pede permissão; abre o discador) | — |
| Mock | n/a: nada aqui é dado de demonstração. Se o número oficial do app ainda não estiver confirmado, a tela **não entra** (não existe "WhatsApp de demonstração") | — |

## 6. Microinterações

- Linhas: escala 0,97 (C-13). Sem animação de entrada.
- "Ligar 190": sem diálogo próprio; o discador do sistema já é a confirmação (a pessoa ainda precisa tocar em ligar).
- Ao voltar do WhatsApp para o app, a tela continua onde estava.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Ajuda |
| N2 | Como podemos ajudar? |
| Corrida | Corrida em questão · {destino curto} · {data} · Trocar |
| WhatsApp | Falar no WhatsApp · Atendimento por pessoas de Natal *(frase permitida só para o WhatsApp, decisão do site)* |
| Dados | Seus dados pessoais · Pedidos sobre os seus dados (LGPD) |
| Seção | Segurança |
| 190 | Ligar 190 · Polícia Militar, em emergência. |
| Sem WhatsApp | Não foi possível abrir o WhatsApp. Nosso número é {número}. · Copiar número |
| Sem telefonia | Este aparelho não faz ligações. |
| Mensagem pré-preenchida | Olá! Preciso de ajuda com a corrida {código} de {dd/mm}. · Olá! Preciso de ajuda com o app VuumBora. |

## 8. Acessibilidade

- Título como cabeçalho; "Segurança" como cabeçalho de seção.
- Cada linha diz para onde vai: "Falar no WhatsApp, abre o WhatsApp"; "Ligar 190, abre o discador".
- O cartão da corrida é lido como "Ajuda sobre a corrida para {destino}, {data}. Trocar corrida, botão".

## 9. Assets

Nenhum novo (`Headset`, `MessageCircle`, `Mail`, `Phone` do lucide).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Número do WhatsApp | não existe no app | configuração por ambiente; o mesmo do site (`docs/direcao-apresentar-a-marca.md:96`), **a confirmar com o dono para o app** | — |
| E-mail de contato | não existe no app | `contato@vuumbora.com.br` (decidido em 19/11) | — |
| Código da corrida | — | código público da corrida (S4); até lá, a tela abre sem o cartão | — |

## 11. Lacunas do protótipo

1. A tela não existe; "Ajuda e suporte" do perfil só abre aviso (`perfil.tsx:107-112`) e "Preciso de ajuda" da P10 não faz
   nada (`concluida.tsx:157-163`).
2. O menu ☰ da P03 não tem "Ajuda" (`HomeMenuSheet.tsx:15-21`, deixado de fora até a tela existir; certo).
3. O SOS da corrida é botão vazio (`SafetyActionsRow.tsx:44-50`): a emergência ganha lugar aqui e no painel de segurança da
   P08/P09.

## 12. Pedidos de componente

Nenhum novo. Porta de abertura de canal (`openSupportChannel`), com versão web, compartilhada com a M14.

## 13. Portão: itens próprios

- Nenhuma linha sem destino real (G-19).
- O texto pré-preenchido do WhatsApp não contém nome, endereço, e-mail nem telefone (teste unitário sobre a função que monta
  a URL).
- Nenhuma promessa de horário nem "24h" (G-26).
- G-07b com o recorte "Suporte" do motorista (estrutura, não conteúdo): ícone central, pergunta, cartões-linha.
- Capturas: `passageiro/P14-{padrao,com-corrida,sem-whatsapp,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não sei se o número do site atende também o app, nem se o atendimento está preparado para receber passageiro (o site hoje
fala com motorista candidato). O código público da corrida ainda não existe no contrato.
