# M04 · Análise cadastral

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Proposta: estado do cartão de status da M05, mais `apps/driver/app/(app)/cadastro/analise.tsx` para o detalhe |
| Spec | `MOTORISTA.md`, M04: pendente, aprovado, reprovado, solicitação de correção |
| Alvo visual | **Sem recorte.** Herda o cartão "Você está Offline" do "Dashboard Inicial" (807, 14, 1037, 462) e os selos de estado de "Documentos" |
| Estado hoje | não existe; o `RegistrationNotice` da M05 ocupa o lugar ("o cadastro é outra etapa") |
| Última nota | n/a |
| Depende de decisão | **9**, gate público, S2 (mesmas da M03) |
| Ordem | **Bloqueada**, junto com a M03 |

## 1. Pergunta que a tela responde

"Já posso dirigir? Se não, por quê e o que faço?"

## 2. Layout

Não é uma tela de rota própria no dia a dia: é o **cartão de status** no topo da M05, que troca o "Ficar online" por uma
destas 5 versões. O toque no cartão abre o detalhe.

| Estado do servidor | Cartão na M05 | Ação |
|---|---|---|
| `not_started` (conta sem cadastro) | "Cadastro de motorista ainda não aberto" + o fato público (hoje, o `RegistrationNotice`) | nenhuma, até o gate abrir |
| `pending_documents` | "Faltam {n} documentos" | "Enviar documentos" (M03) |
| `under_review` | "Em análise" + prazo **só se a decisão 9 fixar um** | "Ver documentos" |
| `changes_requested` | "Precisamos de uma correção" + motivo resumido | "Corrigir agora" |
| `rejected` | "Cadastro não aprovado" + motivo + canal de contato | "Falar com o suporte" (WhatsApp) |
| `approved` | some; entra o cartão "Você está offline · Ficar online" | — |

Cartão: `SurfaceRaised`, ícone 24 em pastilha, título `subtitle`, frase `small`, ação como `SecondaryButton` (o CTA amarelo
"Ficar online" só existe no `approved`).

## 3 a 13

Seguem a M03 e a M05. Estados de rede, erro e carregamento são os do painel (M05). Copy dos motivos de reprovação e correção:
**com a decisão 9**, porque o texto de recusa tem implicação jurídica (critério, contestação).

## 14. Não conferido

Os nomes dos estados (`not_started` …) são proposta minha, não o contrato da Vega (o S2 ainda não existe).
