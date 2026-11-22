# M03 · Veículo e documentos (cadastro de motorista, etapa 2)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | **Não existe.** Proposta: `apps/driver/app/(app)/cadastro/{index,veiculo,documento}.tsx` |
| Spec | `MOTORISTA.md`, M03: CNH, documento do carro, demais exigências conforme operação |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 918, 516, 1116, 926 ("Documentos") |
| Estado hoje | não existe |
| Última nota | n/a |
| Depende de decisão | **9** (quem analisa, prazo, critério), lista de documentos da STTU, **gate público** (taxa e repasse publicados), S2 no backend (`docs/plano-apps-execucao.md:261-266`; `docs/plano-mestre.md`, M3) |
| Ordem | **Bloqueada.** Esta ficha define o visual para não improvisar depois; **não construir a lista de documentos antes da decisão 9** |

## 1. Pergunta que a tela responde

"O que falta enviar para eu poder dirigir, e em que pé está cada coisa?" Sucesso: o motorista sabe, sem ler um manual, qual é o
próximo documento e como mandar.

## 2. Layout

Leitura da prancha: "Meus Documentos" centralizado; uma lista de cartões de 56 a 64 pt, cada um com o ícone do documento em
pastilha, o nome com a exigência entre parênteses, o estado com ícone + texto ("✓ Aprovado") e o chevron. A mesma tela serve
à M03 (enviar) e à M13 (manter): o que muda é o estado de cada cartão.

```
390×844
┌──────────────────────────────┐
│ ‹       Meus documentos       │  ScreenHeader centralizado (C-17)
│ ↓ 12                          │
│ Faltam 2 de 4                 │  subtitle + barra de progresso (6 pt)
│ ▓▓▓▓▓▓▓▓░░░░░░░░              │
│ ↓ 16                          │
│ [🪪 CNH (obrigatório)       ›]│  DocumentStatusCard (C-15)
│ [   ✓ Aprovado              ] │  estado: success tingido
│ [🚗 Documento do veículo    ›]│
│ [   ◷ Em análise            ] │  info
│ [🛡 Comprovante de seguro   ›]│
│ [   ↑ Enviar                ] │  ação (amarelo só no texto do link)
│ [🔍 Vistoria do veículo     ›]│
│ [   ! Correção pedida       ] │  warning, com o motivo na tela do documento
│                               │
│ [  Enviar próximo documento ] │  PrimaryButton (some quando nada falta)
└──────────────────────────────┘
```

**Tela do documento** (filha): foto ou PDF com moldura de enquadramento, instrução em 2 linhas, "Tirar foto" (CTA) e "Escolher
arquivo" (secundário), barra de envio, e, se houve correção, o motivo num `InlineAlert` warning no topo.

## 3. Hierarquia

N1 "Enviar próximo documento"; N2 "Faltam 2 de 4"; N3 os cartões; N4 voltar; N5 legendas. Amarelo: 1 bloco (CTA) e a barra
de progresso. **Ícones dos cartões em `textSecondary`** (a prancha usa amarelo: D-30).

## 4. Componentes e tokens

`AppShell scroll glow`, `ScreenHeader` (C-17), `DocumentStatusCard` (C-15, local do app), `StatusBadge`
(`packages/ui/src/StatusBadge.tsx`, variantes já tingidas), `PrimaryButton`, `SecondaryButton`, `InlineAlert`,
`PermissionPrompt` (C-06, câmera), `LoadingSkeleton`.

## 5. Estados

| Estado | Como aparece |
|---|---|
| Padrão | lista com estados misturados |
| Carregando | 4 cartões em esqueleto |
| Carregando ação | barra de envio no cartão; o resto da tela utilizável |
| Vazio | n/a: a lista vem da regra (decisão 9) |
| Erro de envio | no cartão: "Não foi possível enviar." + "Tentar de novo"; o arquivo não se perde |
| Sem rede | `NetworkBanner`; envio fica na fila só se a Vega garantir isso; senão, desabilitado com o motivo |
| Documento vencido | estado danger tingido "Vencido em 12/03/2027"; impede ficar online (critério do M3 no plano mestre) |
| Texto longo | nome de documento em 2 linhas |
| 320×568 / 430×932 | lista inteira legível; CTA no rodapé |
| Fonte 200% | estado embaixo do nome, nunca ao lado |
| Permissão negada (câmera) | "Para fotografar o documento, permita a câmera." + "Escolher arquivo" como alternativa |
| Mock | nenhum: esta tela **não** entra com dado de exemplo (documento é dado sensível e o estado "Aprovado" é promessa) |

## 6. Microinterações

Barra de envio linear; ao aprovar (vindo do servidor), o selo troca com fade. Nada de confete.

## 7. Copy

Título "Meus documentos"; "Faltam {n} de {total}"; estados "Aprovado", "Em análise", "Enviar", "Correção pedida", "Vencido em
{data}"; CTA "Enviar próximo documento". **Os nomes dos documentos só depois da lista da STTU.**

## 8. Acessibilidade

Cartão lido como "CNH, obrigatório, aprovado. Tocar para ver". Progresso como texto, não só a barra.

## 9. Assets

Nenhum. Ícones lucide (`IdCard`, `Car`, `ShieldCheck`, `ScanSearch`).

## 10. Dados: reais × mock

Tudo real (`GET /v1/driver/verification`, upload por URL assinada). **Sem versão de demonstração.**

## 11. Lacunas do protótipo

A tela não existe. O painel do motorista finge aprovação (`registrationApproved = true`, `apps/driver/app/(app)/index.tsx:54`).

## 12. Pedidos de componente

C-15, C-06, C-08, C-17.

## 13. Portão: itens próprios

Upload em 4G fraco e câmera nos dois sistemas (📱, `docs/plano-apps-execucao.md:266`). Capturas a definir quando a decisão 9
sair.

## 14. Não conferido

Tudo aqui é desenho sobre uma regra que não existe.
