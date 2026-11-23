# P13 · Perfil e configurações

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/perfil` · `apps/passenger/app/(app)/perfil.tsx`; `/configuracoes` · `configuracoes.tsx`. Novas: `/perfil/dados` (Meus dados) e `/privacidade-e-termos` |
| Spec | `PASSAGEIRO.md`, P13: nome, telefone, lugares salvos, notificações, privacidade |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recortes 925, 522, 1189, 976 ("Meu Perfil") e 1200, 522, 1470, 976 ("Configurações"). Referências em alta: `referencias/premium/passageiro/P13-perfil.webp` e `P13b-configuracoes.webp` |
| Estado hoje | parcial: "Sair da conta" real (`useSession().signOut`); nome e telefone de exemplo; linhas sem destino com aviso; chaves só locais |
| Última nota | não auditada |
| Depende de decisão | D-14, D-15 (promoções: dono e advogado), D-30 (decidido), **PP-15** (linha sem destino não aparece); exclusão de conta (`POST /v1/me/deletion`, Vega; retenção no S7); D5 (push) para Notificações; C1 do plano de apps |
| Ordem | Onda 5 |

## 1. Pergunta que a tela responde

Perfil: "Estes são os meus dados, e como eu saio?" Configurações: "O que o app pode fazer com o meu aparelho e os meus
dados?" Sucesso: a pessoa confere nome e e-mail, acha os termos, sabe o estado da localização e sai da conta (ou pede a
exclusão) sem procurar.

## 2. Layout

### 2.1 Meu Perfil

Leitura da prancha: título centralizado com seta; avatar de 88 com lápis; nome e telefone centralizados; 7 linhas de lista
de altura igual com ícone à esquerda e chevron; "Sair da conta" em contorno vermelho no pé.

```
390×844
┌──────────────────────────────┐
│ ‹        Meu Perfil        ⚙ │  ScreenHeader center + rightSlot Configurações (44×44)
│ ↓ 16                          │
│           ( J )               │  Avatar 88 com inicial (D-14; sem lápis, ver abaixo)
│       Juarez Rocha            │  title 22 bold, até 2 linhas
│   juarez@exemplo.com.br       │  small, textSecondary (e-mail de me())
│ ↓ 20                          │
│ [👤 Meus dados             › ] │  ListRow 52–56, vão 8, ícone textSecondary (D-30)
│ [🛡 Privacidade e termos    › ] │
│ [?  Ajuda                   › ] │  → P14 (quando existir)
│ [ⓘ Sobre o VuumBora        › ] │
│ ↓ 24                          │
│ [ ⏻  Sair da conta         ] 52│  DangerButton + ConfirmDialog
│ (selo: sessão simulada)       │  só em modo mock
└──────────────────────────────┘
```

**Quais linhas existem (PP-15: linha sem destino não aparece).** A prancha tem 7; hoje o código mostra as 7, e 6 delas só
abrem um aviso de "ainda não disponível" (`perfil.tsx:77-118`). Uma tela de perfil em que quase tudo diz "não" parece
protótipo. A regra: entra a linha que leva a algum lugar real.

| Linha da prancha | Entra agora? | Destino |
|---|---|---|
| Meus dados | **sim** | `/perfil/dados`: nome, e-mail, ID público e data de nascimento de `GET /v1/me`, só leitura. Editar só com `PATCH /v1/me` pronto |
| Endereços favoritos | não | Só quando Casa e Trabalho da P03 forem guardados no servidor (S3) |
| Preferências de viagem | não | Nada decidido para preferir (Pet e Motorista mulher nascem desligadas, plano D-08 e D-09) |
| Segurança e privacidade | **sim**, como "Privacidade e termos" | `/privacidade-e-termos`: Termos de Uso, Política de Privacidade (o `LegalDocumentScreen` já existe, `src/components/auth/LegalDocumentScreen.tsx`) e "Excluir conta" |
| Notificações | não | Só com push (D5); entra como chave em Configurações, não aqui |
| Ajuda e suporte | **sim**, quando a P14 existir | `/ajuda` |
| Sobre o VuumBora | **sim** | Versão do app, empresa responsável (`docs/decisoes-do-dono.md:479-500`), links para os termos |

- **Sem lápis no avatar.** Enviar foto não existe; um lápis que não faz nada é botão de mentira (G-19). Avatar com inicial.
- **Telefone:** só se a pessoa informou no cadastro (é opcional, D-05). Sem telefone, a linha de baixo é o e-mail.
- **320×568:** avatar de 64; nome em `subtitle`; o `DangerButton` pode ficar abaixo da dobra (não é a ação principal da tela).
- **430×932:** igual, até 480 de largura útil.

### 2.2 Configurações

Leitura da prancha: 7 linhas, três com chave amarela (Notificações, Localização em tempo real, Receber promoções), duas com
valor à direita (Tema "Escuro", Idioma "Português (BR)"), "Privacidade e termos" e "Limpar cache 12,4 MB".

```
┌──────────────────────────────┐
│ ‹       Configurações         │
│ ↓ 16                          │
│ Permissões                    │  SectionHeader (C-07)
│ [📍 Localização      Permitida ›] │  reflete a permissão do sistema; toque abre Ajustes
│ [🔔 Notificações     (chave)   ] │  só com push (D5)
│ ↓ 20                          │
│ Conta                         │
│ [🛡 Privacidade e termos     › ] │  o mesmo destino do Perfil
│ ↓ 32                          │
│        Excluir conta          │  LinkButton em role.danger, centro
└──────────────────────────────┘
```

| Linha da prancha | Decisão |
|---|---|
| Notificações (chave) | Só com push (D5). A chave reflete a permissão do sistema **e** a preferência guardada no servidor; sem os dois, não aparece |
| Localização em tempo real (chave) | Vira **linha de estado**, não chave: "Permitida / Só durante o uso / Negada", e o toque abre os Ajustes do sistema. O app não consegue ligar a permissão sozinho; uma chave que mente é pior que nenhuma (D-15) |
| Receber promoções (chave) | Não entra: exige consentimento de marketing com base legal (D-15, dono e advogado) |
| Tema do aplicativo, Idioma | Não entram: uma opção só cada. Mostrar "Escuro" sem alternativa não ajuda ninguém |
| Privacidade e termos | Entra |
| Limpar cache | Não entra: hoje é fingido (`configuracoes.tsx:12-32`, o tamanho é fixo e nada é apagado) |

**Excluir conta** é exigência das duas lojas (`docs/plano-apps-execucao.md:255-256`). Fluxo: toque → tela de explicação (o
que acontece, o que fica guardado por obrigação legal, prazo) → `ConfirmDialog destructive` → `POST /v1/me/deletion`. Com
corrida ativa, o servidor recusa (`409 active_trip_exists`) e a tela diz por quê. O texto do que fica guardado depende da
regra de retenção (S7) e da Política de Privacidade (rascunho com o advogado).

Com tão poucas linhas, Configurações pode parecer vazia. Prefiro vazia e verdadeira, e recomendo manter as duas telas, como
na prancha: as linhas de Notificações e de Endereços chegam com o S3 e o S4. A alternativa (fundir Configurações no Perfil,
numa seção "Permissões" acima do "Sair", e tirar o ⚙) é escolha do Atlas.

## 3. Hierarquia

| Nível | Perfil | Configurações |
|---|---|---|
| N1 | nenhum (consulta) | nenhum |
| N2 | Nome | o estado da localização |
| N3 | E-mail, linhas | linhas |
| N4 | Sair da conta, ⚙, voltar | Excluir conta, voltar |
| N5 | selo | rótulos de seção |

Amarelo: **0 blocos**. Sinal: só o trilho da chave de Notificações ligada, quando ela existir (a `ToggleSwitch` do
`packages/ui` usa `ctaBackground` ligada, `ToggleSwitch.tsx:49`; conta como "item selecionado", §2 do padrão). A prancha
pinta de amarelo os ícones de linha: seguem a D-30 (decidida, `textSecondary`).

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` | — |
| Cabeçalho | `ScreenHeader align="center"` com `rightSlot` | — |
| Avatar | `Avatar` 88 (64 em 320) | `surfaceElevated` |
| Linhas | `ListRow` (C-08, `packages/ui/src/ListRow.tsx`), substituindo o `ListMenuRow` local (`src/components/shared/ListMenuRow.tsx`) | `SurfaceRaised`, ícone 20 `textSecondary`, chevron `textMuted` |
| Seções | `SectionHeader` (C-07) | `section` |
| Sair | `DangerButton` + `ConfirmDialog destructive` (C-03) | contorno `dangerFill` |
| Excluir | `LinkButton` com tom `danger` + tela de explicação + `ConfirmDialog` | `role.danger` |
| Confirmação | `Toast` (C-05) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Perfil com nome e e-mail reais | `P13-padrao-*`, `P13-config-padrao-*` |
| Carregando | Avatar em círculo de esqueleto; nome e e-mail em 2 linhas de esqueleto; as linhas já aparecem (não dependem de rede) | `P13-carregando-*` |
| Carregando ação (sair) | Spinner no botão do diálogo; sai **sempre** do aparelho, mesmo sem rede (já, `perfil.tsx:37-42`) | `P13-saindo-*` |
| Vazio | n/a: sempre há conta | — |
| Erro de carga (`me()`) | O nome cai para o que está guardado na sessão; se não houver, `InlineAlert` "Não foi possível carregar seus dados." + "Tentar de novo"; as linhas e o "Sair" continuam funcionando | `P13-erro-*` |
| Localização negada | Linha "Localização · Negada" com o ícone em `role.warning` e texto; toque abre os Ajustes | `P13-config-negada-*` |
| Excluir: corrida ativa | "Você tem uma corrida em andamento. Termine ou cancele antes de excluir a conta." | `P13-excluir-corrida-ativa-*` |
| Excluir: pedido aceito | Tela de confirmação com o prazo que o servidor devolveu (`scheduledFor`) e a sessão encerrada | `P13-excluir-feito-*` |
| Sem rede | `NetworkBanner`; dados guardados continuam; "Excluir conta" desabilitado com "Sem conexão"; "Sair" funciona | `P13-sem-rede-*` |
| Texto longo | Nome de 40 caracteres em 2 linhas; e-mail longo com reticências no meio do usuário, nunca no domínio [regra a medir] | `P13-texto-longo-*` |
| 320×568 / 430×932 | Ver layout | sim |
| Fonte 200% | Linhas crescem em altura; rótulo em até 2 linhas; valor à direita desce para baixo do rótulo | aparelho |
| Teclado / Permissão | n/a (Configurações mostra a permissão, não pede) | — |
| Mock | Em modo mock, um selo embaixo do "Sair": "sessão simulada, sem autenticação real" (já, `perfil.tsx:129-133`). Em modo real, nenhum | sim |

