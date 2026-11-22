# P02 · Entrar e criar conta (com código, esqueci e redefinir a senha)

| Campo | Valor |
|---|---|
| App | passageiro |
| Rotas e arquivos | P02a `/login` `(auth)/login.tsx` · P02b `/cadastro` `(auth)/cadastro.tsx` · P02c `/codigo` `(auth)/codigo.tsx` · P02d `/esqueci-senha` · P02e `/redefinir-senha` · P02f `/termos` e `/privacidade` |
| Spec | `PASSAGEIRO.md`, P02: celular/e-mail, senha, recuperação, consentimentos |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recorte 566, 12, 801, 508 ("Criar conta"). P02a, c, d e e **herdam** desse recorte (mesma coluna de campos) |
| Estado hoje | **real** (identidade B1 contra a API; modo `mock` no build de teste) |
| Última nota | login 6, cadastro 5 (18/11). O botão social legado (R1) não aparece mais: a chave está desligada |
| Depende de decisão | 8 (login social, D-01); contrato de identidade (decidido: e-mail ou ID público, recuperação só por e-mail) |
| Ordem | Onda 1 |

## 1. Pergunta que a tela responde

P02a: "como eu entro?". P02b: "o que preciso informar para ter conta?". P02c: "onde ponho o código que chegou?". Sucesso:
a pessoa cria a conta e confirma o e-mail sem sair do app nem ler instrução duas vezes.

## 2. Layout

Leitura da prancha ("Criar conta"): voltar no topo à esquerda; título "Criar conta" centralizado em `heading`; subtítulo de 1
linha; coluna de campos de 48 a 52 pt com ícone de 18 à esquerda e vão de 10 a 12; CTA amarelo em largura total logo depois do
último campo; o separador "ou" e os botões sociais (D-01: ocultos); e o rodapé "Já tem conta? **Entrar**" centralizado.
**Sem lockup grande:** na prancha, "Criar conta" não tem logo. No login, a prancha do motorista usa o lockup médio acima de
"Acesse sua conta".

```
390×844 (P02b)
┌──────────────────────────────┐
│ ‹ (44×44)                     │  voltar
│ [lockup sm 160]               │  AuthHeader, logo (avaliar tirar: a prancha não tem)
│ Criar conta                   │  heading 28, centro, cabeçalho
│ Informe seus dados para começar│  body, textSecondary
│ ↓ 24                          │
│ [👤 Nome completo        ] 52 │  TextInput
│ ↓ 16                          │
│ [✉ E-mail                ]    │
│ [📞 Celular com WhatsApp (opcional)]│ PhoneInput
│ [📅 Data de nascimento   ]    │  DateInput
│ [🔒 Senha          Mostrar]    │  PasswordInput, ajuda "De 8 a 72 caracteres."
│ ↓ 24                          │
│ ☐ Li e aceito os Termos de Uso│  LegalConsentFields (ConsentCheckbox)
│ ☐ Li e aceito a Política…     │
│ ↓ 24                          │
│ [alerta de envio, se houver]  │  AuthErrorAlert / InlineAlert
│ [      Criar conta      ] 56  │  PrimaryButton (FooterActions em < 640 de altura)
│ Já tem uma conta? Entrar      │  LinkButton
└──────────────────────────────┘
```

- **P02a (login):** a mesma coluna com 2 campos ("E-mail ou ID público" e "Senha"), "Esqueci minha senha" alinhado à direita,
  CTA "Entrar" e o rodapé "Não tem conta? Cadastre-se". Em 320×568, o CTA hoje fica abaixo da dobra (auditoria L2): com
  lockup `sm` e o brilho de topo, o CTA precisa terminar até y ≈ 540; se não terminar, vai para o `FooterActions` (C-04).
- **P02c (código):** título "Confirme seu e-mail", a frase com o e-mail mascarado, `CodeInput` de 6 dígitos (cada caixa ≥ 44),
  "Reenviar código" com contagem regressiva e o CTA "Confirmar".
