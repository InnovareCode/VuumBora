---
name: project_driver_identity_b2
description: Fatia B2 (22/11/2026) — identidade do MOTORISTA sobre o createIdentityClient (accountType 'driver', mock, memória); rotas e pontos únicos, a regra "conta não é cadastro de motorista" na copy, o que foi para packages/ui, o que foi provado e o que só se prova em aparelho.
metadata:
  type: project
---

**Réplica da B1+B3 do passageiro em `apps/driver`** (sem importar de `apps/passenger`: `check-boundaries`). Mesmos arquivos-ponto-único em
`apps/driver/src/{identity,legal,lib,navigation,schemas,session,components/auth,components/legal}`; ver [[project_passenger_identity_b1]] e
[[project_passenger_consent_b3]] para o desenho (safeCall, authFlowStore, legalModel puro, portão do reaceite no layout de `(app)`).
`identityClient.ts` tem UMA `const IDENTITY_MODE = 'mock' as const;` (a guarda do `metro.config.js` lê por texto; com o arquivo presente ela
passou a ver 'mock' e ABORTA o production sem o escape — antes o arquivo não existia).

**Rotas do motorista (diferem do passageiro):** `(auth)`: `entrar` (M01 = boas-vindas+login numa tela, é a âncora e o `redirectTo` da guarda),
`criar-conta`, `codigo`, `esqueci-senha`, `redefinir-senha`, `termos`, `privacidade`; `+not-found.tsx` + `['expo-router',{sitemap:false}]`. Não há tela
"boas-vindas" separada (a spec M01 é "Boas-vindas/login" numa tela). "Entrar" a partir de criar-conta usa `router.dismissTo('/entrar')`.
testIDs: `entrar-*`, `conta-*` (criar conta), `codigo-*`, `esqueci-*`, `redefinir-*`, `reaceite-*`, `driver-sign-out-button`, `home-registration-notice`.

**REGRA DE COPY (plano, princípio 5): conta ≠ cadastro de motorista.** Nenhum literal de texto do app usa "cadastro/cadastrar/cadastrado" para falar da
CONTA. `authErrors.ts` do motorista difere do passageiro em 6 textos (consent_unavailable = "A criação de contas ainda não está aberta", email_taken
= "conta de MOTORISTA", "criar a conta de novo", "ao criar a conta"...). Um único bloco com o fato: `components/auth/RegistrationNotice.tsx`
("o cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas"; usado em criar-conta e na Home). Sem data,
sem percentual. Prova: varredura de literais pela AST do TypeScript (só 3 literais com "cadastr": 2 no aviso + `OnlineToggle.tsx:78` do protótipo,
inalcançável porque `registrationApproved = true`) + varredura do DOM (texto e aria-label) em todo estado. O `aria-label` do selo da Home dizia
"Cadastro de motorista aprovado" → virou "Selo de motorista aprovado (exemplo)".

**Dependências:** `apps/driver/package.json` ganhou `zod`, `zustand`, `react-hook-form`, `@hookform/resolvers` (mesmos intervalos do passageiro, já resolvidos
na raiz; `npm ci --dry-run` passa). O `package-lock.json` NÃO foi atualizado (fora da cerca `apps/driver`+`packages/ui`; a escrita foi negada): o próximo
`npm install` acrescenta as 4 linhas à entrada `apps/driver`.

**Foi para packages/ui:** `InputCore` (anel de foco em campo inválido) — ver [[bug_inputcore_foco_invisivel_em_campo_invalido]] — e `InlineAlert`
ganhou `announce` (padrão `true`; `false` = aviso ESTÁTICO sem `role`/aria-live/`announceForAccessibility`, usado pelo `RegistrationNotice` para o leitor
de tela não ser interrompido toda vez que criar-conta/Home abre). Os dois afetam o passageiro (o segundo só se ele passar a prop).
`AuthHeader`/`AuthErrorAlert`/`ConsentReacceptScreen`... ficaram DUPLICADOS nos dois apps (não dá para mover sem tocar `apps/passenger`): dívida a quitar
numa fatia que toque os dois.

**Home (M05) continua protótipo:** troquei só a sessão (selo "acesso simulado" quando mock, aviso `RegistrationNotice context="home"`, "Sair da conta" real).
Mantém `registrationApproved = true`, "Carlos Santos" etc. com MockBadge — a M03/M04 troca por estado do servidor.

**Provado (web, Playwright, 3 motores, 320 px, dev server):** ver o handoff — 5 roteiros (fluxo, códigos, reaceite, geometria, foco) + export de produção
servido estático + 682 verificações de unidade (19 códigos × 6 contextos) + 7 mutações pegas (anel, copy ×2, desmarcar aceites, versão constante, portão, announce).
Armadilha de prova: o Firefox torna a área de rolagem do `AppShell` (cobre a janela toda) uma parada de Tab cujo anel cai fora da janela — não é controle da tela;
o detector de foco a ignora e a conta à parte. **NÃO provado
(só aparelho):** teclado cobrindo campo, área segura, anúncio do VoiceOver/TalkBack, `uuid.v4()` nativo, BackHandler do Android na subtela do reaceite,
Back do Android nas telas, autofill/colar código, SecureStore (A3), `Linking.openURL` do texto real, API real (nunca tocada), boxShadow do anel no Android.