## 6. Microinterações

- Linhas: escala 0,97 ao tocar (C-13); entrada sem animação (tela vista muitas vezes).
- Voltar dos Ajustes do sistema: a linha de localização relê a permissão ao voltar ao app (evento de app ativo) e troca o
  valor com fade de 150 ms.
- Sair: diálogo → spinner → a guarda de rota leva à P01 (já).

## 7. Copy

| Chave | Texto |
|---|---|
| Títulos | Meu Perfil · Configurações · Meus dados · Privacidade e termos · Sobre o VuumBora |
| Linhas | Meus dados · Privacidade e termos · Ajuda · Sobre o VuumBora |
| Seções | Permissões · Conta |
| Localização | Localização · Permitida · Só durante o uso · Negada |
| Notificações | Notificações *(só com push)* |
| Sair | Sair da conta · Sair da conta? · Você vai precisar entrar de novo para usar o aplicativo. · Sair · Cancelar *(mesmo texto da M13 provisória, `apps/driver/app/(app)/perfil.tsx:85-88`)* |
| Excluir | Excluir conta · *(texto da tela de explicação: a escrever com o advogado, junto da Política de Privacidade)* |
| Erro | Não foi possível carregar seus dados. · Tentar de novo |
| Selo | sessão simulada, sem autenticação real |

