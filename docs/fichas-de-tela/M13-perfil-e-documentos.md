# M13 · Perfil e documentos (motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | Aba `/perfil` · `apps/driver/app/(app)/perfil.tsx`. **A tela de hoje é a M13 provisória** (decisão do Atlas, 22/11): só nome, e-mail e "Sair da conta". O próprio arquivo manda **descartar, não evoluir** quando esta ficha existir (`perfil.tsx:20-25`). Novas: `/perfil/dados`, `/privacidade-e-termos`; "Documentos" e "Veículo" abrem as telas da M03 (bloqueada) |
| Spec | `MOTORISTA.md`, M13: veículo, documentos, dados pessoais, estado de validação. Regra: alterar veículo ou documentos pode exigir nova verificação |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recortes 1127, 516, 1324, 926 ("Perfil") e 918, 516, 1116, 926 ("Documentos", que é da M03) |
| Estado hoje | provisória: "Sair da conta" real com confirmação; nome e e-mail de exemplo |
| Última nota | n/a |
| Depende de decisão | **9** (documentos e veículo, D-24), **3** e **6** (forma de recebimento, D-25), D-25 (nota só a real), D-27 (sem foto de banco), **D-36**, **D-37**, **PP-15**; `GET /v1/driver/verification` (S2); exclusão de conta (Vega); D5 (notificações) |
| Ordem | Onda 5 |

## 1. Pergunta que a tela responde

"Em que pé está o meu cadastro, e como eu cuido da minha conta?" Sucesso: o motorista vê o estado da verificação, os seus
dados, chega aos documentos quando eles existirem, e sai da conta (ou pede a exclusão) sem procurar.

## 2. Layout

Leitura da prancha: título centralizado com seta; avatar grande com câmera; nome; "★ 4,9 (436 avaliações)"; 5 linhas (Dados
pessoais, Veículo cadastrado, Forma de recebimento, Notificações, Preferências do app). **Não tem** "Sair da conta" nem barra de
abas, mas o Perfil é uma aba da M05.

```
390×844
┌──────────────────────────────┐
│           Meu Perfil          │  ScreenHeader center, sem seta (é aba, D-36)
│ ↓ 16                          │
│           ( C )               │  Avatar 88 com inicial; sem câmera (D-37)
│        Carlos Oliveira        │  title 22 bold, até 2 linhas
│   ★ 4,9 · 436 avaliações      │  só com nota real (D-25); senão "Sem avaliações ainda"
│ ↓ 16                          │
│ ┌──────────────────────────┐ │  cartão de estado do cadastro (o da M04)
│ │ ⓘ Cadastro de motorista   │ │  InlineAlert tone info, ou StatusBadge pelo estado
│ │   ainda não aberto        │ │
│ └──────────────────────────┘ │
│ ↓ 16                          │
│ [👤 Dados pessoais          › ] │  ListRow, ícone textSecondary (D-30)
│ [🚗 Veículo                 › ] │  só com a M03 (decisão 9)
│ [📄 Documentos              › ] │  só com a M03 (decisão 9)
│ [🛡 Privacidade e termos     › ] │
│ [?  Ajuda e suporte         › ] │  → M14
│ ↓ 24                          │
│ [ ⏻  Sair da conta         ] 52│  DangerButton + ConfirmDialog (D-37)
│ (selo: dados de exemplo)      │  só em mock
├───────────────────────────────┤
│ 🏠Início 💳Ganhos 📋Histórico 👤Perfil │ BottomTabBar, "Perfil" ativa
└──────────────────────────────┘
```

**Linhas (PP-15: linha sem destino não aparece):**

