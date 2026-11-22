# M02 · Criar conta (motorista)

| Campo | Valor |
|---|---|
| App | motorista |
| Rota e arquivo | `/criar-conta` · `apps/driver/app/(auth)/criar-conta.tsx`; segue para `codigo.tsx` |
| Spec | `MOTORISTA.md`, M02 "Cadastro: solicitar entrada (dados pessoais e consentimentos)". ⚠ Pelo compromisso público, **conta não é cadastro de motorista**: a M02 do app cria a **conta**; o cadastro de motorista é a M03/M04, que só abre com taxa e repasse publicados (`RegistrationNotice.tsx`, `docs/plano-apps-execucao.md:261-266`) |
| Alvo visual | `alvo_motorista_2026-11-22.png`, recorte 561, 14, 791, 462 ("Cadastro") |
| Estado hoje | **real** (B2) |
| Última nota | não auditada |
| Depende de decisão | D-04 (subtítulo e "confirmar senha"); 8 (social) |
| Ordem | Onda 1 |

## 1. Pergunta que a tela responde

"O que preciso informar para ter conta, e o que essa conta me dá?" Sucesso: a pessoa cria a conta **sabendo** que ainda não é
o cadastro de motorista.

## 2. Layout

Leitura da prancha: voltar; o selo do logo pequeno centralizado; "Criar sua conta" em `title` centralizado; subtítulo; 5
campos de 44 a 48 pt com ícone; CTA "Cadastrar"; "Já tem uma conta? **Fazer login**".

```
390×844
┌──────────────────────────────┐
│ ‹                             │
│       [selo do logo 44]       │  BrandLogo variant="selo" size="md"
│ Criar sua conta               │  heading 28, centro, cabeçalho
│ Informe seus dados para criar │  body, textSecondary
│ a sua conta de motorista.     │
│ ↓ 16                          │
│ ┌ⓘ A conta não é o cadastro ┐│  RegistrationNotice (InlineAlert info), UM bloco
│ │  de motorista. …           ││
│ └────────────────────────────┘│
│ ↓ 16                          │
│ [👤 Nome completo          ] │
│ [✉ E-mail                  ] │
│ [📞 Celular com WhatsApp (opcional)] │
│ [📅 Data de nascimento     ] │
│ [🔒 Senha          Mostrar ] │
│ ↓ 24                          │
│ ☐ Termos de Uso do motorista  │  LegalConsentFields
│ ☐ Política de Privacidade     │
│ [       Criar conta     ] 56  │
│ Já tem uma conta? Entrar      │
└──────────────────────────────┘
```

- O `RegistrationNotice` é a única coisa que a prancha não tem e que **fica**: é o compromisso público (memória
  "candidatura x cadastro"). Ele vai **antes** dos campos e aparece uma vez só na tela.
- **320×568:** o formulário rola; o CTA vai para o `FooterActions` (C-04) depois dos aceites.

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | Criar conta |
| N2 | Título |
| N3 | Aviso "conta ≠ cadastro", campos, aceites |
| N4 | Voltar, Entrar |
| N5 | Ajudas |

Amarelo: 1 bloco. O aviso é `info` (azul tingido), não amarelo.

## 4. Componentes e tokens

Iguais à P02b: `AppShell scroll glow` (hoje sem, `criar-conta.tsx:194`), `AuthHeader`, `TextInput`, `PhoneInput`,
`DateInput`, `PasswordInput`, `LegalConsentFields` (`apps/driver/src/components/legal/LegalConsentFields.tsx`),
`RegistrationNotice` (`apps/driver/src/components/auth/RegistrationNotice.tsx`), `AuthErrorAlert`, `PrimaryButton`, `LinkButton`.

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | sim | sim |
| Carregando (textos legais) | aceites com "Carregando os termos…", CTA desabilitado | sim |
| Carregando ação | spinner no CTA | sim |
| Vazio | n/a | — |
| Erro de campo | `invalid_email`, `invalid_password`, `invalid_phone`, `invalid_birth_date`, `underage`: embaixo do campo | um por código |
| Erro de envio | `email_taken` (com "Entrar"), `consent_required`, `consent_outdated`, `consent_unavailable` (503: "Os termos não estão disponíveis agora"), `rate_limited`, rede | um por código |
| Sem rede | `NetworkBanner` | sim |
| Texto longo | nome de 60 caracteres | sim |
| 320×568 | sim | sim |
| 430×932 | sim | sim |
| Fonte 200% | o aviso cresce, mas não empurra o CTA para fora do alcance (fica no rodapé) | aparelho |
| Teclado | campo e próximo visíveis; "próximo" encadeia os 5 campos | aparelho |
| Permissão | n/a | — |
| Mock | selo do código de teste na tela seguinte | sim |

## 6. Microinterações

Iguais à P02. O aviso **não** é anunciado ao abrir (`announce={false}`, `RegistrationNotice.tsx`): é lido na ordem normal.

## 7. Copy

| Chave | Texto |
|---|---|
| Título | Criar sua conta |
| Subtítulo | Informe seus dados para criar a sua conta de motorista. (`criar-conta.tsx:198`, manter: "Comece a dirigir" da prancha promete o que a conta não dá) |
| Aviso | **A conta não é o cadastro de motorista.** Com a conta você entra no aplicativo. O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas. |
| CTA | Criar conta (a prancha diz "Cadastrar": não usar) |
| Rodapé | Já tem uma conta? **Entrar** |

## 8. Acessibilidade

Igual à P02b. O aviso fica entre o título e o primeiro campo na ordem de leitura.

## 9. Assets

Nenhum novo (o selo do logo já existe em `BrandLogo variant="selo"`).

## 10. Dados: reais × mock

Iguais à M01.

## 11. Lacunas do protótipo

1. Sem brilho de topo (`criar-conta.tsx:194`).
2. O `AuthHeader` usa lockup; a prancha usa o selo pequeno.
3. "Mostrar" amarelo.

## 12. Pedidos de componente

C-04, C-01.

## 13. Portão: itens próprios

- A palavra "cadastro" aparece **só** no aviso, e no sentido certo (contagem no texto renderizado).
- G-07b com o recorte "Cadastro" (divergências permitidas: D-04 e o aviso).
- Capturas: `motorista/M02-{padrao,carregando-termos,enviando,erro-campos,erro-email_taken,sem-rede}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não li `criar-conta.tsx` inteiro (só a estrutura).