## 8. Acessibilidade

- O ⚙ tem rótulo "Abrir configurações" (já, `perfil.tsx:54`).
- A linha de localização é lida com o valor: "Localização, negada. Abre os ajustes do aparelho".
- "Excluir conta" é lido como ação destrutiva: "Excluir conta, abre a explicação".
- Cabeçalhos: título da tela e títulos de seção.

## 9. Assets

Nenhum novo.

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Nome, telefone | `MOCK_PASSENGER_PROFILE` (`perfil.tsx:64-73`) | `GET /v1/me` (B1, já no contrato de identidade) | não, quando real |
| E-mail, ID público | não aparece | `GET /v1/me` | — |
| Permissão de localização | chave local (`configuracoes.tsx:24`) | API de permissão do sistema (`expo-location`) | — |
| Notificações | chave local | permissão do sistema + preferência no servidor (D5) | — |
| Exclusão | não existe | `POST /v1/me/deletion` (Vega) | — |
| Textos legais | `LegalDocumentScreen` (texto e versão de `useLegalDocuments`, a mesma cópia do cadastro) | idem | — |

## 11. Lacunas do protótipo

1. Ícones de linha amarelos (`perfil.tsx:78-114`; `configuracoes.tsx:41-79`; D-30 decidida).
2. Seis linhas que só abrem aviso de indisponível (`perfil.tsx:77-118`; PP-15).
3. Nome e telefone de exemplo (`perfil.tsx:64-73`).
4. Chaves de enfeite: localização, notificações e promoções guardadas só em memória (`configuracoes.tsx:23-25`; D-15).
5. "Limpar cache" fingido com tamanho fixo (`configuracoes.tsx:12-13,29-32`).
6. "Sair da conta" sem diálogo de confirmação no passageiro (`perfil.tsx:121-128`), enquanto o motorista já tem
   (`apps/driver/app/(app)/perfil.tsx:83-94`). Os dois apps fazem igual.