| Linha da prancha | Entra agora? | Destino |
|---|---|---|
| Dados pessoais | **sim** | `/perfil/dados`: nome, e-mail, ID público e data de nascimento de `GET /v1/me`, só leitura |
| Veículo cadastrado | **não**, até a decisão 9 | tela de veículo da M03; mudar o veículo pede nova verificação (spec) |
| (novo) Documentos | **não**, até a decisão 9 | "Meus documentos" (M03, `M03-veiculo-e-documentos.md`): mesmo layout, estados de manutenção (vence em, vencido, reenviar) |
| Forma de recebimento | **não** (D-25, decisões 3 e 6) | — |
| Notificações | **não**, até o push (D5) | — |
| Preferências do app | **não** | Aceitar pet, entrega e favorito (`PUT /v1/driver/preferences`) só quando as categorias ligarem (plano D-08, D-09) e o favorito existir (S4) |
| (novo) Privacidade e termos | **sim** | Termos, Política de Privacidade (o `LegalDocumentScreen` do motorista já existe, `apps/driver/src/components/auth/LegalDocumentScreen.tsx`) e "Excluir conta" |
| (novo) Ajuda e suporte | **sim**, quando a M14 existir | `/suporte` |

- **Estado do cadastro no topo**, porque responde à pergunta que mais pesa para quem tem conta e ainda não dirige (spec:
  "estado de validação"). É o mesmo cartão da M04/M05 (`RegistrationNotice`), com o estado real de `GET /v1/driver/verification`
  quando existir. Aprovado, o cartão some, sem selo no lugar: aprovado é o estado normal de quem dirige.
- **Sem câmera no avatar** (D-37): a foto do motorista é a do cadastro verificado, e trocá-la pede nova verificação. Até a
  M03, inicial.
- **"Sair da conta" no pé** (decidido: mora na M13). A prancha não o tem; o passageiro tem, no mesmo lugar (P13).
- **320×568:** avatar 64; o cartão de estado em 2 linhas; o "Sair" abaixo da dobra é aceitável (não é a ação da tela).

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | nenhum (consulta e manutenção) |
| N2 | Estado do cadastro |
| N3 | Nome, nota, linhas |
| N4 | Sair da conta, abas |
| N5 | Contagem de avaliações, selo |

Amarelo: **0 blocos**. Sinais: a aba ativa; a estrela da nota (quando houver). A prancha tem os ícones de linha amarelos na
tela de Documentos e brancos no Perfil; aqui, todos `textSecondary` (D-30).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` + `footer` com `BottomTabBar` (abas de verdade, ver M12) | — |
| Avatar | `Avatar` 88 | — |
| Nota | `StarRating` só leitura, 16, estrela lucide | estrela `brand.yellow` (sinal) |
| Estado do cadastro | `RegistrationNotice` (`apps/driver/src/components/auth/RegistrationNotice.tsx`) com o estado real | `InlineAlert` info |
| Linhas | `ListRow` (C-08) | ícone 20 `textSecondary` |
| Sair | `DangerButton` + `ConfirmDialog destructive` (hoje a provisória usa uma `ListRow` com ícone vermelho, `perfil.tsx:74-80`) | — |
| Excluir | igual à P13 (`LinkButton` danger na tela "Privacidade e termos") | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão sem aprovação (o de todos hoje) | Cartão "Cadastro de motorista ainda não aberto"; nota "Sem avaliações ainda" | `M13-sem-aprovacao-*` |
| Pendente / correção pedida / recusado | O cartão da M04 com o estado (`pending`, `correction_requested`, `rejected`) e a ação que a M04 define | `M13-{pendente,correcao,recusado}-*` (depois do S2) |
| Aprovado | Sem cartão; nota real | `M13-aprovado-*` |
| Carregando | Avatar, nome e cartão em esqueleto; as linhas já aparecem | `M13-carregando-*` |
| Carregando ação (sair) | Spinner no diálogo; sai do aparelho mesmo sem rede (já) | `M13-saindo-*` |
| Vazio | n/a | — |
| Erro de carga | O nome cai para o da sessão; `InlineAlert` "Não foi possível carregar seus dados." + "Tentar de novo"; "Sair" funciona | `M13-erro-*` |
| Online ao sair | Se o motorista estiver online, o diálogo avisa: "Você está online. Ao sair, você fica offline." e o app chama `setAvailability({ online: false })` antes de sair (ficar offline sempre funciona, R7, `driver/types.ts:29-33`) | `M13-sair-online-*` |
| Excluir com corrida ativa | `409 active_trip_exists`: "Você tem uma corrida em andamento." | sim |
| Sem rede | `NetworkBanner`; "Sair" funciona; "Excluir conta" desabilitado | `M13-sem-rede-*` |
| Texto longo | Nome de 40 caracteres em 2 linhas | `M13-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Linhas crescem; nada corta | aparelho |
| Teclado / Permissão | n/a | — |
| Mock | Em modo mock, um selo embaixo do "Sair": "dados de exemplo" | sim |

