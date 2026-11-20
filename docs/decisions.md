# VuumBora — Registro de decisões técnicas

Formato: cada decisão tem contexto, opções avaliadas, escolha e consequência.
Status possíveis: **Aceita**, **Proposta** (aguarda confirmação), **Substituída**.
Autora inicial: Nova (arquitetura), 2026-11-18.

## Contexto assumido (hipóteses declaradas)

| Dimensão | Hipótese | Efeito na arquitetura |
|---|---|---|
| Maturidade | Protótipo navegável (Fase 1), depois MVP transacional | Sem backend, sem build de pacotes, sem orquestrador de tarefas |
| Escala inicial | Uma cidade, centenas a poucos milhares de usuários | Monorepo simples; nada de microfrontends/microserviços |
| Equipe | Pequena (squad de agentes + dono), um único repositório | Ferramentas com o menor número de peças móveis |
| Plataformas | iOS e Android, retrato, dark mode | Expo gerenciado, CNG (sem pastas `ios/`/`android/` versionadas) |

Se alguma hipótese mudar (ex.: várias cidades no lançamento, time grande), revisar D-02 e D-03.

---

## D-01 — Navegação: Expo Router (sobre React Navigation) — Aceita

A spec exige "adotar apenas uma navegação".

| Opção | Prós | Contras |
|---|---|---|
| **Expo Router** | Rotas por arquivo, deep links e URLs automáticos (útil para links de corrida/compartilhamento e notificações); rotas tipadas (`typedRoutes`); `Stack.Protected` para rotas autenticadas, que atende "proteger telas autenticadas" de forma declarativa; mantido pela Expo junto com o SDK | Rotas precisam ficar em `app/` de cada app (não podem ser compartilhadas por pacote); convenção de pastas a aprender; menos liberdade para navegação dinâmica |
| React Navigation puro | Controle total, API madura, navegadores configurados em código | Deep linking e tipagem de rotas configurados à mão em dois apps; guarda de autenticação a construir; mais código repetido |

**Escolha:** Expo Router. Ele é React Navigation por baixo (Stack/Tabs são os mesmos navegadores), então nada se perde se precisarmos de um navegador customizado. A limitação "rotas só dentro do app" é, aqui, uma **vantagem**: força que o fluxo de passageiro e o de motorista não se misturem.

**Consequências:** cada app terá `app/(auth)/` (público) e `app/(app)/` (protegido). Bloquear navegação incoerente em corrida ativa será feito com rotas protegidas por fase de corrida, não por `navigation.reset` espalhado.

## D-02 — Gerenciador de workspaces: npm workspaces — Aceita

| Opção | Prós | Contras |
|---|---|---|
| **npm workspaces** | Já vem com o Node, zero ferramenta extra (Windows sem corepack); `workspaces` no `package.json` raiz; suportado pelo Expo, que autoconfigura Metro para monorepo (SDK 52+) | Mais lento e usa mais disco que pnpm; sem "catalog" de versões (usamos `overrides` na raiz para garantir uma única cópia de `react`/`react-native`) |
| pnpm | Rápido, econômico em disco, estrito contra dependências fantasmas | Com React Native costuma exigir `node-linker=hoisted`, o que anula boa parte da estritez; mais uma ferramenta para o CI e para a máquina do dono |
| Yarn (Berry) | Workspaces maduros, constraints | PnP não funciona com Metro; no modo `node-modules` vira um npm com mais configuração |

**Escolha:** npm workspaces. O ganho do pnpm não se paga num repo de 2 apps e 4 pacotes, e a estritez dele seria desligada pelo React Native de qualquer forma.
**Sem Turborepo/Nx por ora:** não há etapa de build nos pacotes (D-03); reavaliar quando o CI ficar lento.
**Versões:** `overrides` na raiz fixam `react`/`react-native` para evitar duas cópias (causa clássica de "Invalid hook call" em monorepo).

## D-03 — Pacotes internos só em código-fonte TS (sem build) — Aceita

`main`/`exports` dos pacotes apontam para `src/*.ts`; o Metro transpila tudo. Evita watchers e `dist/` desatualizados. Cada pacote tem `typecheck` próprio, e a raiz roda `npm run typecheck` em todos.
Reavaliar só se um pacote precisar ser publicado fora do monorepo.

## D-04 — Separação passageiro × motorista — Aceita

Dois apps independentes (`apps/passenger`, `apps/driver`), não um app com dois perfis. Motivos: permissões diferentes (motorista precisa de localização em segundo plano, passageiro não, e isso pesa na revisão das lojas), ciclos de release independentes, e a regra "não misturar regras".