7. Sem caminho para excluir a conta (exigência de loja).
8. `ListMenuRow` local onde o `ListRow` do `packages/ui` já existe (C-08).

## 12. Pedidos de componente

Nenhum novo: `ListRow`, `SectionHeader`, `ConfirmDialog`, `Toast` e `LinkButton` já estão no `packages/ui`. Pedido à Vega:
`POST /v1/me/deletion` no app de identidade (plano de apps, C1).

## 13. Portão: itens próprios

- G-07b com os recortes "Meu Perfil" e "Configurações": título centralizado, avatar e nome centralizados, linhas de altura
  igual, botão vermelho de contorno no pé. Divergências permitidas: D-14, D-15, D-30, PP-15 (menos linhas).
- Nenhuma linha sem destino (G-19 sem exceção).
- Nenhuma chave cujo valor não venha do sistema ou do servidor.
- Sair funciona com a rede cortada (G-18).
- Capturas: `passageiro/P13-{padrao,carregando,saindo,erro,sem-rede,texto-longo}-*.png`,
  `passageiro/P13-config-{padrao,negada}-*.png`, `passageiro/P13-excluir-{explicacao,corrida-ativa,feito}-*.png`, nos 4
  tamanhos.

## 14. Não conferido

Não conferi se a guarda de rota deixa abrir as telas de termos do grupo `(auth)` com sessão ativa; se não deixar, a
`/privacidade-e-termos` monta o `LegalDocumentScreen` dentro de `(app)`. Nesse caso, o voltar de reserva dele aponta para o
cadastro (`goBackOr('/cadastro')`, `src/components/auth/LegalDocumentScreen.tsx`) e precisa apontar para o perfil. O texto da
exclusão depende do advogado.