## 6. Microinterações

Sem animação de entrada (aba vista muitas vezes). Linhas com escala 0,97. Sair: diálogo → spinner → a guarda manda para
`/entrar` (já).

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Meu Perfil |
| Nota | {n,n} · {n} avaliações · Sem avaliações ainda |
| Cadastro | (os textos da M04 por estado; sem aprovação, o do `RegistrationNotice`) |
| Linhas | Dados pessoais · Veículo · Documentos · Privacidade e termos · Ajuda e suporte |
| Sair | Sair da conta · Sair da conta? · Você vai precisar entrar de novo para usar o aplicativo. · Sair · Cancelar *(já, `perfil.tsx:85-88`)* |
| Sair online | Você está online. Ao sair, você fica offline. |
| Erro | Não foi possível carregar seus dados. · Tentar de novo |
| Selo | dados de exemplo |

A frase "Tela provisória, até a M13 existir." (`perfil.tsx:59`) sai com a tela provisória.

## 8. Acessibilidade

- Título como cabeçalho; o cartão de estado é lido logo depois do nome.
- A nota é lida como "Nota 4,9, 436 avaliações", não como 5 estrelas.
- Aba ativa com `selected`.

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Nome, e-mail | "Carlos Santos" fixo (`perfil.tsx:62-69`) | `GET /v1/me` (B2) | não, quando real |
| Estado do cadastro | `RegistrationNotice` fixo | `GET /v1/driver/verification` (S2) | — (nunca fingir) |
| Nota e avaliações | não existe | a definir no S4 (média das avaliações dos passageiros) | — |
| Veículo, documentos | não existe | M03 (decisão 9) | — |

## 11. Lacunas do protótipo

1. Tela provisória (`perfil.tsx:20-29`), a descartar.
2. "Sair da conta" como linha de lista com ícone vermelho (`perfil.tsx:74-80`), não como `DangerButton` no pé.
3. Aba "Perfil" sem ação dentro dela mesma e "Ganhos"/"Histórico" vazias (`perfil.tsx:45-52`).
4. Nome e e-mail de exemplo.
5. Sem o estado do cadastro, que é o que mais importa para quem ainda não dirige.

## 12. Pedidos de componente

Nenhum novo. Navegação por abas de verdade (M12). Exclusão de conta (Vega, igual à P13).

## 13. Portão: itens próprios

- G-07b com o recorte "Perfil": título centralizado, avatar e nome centralizados, nota, linhas de altura igual. Divergências
  permitidas: D-25, D-27, D-30, D-36, D-37, PP-15.
- Nenhuma linha sem destino (G-19).
- "Sair da conta" existe e pede confirmação; com o motorista online, fica offline antes (teste de interação com o adaptador
  mock).
- Capturas: `motorista/M13-{sem-aprovacao,aprovado,carregando,saindo,erro,sair-online,sem-rede,texto-longo}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não sei de onde virá a nota do motorista (o contrato não tem). Não conferi o `LegalDocumentScreen` do motorista linha a linha.