Como a separação é garantida:
1. Núcleo comum só com tipos e regras iguais para os dois (`@vuumbora/domain`, `@vuumbora/api-client`).
2. O que é de um perfil fica em subcaminho próprio: `@vuumbora/domain/passenger`, `@vuumbora/domain/driver`, idem no `api-client`.
3. Componentes de um único perfil (ex.: `RideOfferCard`, `RideCategoryCard`) ficam em `apps/<perfil>/src/components`, não em `@vuumbora/ui`.
4. `npm run check:boundaries` (`scripts/check-boundaries.mjs`, só Node) falha se um perfil importar o outro ou se um pacote importar um app. Testado nos dois sentidos (passa com o repo limpo e falha com uma violação de propósito).

## D-05 — Tokens: fonte única no JSON do design system — Aceita

`@vuumbora/tokens` importa diretamente `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` e só converte o formato (`"16px"` vira `16`, peso vira `'700'`). Não existe cópia do JSON.
- `tokens`: primitivos 1:1. `theme.role`: papéis semânticos (CTA, superfície, texto...) que apenas apontam para primitivos.
- `app.config.ts` dos apps lê o mesmo JSON para a cor de fundo, então nem a configuração nativa tem HEX.
- `check:boundaries` falha com qualquer HEX em `apps/` ou `packages/`.
- Consequência: quando o Apolo validar a paleta real, a mudança é **só no JSON**.

## D-06 — `codigo/theme.ts` do kit é legado e não é usado — Aceita

Divergências encontradas entre `codigo/theme.ts` e o JSON (fonte de verdade, ordem 3 do DESIGN_SYSTEM_MESTRE §2):
- faltam `brand.navy`, `background.input`, `text.muted`, `border.emphasis`, `semantic.warning`, `semantic.info` e todas as cores de `map.*`;
- nomes diferentes (`primary` × `brand.yellow`, `radius.card` × `radius.lg`, `radius.large` × `radius.xl`);
- espaçamento por nome (`xs`, `sm`...) × escala numérica (`1`..`10`), sem o degrau de 40/48/64 px;
- falta `typography.display` (34) e os tokens de `layout`/`opacity`.

Nenhum código importa `theme.ts`. Ninguém deve copiar valores dele.

**Divergência imagem × tokens:** a validação de cor contra a logomarca está com o Apolo (missão própria). Este scaffold não altera nenhum valor.

## D-07 — Versão do Expo SDK — Proposta (Vulcano confirma)

Os `package.json` dos apps declaram **Expo SDK 54** (React Native 0.81, React 19.1, Expo Router 6), versões que conheço com segurança. Não consegui confirmar qual é o SDK mais recente nesta data (busca indisponível).
**Ação da missão de DevOps:** decidir se sobe para o SDK estável atual, então rodar `npx expo install --fix` em cada app para alinhar as versões compatíveis. Não alterar versões à mão.

## D-08 — Código nativo gerado (CNG) — Aceita

`ios/` e `android/` estão no `.gitignore`; são gerados por `expo prebuild`/EAS a partir do `app.config.ts`. Configurações nativas entram por config plugins. Reavaliar só se algum SDK de mapa/pagamento exigir código nativo sem plugin.

## D-09 — Dados: portas e adaptadores com modo explícito — Aceita

`@vuumbora/api-client` define **interfaces** (portas) consumidas pelas telas. Cada porta terá adaptador `mock` (Fase 1) e `http` (Etapa E), em arquivos separados.
- `ClientConfig.mode` é obrigatório e **sem default**: nenhuma chamada pode ser silenciosamente falsa.
- Toda resposta traz `origin: 'mock' | 'real'`; a UI exibe um selo de demonstração quando `mock`.
- Erro tem contrato único (`ApiError` com `kind`) para as telas mapearem para estados de erro/retry.
- Ações críticas (solicitar, aceitar oferta, cancelar) exigem `idempotencyKey` (sem corrida duplicada em reconexão).
- Mapa, pagamento e notificações entram também atrás de portas, nunca chamados direto da tela.

Os contratos são **propostas** até a especificação de backend.

## D-10 — Bibliotecas previstas (ainda não declaradas) — Proposta

Seguem a spec e entram quando a primeira tela precisar, não antes: TanStack Query (estado remoto), Zustand (estado local, só se Context não bastar), React Hook Form + Zod (formulários), `expo-font` + Inter (OFL), Lucide (`lucide-react-native`) para ícones, Jest + React Native Testing Library. E2E (Maestro ou Detox) a decidir pela Íris.

## D-11 — SDK de mapa — Aceita (Mapbox, 18/11/2026)

Google Maps (`react-native-maps`) × Mapbox. Dependia de custo por volume, termos de uso e estilo escuro customizável.