- **P02d/e:** um campo (e-mail) e, depois, código + nova senha. A mesma coluna.
- **430×932:** a coluna fica no topo (não centralizar verticalmente: o teclado empurra), largura máxima de 480.

## 3. Hierarquia

| Nível | P02a | P02b |
|---|---|---|
| N1 | Entrar | Criar conta |
| N2 | Título "Entrar" | Título "Criar conta" |
| N3 | Campos | Campos e aceites |
| N4 | Voltar, Esqueci minha senha, Cadastre-se | Voltar, Entrar |
| N5 | Ajuda de campo | Ajuda de senha, aviso legal |

Amarelo: 1 bloco (o CTA). Sinais: `LinkButton`, a borda do campo focado e o check marcado. **"Mostrar" sai do amarelo**
(`PasswordInput.tsx:70`, auditoria L3).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` (**hoje sem `glow`**: `login.tsx:111`, `cadastro.tsx:190`) | `gradient.screen` |
| Cabeçalho | `AuthHeader` (`apps/passenger/src/components/auth/AuthHeader.tsx`) | `heading` |
| Campos | `TextInput`, `PasswordInput`, `PhoneInput`, `DateInput`, `CodeInput` | `role.input`, `edgeTop`/`edgeBottom`, foco `ctaBackground` 2 pt, erro `dangerFill` |
| Aceites | `LegalConsentFields` + `ConsentCheckbox` | `borderControl` |
| Erro de envio | `AuthErrorAlert` + `InlineAlert` | tons `danger`/`warning`/`info` |
| Ações | `PrimaryButton`, `LinkButton` | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Campos vazios, CTA ativo | sim |
| Carregando (textos legais) | No cadastro, os aceites mostram "Carregando os termos…" (live region polite) e o CTA fica desabilitado até `legal.status === 'ready'` (`cadastro.tsx:331-333`) | `P02b-carregando-*` |
| Carregando ação | Spinner no CTA; campos desabilitados (`disabled={submitting}`) | `P02a-enviando-*` |
| Vazio | n/a | — |
| Erro de campo | Borda `dangerFill` + mensagem com ✕ embaixo; no cadastro, o resumo "Revise os campos destacados: …" acima do CTA (`cadastro.tsx:318-325`) | `P02b-erro-campos-*` |
| Erro de envio | `AuthErrorAlert` acima do CTA, com foco nele. Um texto por código: `invalid_credentials` (sem dizer qual campo), `email_not_verified` (vai para P02c), `too_many_attempts` (contagem e CTA "Aguarde 0:42"), `email_taken` (com a ação "Entrar"), `consent_outdated`, `consent_unavailable` (503), rede, `server_busy` | um por código: `P02a-erro-<code>-390x844` |
| Sem rede | `NetworkBanner` + o CTA mostra o erro de rede no envio; nada se perde do que foi digitado | sim |
| Texto longo | E-mail de 60 caracteres no campo e na frase do P02c (quebra, não corta) | sim |
| 320×568 | CTA visível ou fixo no rodapé | sim |
| 430×932 | Coluna no topo, sem buraco entre campos e CTA | sim |
| Fonte 200% | Rótulos quebram; "Mostrar" não sobrepõe o texto digitado | aparelho |
| Teclado aberto | O campo em foco e o CTA visíveis; "próximo" no teclado leva ao campo seguinte; "ir" envia (`login.tsx:136-137,157-159`) | aparelho |
| Permissão | n/a | — |
| Mock | Identidade em `mock`: o selo com o código de teste no P02c (`codigo.tsx:167`) | sim |

## 6. Microinterações

- Foco no campo: a borda passa a amarela em 150 ms; o erro desce em 200 ms (hoje troca seco).
- "Mostrar senha" troca o rótulo sem mover o campo.
- No P02c, ao colar 6 dígitos, preenche tudo e envia sozinho; o erro de código treme a fileira **uma vez** (com "reduzir
  movimento", só a cor e a mensagem).
- Sucesso do cadastro → P02c com o e-mail já escrito; sucesso do código → a guarda abre o início (sem tela intermediária).

## 7. Copy

| Chave | Texto |
|---|---|
| P02a título / subtítulo | Entrar · Acesse sua conta para continuar. |
| Campo 1 | E-mail ou ID público · *seu@email.com ou seu ID* |
| Campo 2 | Senha |
| Link | Esqueci minha senha |
| CTA | Entrar · em espera: "Aguarde 0:42" |
| Rodapé | Não tem conta? **Cadastre-se** |
| P02b título / subtítulo | Criar conta · Informe seus dados para começar. |
| Campos | Nome completo · E-mail · Celular com WhatsApp (opcional) · Data de nascimento · Senha (ajuda: "De 8 a 72 caracteres.") |
| CTA | Criar conta |
| Rodapé | Já tem uma conta? **Entrar** |
| Resumo de erro | Revise os campos destacados: {lista}. |
| P02c título | Confirme seu e-mail |
| P02c frase | Enviamos um código de 6 dígitos para {e-mail}. |
| Reenviar | Reenviar código · em espera: "Reenviar em 0:30" |
| Sem rede | Sem conexão. Confira a internet e tente de novo. |

Os demais textos de erro já existem em `apps/passenger/src/identity/authErrors.ts` e foram revisados na B1. Lacuna
registrada: `server_busy` (503) cai em "Serviço indisponível" sem texto próprio (F10, `docs/plano-apps-execucao.md:133`).

## 8. Acessibilidade

- O título é cabeçalho (`AuthHeader.tsx:25`, já está).
- Todo campo com `label` visível (não só placeholder) e o erro ligado ao campo (`fieldErrorProps`).
- Ao falhar o envio, o foco vai para o alerta (`login.tsx:101`, padrão a manter no cadastro e no código).
- `autoComplete`/`textContentType` certos (username, current-password, new-password, one-time-code no P02c), para o gerenciador
  de senha e o autopreenchimento do código por SMS ou e-mail funcionarem.
- O `CodeInput` é lido como um campo só ("Código de 6 dígitos"), não como 6 campos.

## 9. Assets

Nenhum novo. Ícones lucide: `User`, `Mail`, `Phone`, `Calendar`, `Lock`.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Sessão, erros e códigos | `identity` (`identityClient.ts`): real com a API; `mock` no build de teste | idem, `http` em produção | só o código de teste, em `mock` |
| Textos legais | API (B3) | idem | não |

## 11. Lacunas do protótipo

1. Sem brilho de topo (`login.tsx:111`, `cadastro.tsx:190`; auditoria L1 e R2).
2. CTA do login abaixo da dobra em 320×568 (L2), não medido depois.
3. "Mostrar" amarelo (`PasswordInput.tsx:70`).
4. `AuthHeader` com o lockup `sm` (160 de largura) em todas as telas de autenticação (`AuthHeader.tsx:23`); a prancha não tem
   logo em "Criar conta". Recomendo tirar o logo de P02b, c, d e e e manter só no P02a.
5. `server_busy` sem texto próprio (F10).

## 12. Pedidos de componente

C-04 (`FooterActions`) para 568 de altura; C-01.

## 13. Portão: itens próprios

- Lado a lado com o recorte "Criar conta" (G-07b): coluna de campos de altura igual, CTA em largura total logo depois dos
  aceites, rodapé centralizado.
- Cada código de erro do contrato produz o seu texto (captura por código).
- Tab: campo 1 → campo 2 → … → aceites → CTA → links, nessa ordem, com anel visível nos três motores (a lição do `818d655`).
- Capturas: `passageiro/P02{a,b,c,d,e}-{padrao,enviando,erro-campos,sem-rede}-{320x568,360x800,390x844,430x932}.png`, mais
  `P02a-erro-<code>-390x844.png` por código.

## 14. Não conferido

Não li P02d e P02e linha a linha, só a estrutura (`esqueci-senha.tsx:73-130`, `redefinir-senha.tsx:145-236`). Nada renderizado.
