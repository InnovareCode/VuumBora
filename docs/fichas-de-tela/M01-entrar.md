# M01 · Entrar (motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | `/entrar` · `apps/driver/app/(auth)/entrar.tsx` (âncora do grupo `(auth)`, `(auth)/_layout.tsx:5`); filhas: `codigo.tsx`, `esqueci-senha.tsx`, `redefinir-senha.tsx`, `termos.tsx`, `privacidade.tsx` |
| Spec | `MOTORISTA.md`, M01: logo, telefone/e-mail, senha, recuperar acesso |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 316, 14, 545, 462 ("Login") |
| Estado hoje | **real** (identidade B2; `mock` no build de teste) |
| Última nota | não auditada (a tela nasceu depois de 18/11) |
| Depende de decisão | 8 (login social, D-01); D-02 (e-mail ou ID público, decidido); D-03 ("Lembrar meu acesso") |
| Ordem | Onda 1 |

## 1. Pergunta que a tela responde

"Como eu entro na minha conta de motorista?" Sucesso: entrar com e-mail ou ID e senha, ou recuperar a senha, sem confundir
**conta** com **cadastro de motorista**.

## 2. Layout

Leitura da prancha: o lockup médio centralizado no terço de cima (sem voltar: é a primeira tela); "Acesse sua conta" em
`title` alinhado à esquerda; 2 campos com ícone; "Lembrar meu acesso" (D-03: não entra); CTA "Entrar" em largura total;
"Esqueci minha senha" centralizado e sublinhado embaixo do CTA; separador "ou" e Google (D-01: oculto); rodapé "Não tem uma
conta? **Cadastre-se**".

```
390×844
┌──────────────────────────────┐
│ ↓ 32                          │
│        [lockup md 240]        │  BrandLogo lockup (sm em altura < 640)
│ ↓ 24                          │
│ Acesse sua conta              │  title 22 bold (cabeçalho)
│ ↓ 16                          │
│ [aviso de sessão, se houver]  │  InlineAlert
│ [✉ E-mail ou ID público    ] │  TextInput 52
│ ↓ 12                          │
│ [🔒 Senha            Mostrar] │  PasswordInput
│ ↓ 20                          │
│ [alerta de envio, se houver]  │
│ [         Entrar        ] 56  │  PrimaryButton
│ ↓ 12                          │
│     Esqueci minha senha       │  LinkButton, centro
│ ↓ 24                          │
│ Não tem uma conta? Criar conta│  LinkButton
└──────────────────────────────┘
```

- A diferença para a P02a (passageiro) é intencional e vem da prancha: o motorista tem o link "Esqueci" **embaixo** do CTA e o
  título **à esquerda**. As duas pranchas fazem isso, e cada app segue a sua. Os componentes são os mesmos.
- **320×568:** lockup `sm` (160); CTA terminando acima de 548.
- **430×932:** a coluna no terço de cima, largura máxima de 480.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | Entrar |
| N2 | "Acesse sua conta" |
| N3 | Campos |
| N4 | Esqueci minha senha, Criar conta |
| N5 | Ajuda e avisos |

Amarelo: 1 bloco. Sinais: os 2 links e o campo focado. "Mostrar" em `textSecondary` (`PasswordInput.tsx:70`).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` (hoje sem `glow`, `entrar.tsx:118`) | `gradient.screen` |
| Cabeçalho | `AuthHeader` do motorista (`apps/driver/src/components/auth/AuthHeader.tsx`), com variante "título à esquerda" | — |
| Campos | `TextInput`, `PasswordInput` | — |
| Erros | `AuthErrorAlert` (`apps/driver/src/components/auth/AuthErrorAlert.tsx`), `InlineAlert` | — |
| Ações | `PrimaryButton`, `LinkButton` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Campos vazios | sim |
| Carregando | n/a (splash segura a sessão) | — |
| Carregando ação | Spinner no CTA, campos desabilitados | sim |
| Vazio | n/a | — |
| Erro de campo | Embaixo do campo | sim |
| Erro de envio | Um texto por código de `apps/driver/src/identity/authErrors.ts`: `invalid_credentials`, `email_not_verified` (vai para o código), `too_many_attempts` e `rate_limited` (com contagem), `network`, `unavailable`, `unknown` | um por código |
| Sessão expirada | `InlineAlert` warning acima dos campos (`entrar.tsx:125`) | sim |
| Sem rede | `NetworkBanner`; envio mostra o erro de rede | sim |
| Texto longo | E-mail longo rola dentro do campo | sim |
| 320×568 | CTA visível | sim |
| 430×932 | sim | sim |
| Fonte 200% | sim | aparelho |
| Teclado aberto | campo + CTA visíveis | aparelho |
| Permissão | n/a | — |
| Mock | Identidade `mock`: selo com o código de teste no `codigo.tsx` | sim |

⚠ As contas de passageiro e de motorista são separadas. A lista de códigos do app não tem um código próprio para quem tenta entrar
no app do motorista com a conta de passageiro, e eu não conferi o que a API responde nesse caso. Se cair num erro genérico, o
pedido é à Vega (código próprio), não à tela.

## 6. Microinterações

Iguais à P02 (foco 150 ms, erro 200 ms, toque 0,97). Sem animação de entrada.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Acesse sua conta |
| Campo 1 | E-mail ou ID público |
| Campo 2 | Senha |
| CTA | Entrar |
| Link | Esqueci minha senha |
| Rodapé | Não tem uma conta? **Criar conta** (não "Cadastre-se": conta ≠ cadastro) |
| Sessão | **Sua sessão expirou.** Por segurança, entre de novo para continuar. |

## 8. Acessibilidade

O título é cabeçalho; o foco vai para o alerta quando o envio falha; `autoComplete` username e current-password.

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Sessão e erros | cliente de identidade do motorista (B2) | idem | só o código de teste |

## 11. Lacunas do protótipo

1. Sem brilho de topo (`entrar.tsx:118`).
2. Rodapé "Criar conta" já está certo (`entrar.tsx:217`); conferir se o título e o arranjo seguem a prancha (link "Esqueci" hoje
   fica acima do CTA, `entrar.tsx:189`).
3. "Mostrar" amarelo (`PasswordInput.tsx:70`).

## 12. Pedidos de componente

C-04 (se o CTA não couber em 568), C-01.

## 13. Portão: itens próprios

- G-07b com o recorte "Login" (sem a caixa "Lembrar" e sem o Google, que são divergências D-03 e D-01).
- Capturas: `motorista/M01-{padrao,enviando,erro-campos,sessao-expirada,sem-rede}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não li `entrar.tsx` inteiro (só a estrutura, linhas 118-221) nem o `AuthHeader` do motorista.