**Escolha: Mapbox**, decidida pelo dono em 18/11/2026 (`docs/decisoes-do-dono.md`, decisão 1). Conta criada por ele, token público no `.env` local — **nunca no repositório**.

**Consequências:** rota e matriz são calculadas **no servidor**, com cache, para o token do app não pagar a conta de chamadas indevidas (risco R14 do `plano-sistema.md`). No protótipo, o mapa continua atrás de uma porta com implementação estática (sem SDK), então a Fase 1 segue sem depender disto.

**Pendência aberta desde 18/11:** restringir o token no painel do Mapbox por URL e por identificador de app.

---

## Ambiguidades de produto que NÃO bloqueiam o protótipo

O protótipo segue com dados de demonstração sinalizados; cada item abaixo precisa de resposta antes do MVP transacional.

1. **Paleta final:** os HEX do JSON são "propostos" (status no próprio arquivo). Validação com Apolo em andamento.
2. **Fonte:** Inter confirmada ou outra com licença definida.
3. **Login:** celular + código (SMS/WhatsApp) ou e-mail + senha? As specs P02/M01 citam senha; o padrão do mercado é código.
4. **Mesma pessoa nos dois papéis:** uma conta com dois perfis ou contas separadas?
5. **Categorias de veículo** e o que diferencia cada uma.
6. **Cálculo de tarifa:** fórmula, tarifa dinâmica, divergência entre estimativa e final.
7. **Métodos de pagamento:** Pix, cartão, dinheiro? Existe carteira/saldo (P12 condiciona ao modelo financeiro)?
8. **Taxa da plataforma e repasse ao motorista** (M10/M11), e quando o motorista recebe.
9. **Regras de cancelamento:** janela grátis, taxa, quem pode cancelar em cada fase.
10. **Oferta ao motorista:** tempo de expiração; destino visível antes do aceite ("quando permitido")?
11. **Distribuição de corridas:** uma oferta por vez ou para vários motoristas ao mesmo tempo?
12. **Documentos do motorista** exigidos pela cidade de lançamento (CNH com EAR, CRLV, antecedentes...).
13. **Contato passageiro × motorista:** chamada/chat mascarados por qual provedor?
14. **Ações de segurança** (P09/M09/P14/M14): o que o botão faz de fato (compartilhar viagem, ligar 190, central própria)?
15. **Avaliação:** só passageiro avalia, ou bidirecional?
16. **Agendamento, promoções/cupons, "motorista verificado", suporte 24h:** aparecem nos mockups; tratar como proposta até confirmação (DESIGN_SYSTEM_MESTRE §9).
17. **Cidade(s) de lançamento**, que definem regulação e SDK de mapa.
18. **Identificadores de loja** (`com.vuumbora.*` é provisório) e nomes nas lojas.
19. **Ícone e splash** de cada app a partir da logomarca aprovada (Apolo).

## D-12 — Paginação do painel: por página, não por cursor — Aceita (20/11/2026)

Reverte, **só para as listas do painel administrativo**, a escolha feita na
primeira fatia do Admin v0.

**Contexto.** A lista de candidaturas nasceu com paginação por cursor
("Carregar mais"). O dono pediu o padrão do painel do ModaShop: contador
"mostrando 1–24 de 24" e a opção de escolher quantos registros por página.
Cursor **não sabe o total** e não permite pular para uma página — por
desenho, não por limitação de implementação.

| | Cursor (keyset) | Por página (offset + total) |
|---|---|---|
| Total de registros | não tem | tem |
| Pular para a página N | não | sim |
| Escolher quantos por página | funciona, mas sem contexto de quanto falta | é o ponto |
| Linha pulada ou repetida quando chega registro novo durante a navegação | **nunca** | possível |
| Custo da contagem | zero | um `COUNT` por consulta |

**Escolha: por página**, com `COUNT` e ordenação com critério de desempate
estável (`created_at DESC, id DESC`).

**O que estamos trocando, dito com todas as letras:** a garantia de que
nenhuma linha é pulada. Essa garantia custou um bug real — paginação perdia
registro quando duas candidaturas tinham o mesmo instante até o
microssegundo (`feedback_cursor_pagination_timestamp_precision`) — e foi
provada percorrendo 27 registros em 6 páginas. Num volume de lista
administrativa, o efeito de offset é raro e pequeno; saber **quantas**
candidaturas existem é informação usada toda vez que a tela abre.

**Onde NÃO vale:** qualquer lista que vire fonte de conferência financeira ou
de exportação completa volta a ser cursor. Perder uma linha num extrato é
outra categoria de problema.

**Consequência de desenho:** a paginação entra como **peça reutilizável**,
não como código da tela de candidaturas — a próxima lista (documentos,
financeiro, suporte) herda, em vez de inventar a sua.
