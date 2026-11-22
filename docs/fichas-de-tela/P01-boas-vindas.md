# P01 · Boas-vindas

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/boas-vindas`, `apps/passenger/app/(auth)/boas-vindas.tsx` (âncora do grupo `(auth)`, `(auth)/_layout.tsx:5`) |
| Spec | `PASSAGEIRO.md`, P01: logo, promessa sucinta, Entrar, Cadastrar |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recorte 318, 12, 553, 508 ("Bem-vindo") |
| Estado hoje | UI pronta, sem dado (só avisos de sessão) |
| Última nota | 7 (18/11, Expo Web). A emenda B1 foi corrigida na causa (`AppShell.tsx:49-55`), sem nova medição |
| Depende de decisão | nenhuma |
| Ordem | Onda 1 |

## 1. Pergunta que a tela responde

"Que app é este e por onde eu entro?" Sucesso: a pessoa toca em Entrar ou Cadastrar em menos de 5 s, sem rolar.

## 2. Layout

Leitura da prancha: foto noturna ocupando a tela inteira; o lockup do logo no terço de cima; o título em 2 linhas com
"VuumBora!" em amarelo; uma promessa de 3 linhas centralizada; o CTA amarelo cheio; o "Cadastrar" em contorno, com a mesma
largura e a mesma altura; e o aviso legal em 2 linhas no pé.

```
390×844
┌──────────────────────────────┐
│ safe area (status claro)      │
│ ↓ 24 (spacing.6)              │
│   [ lockup 240–320 de largura ]│  BrandLogo lockup
│                                │
│   foto (cena, horizonte a 45%) │  OnboardingBackground
│   ── scrim começa 64 acima ──  │  gradient.photoScrim
│   Bem-vindo ao                 │  heading 28 bold, centro
│   VuumBora!  (amarelo)         │
│   ↓ 12                         │
│   Sua mobilidade urbana com    │  body 16, textSecondary, centro, até 3 linhas
│   mais praticidade, segurança  │
│   e economia.                  │
│   ↓ 12 [InlineAlert, se houver]│
│   ↓ 12                         │
│ [        Entrar         ] 56   │  PrimaryButton
│   ↓ 12                         │
│ [       Cadastrar       ] 52→56│  SecondaryButton, MESMA altura do CTA (prancha)
│   ↓ 12                         │
│ Ao continuar, você concorda... │  LegalNotice, caption, 2 linhas
│ ↓ 20 + safe area inferior      │
└──────────────────────────────┘
```

- **320×568** (altura < 640): lockup `md` (240), margem de cima 16 (`boas-vindas.tsx:40,48,100`), foto reduzida a uma faixa de
  cerca de 45% no topo, e o scrim cobrindo o resto (`docs/direcao-de-arte.md` §6). Margem lateral de 16. **Todo o bloco de
  ação cabe sem rolar**: medir.
- **430×932:** lockup `lg`, no máximo 320, e nunca mais largo que o container (lacuna em `BrandLogo.tsx:36`). O bloco de ação
  encosta no pé; o scrim vai até a última linha de pixels (verificar a base preta da foto, auditoria B2).
- **360×640 a 360×800:** com o `lg` de 320, sobra 0 dos 320 úteis. Usar `md` sempre que a largura útil for menor que 340.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | "Entrar" |
| N2 | "Bem-vindo ao VuumBora!" |
| N3 | Promessa |
| N4 | "Cadastrar"; links "Termos de Uso" e "Política de Privacidade" |
| N5 | Aviso legal |

Amarelo: 1 bloco (Entrar). Sinais: "VuumBora!" (é a marca, igual à maquete) e os dois links legais (são ação). Se o dono
achar ruidoso, os links passam a `textPrimary` sublinhado (auditoria B3).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Fundo | `OnboardingBackground` (`packages/ui/src/OnboardingBackground.tsx`) | `role.screen` por trás |
| Moldura | `AppShell scroll transparent` | safe area; **sem** `glow` (`AppShell.tsx:26-30`) |
| Scrim | `LinearGradient` + `gradient.photoScrim` (`boas-vindas.tsx:54,106`) | — |
| Logo | `BrandLogo variant="lockup"` | — |
| Título | `Text` | `textStyle('bold','heading')`, `textPrimary`; destaque `role.ctaBackground` |
| Promessa | `Text` | `textStyle('regular','body')`, `textSecondary` |
| Avisos | `InlineAlert` (`tone="warning"`, `tone="info"`) | — |
| Ações | `PrimaryButton`, `SecondaryButton` | `gradient.cta`, `gradient.surfaceOverlay`, `edgeTop`/`edgeBottom` |
| Aviso legal | `LegalNotice` (`apps/passenger/src/components/auth/LegalNotice.tsx`) + `LinkButton` | caption |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Como no layout | `P01-padrao-*` |
| Carregando | n/a: a splash nativa segura até a fonte e a sessão resolverem (`apps/passenger/app/_layout.tsx:35-47`) | — |
| Carregando ação | n/a: os dois botões só navegam | — |
| Vazio | n/a | — |
| Erro recuperável | n/a: não há chamada | — |
| Sessão expirada | `InlineAlert` warning, "Sua sessão expirou", acima dos botões (`boas-vindas.tsx:59-66`) | `P01-sessao-expirada-*` |
| Saída sem confirmação do servidor | `InlineAlert` info (`boas-vindas.tsx:67-73`) | `P01-saida-offline-*` |
| Sem rede | `NetworkBanner` (C-01) no topo; os dois botões continuam ativos (as telas seguintes tratam a rede) | `P01-sem-rede-*` |
| Texto longo | n/a: o texto é fixo. Verificar só a promessa em 320 (3 linhas, sem corte) | — |
| 320×568 | Lockup `md`, tudo sem rolar | sim |
| 430×932 | Sem faixa preta no pé | sim |
| Fonte 200% | O título quebra em 3 linhas e a página rola; os botões continuam inteiros, sem reticências | aparelho |
| Teclado | n/a | — |
| Permissão | n/a | — |
| Mock | n/a: nenhum dado | — |

## 6. Microinterações

- Entrada da tela: **nenhuma animação** de propósito (a pessoa vê esta tela toda vez que sai da conta). No máximo um fade de
  200 ms da foto na **primeira** abertura do app.
- Toque nos botões: escala 0,97 em 120 ms (C-13); o pressionado do CTA é `yellowPressed` chapado (`ButtonCore.tsx:112-113`).
- Transição para login e cadastro: empilha da direita (300 ms); voltar é o inverso.
- O aviso de sessão expirada é anunciado pelo leitor de tela ao aparecer (`InlineAlert`, padrão `announce`).

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Bem-vindo ao **VuumBora!** |
| Promessa | Sua mobilidade urbana com mais praticidade, segurança e economia. |
| CTA | Entrar |
| Secundário | Cadastrar |
| Aviso legal | Ao continuar, você concorda com os nossos Termos de Uso e a Política de Privacidade. |
| Sessão expirada | **Sua sessão expirou.** Por segurança, entre de novo para continuar. |
| Saída sem rede | Você saiu deste aparelho. Sem conexão, não conseguimos encerrar a sessão também no servidor. |

⚠ "segurança e economia" é promessa de produto. Ela continua aqui porque é a frase da arte aprovada e não cita recurso
específico, mas **não pode** ganhar complemento do tipo "motoristas verificados" ou "preço mais baixo" (`DESIGN_SYSTEM_MESTRE.md` §9).

## 8. Acessibilidade

- Ordem: logo ("VuumBora", imagem) → título (cabeçalho) → promessa → aviso, se houver → Entrar → Cadastrar → Termos → Política.
- O título precisa de `accessibilityRole="header"` (**falta hoje**, `boas-vindas.tsx:55`) e ser lido como uma frase só: o `Text`
  aninhado do destaque não pode virar dois nós.
- Contraste com o scrim: 16,8:1 medido em 320×568 (`boas-vindas.tsx:33`); medir de novo em 430×932.
- A foto é decorativa (`accessible={false}`).

## 9. Assets

- Existe: `packages/ui/assets/backgrounds/onboarding-noturno.jpg` (procedural, sem licença de terceiro).
- Opcional (decisão do dono, custo): foto real de Natal à noite (`docs/direcao-de-arte.md` §7.2). Sem pessoa e sem carro de
  modelo reconhecível.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Aviso de sessão | `useSession().signedOutNotice` (real) | idem | não |

## 11. Lacunas do protótipo

1. O "Cadastrar" (secundário) tem 52 pt e o "Entrar" 56: na prancha os dois têm a mesma altura (`ButtonCore.tsx:160,200`;
   pedido de `size="prominent"` no secundário).
2. Lockup sem limite de largura (`BrandLogo.tsx:36-46`; `boas-vindas.tsx:48`).
3. Título sem papel de cabeçalho (`boas-vindas.tsx:55`).
4. Base da foto em preto neutro (auditoria B2), não medida depois do conserto da B1.
5. `content: { minHeight: 480 }` (`boas-vindas.tsx:98`) é número fora de token.

## 12. Pedidos de componente

C-01 (`NetworkBanner`), C-13 (`PressableScale`), mudança no `ButtonCore` (secundário proeminente) e no `BrandLogo` (largura
máxima).

## 13. Portão: itens próprios

- O scrim cobre até o pé em 390×844 e 430×932: média da última linha ≈ `rgb(7,13,24)` (método da auditoria B1).
- Os botões têm a mesma altura (diferença de 0 pt).
- O bloco de ação inteiro está visível sem rolar em 320×568.
- Contraste do título e da promessa sobre o ponto mais claro da foto atrás deles ≥ 4,5.
- Capturas: `passageiro/P01-{padrao,sessao-expirada,saida-offline,sem-rede}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Nada foi renderizado nesta tarefa. Não sei se a emenda B1 sumiu de fato.
