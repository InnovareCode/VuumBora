# Build e deploy — VuumBora

Caminho de build para os dois apps (`@vuumbora/passenger` e `@vuumbora/driver`),
via **EAS Build** (serviço da Expo). Não há deploy automatizado de app: o CI
(`.github/workflows/ci.yml`) roda checagens, testes e o ensaio de backup, sem etapa de EAS. Este documento
descreve o caminho manual, hoje.

Atualizado em 22/11/2026 (F06): identificadores confirmados pelo dono (decisão DN-07, `docs/decisoes-do-dono.md`),
ícone/splash/ícone adaptativo já entregues pela Apolo, e o dono decidiu criar agora as contas Expo e Google Play
(a Google Play guardada até o beta). O que ficava como "pendente" abaixo foi conferido de novo no código.

## Antes de tudo: as duas contas — AÇÃO DO DONO (uma vez, pode fazer agora)

Nenhuma das duas a equipe pode criar por você — login pessoal/da empresa.

### Conta Expo (organização)

1. Crie a conta em [expo.dev](https://expo.dev) — gratuita. Se for usar e-mail/organização da empresa, crie assim
   desde já (trocar depois dá mais trabalho).
2. No seu computador, autentique o terminal (uma vez por computador):
   ```
   cd apps/passenger
   npx eas login
   ```
3. Ligue cada app a um projeto Expo (grava o `projectId` em `app.config.ts` → `extra.eas.projectId`):
   ```
   npx eas init
   ```
   Repita dentro de `apps/driver` — são dois apps, dois projetos Expo separados.

Verificação: `npx eas whoami` mostra sua conta; `apps/passenger/app.config.ts` e `apps/driver/app.config.ts` passam
a ter `extra.eas.projectId` preenchido (o `eas init` edita o arquivo por você).

### Conta de desenvolvedor Google Play — guardar até o beta

Faça agora porque a verificação da conta pode levar alguns dias; **não precisa publicar nada ainda**, é só abrir a
porta para quando o app estiver pronto para um teste fechado/beta.

1. Acesse [play.google.com/console/signup](https://play.google.com/console/signup) com a conta Google que vai ser a
   dona do app (ideal: uma conta da empresa, não pessoal — é a que fica para sempre ligada aos apps).
2. Escolha o tipo de conta: **Organização/Empresa** (não "Individual"), com CNPJ do VuumBora — organização muda de
   titular mais fácil que conta individual se um dia precisar.
3. Pague a taxa única de registro (cerca de US$ 25, cartão).
4. A Google pode pedir verificação de identidade/empresa (documento, às vezes alguns dias de análise) — comece isso
   com antecedência do que pensa precisar usar.
5. **Pare aqui.** Não crie o "app" dentro do Console ainda — isso entra só quando houver uma build para subir
   (seção "Publicação nas lojas", mais abaixo), com o nome, descrição e capturas de tela definitivos.

Verificação: o Play Console abre sem pedir mais nada, e aparece o nome da conta/organização correto no canto.

## Pré-requisitos (uma vez por app, já conferidos no código em 22/11/2026)

1. Conta Expo e `projectId` — seção acima.
2. `eas.json` na raiz de cada app (`apps/passenger/eas.json`,
   `apps/driver/eas.json`), já no repo (commit `856e399`), com três perfis:
   - `development`: `developmentClient: true`, distribuição interna, Android `apk`.
   - `preview`: distribuição interna, Android `apk`.
   - `production`: distribuição `store`, Android `app-bundle` (`.aab`).

   Cada perfil define `env.VUUMBORA_BUILD_PROFILE` com o próprio nome (`development`, `preview` ou
   `production`), que é o que o `metro.config.js` lê (ver a seção abaixo).
3. **Identificadores de loja: CONFIRMADOS pelo dono em 22/11/2026** (decisão DN-07) —
   `com.vuumbora.passenger` e `com.vuumbora.driver`, já em `app.config.ts` dos dois apps. Não são mais provisórios;
   não precisam trocar antes do build de produção. (O comentário `PENDENTE` que ainda está em `app.config.ts` ficou
   desatualizado por esta decisão — sinalizado ao Atlas/Nova para a Vega limpar o comentário; não editei código
   fora da minha zona.)
4. **Ícone, splash e ícone adaptativo: entregues.** Conferido em 22/11/2026: `apps/passenger/assets/` e
   `apps/driver/assets/` têm `icon.png`, `adaptive-icon.png` e `splash-icon.png`, e `app.config.ts` já aponta para
   eles. Não é mais pendência — a linha antiga deste documento ("pendentes") estava desatualizada.
5. **`expo-dev-client`: instalado nos dois apps** (conferido em 27/11/2026 em `apps/passenger/package.json` e
   `apps/driver/package.json`, `~58.0.22`). O perfil `development` dos dois `eas.json` (`"developmentClient": true`)
   já tem o pacote de que precisa. O bloqueio anotado aqui em 22/11/2026 não existe mais.
6. `android.versionCode` **não** está fixado em nenhum `app.config.ts` — sem ele, o EAS CLI oferece gerenciar a
   versão remotamente e vai PERGUNTAR isso interativamente na primeira vez que rodar `eas build`. Responda a
   pergunta (qualquer opção serve para o primeiro build de desenvolvimento); não é preciso decidir antes.

## Primeiro build (desenvolvimento) — AÇÃO DO DONO

Depois das duas contas (o `expo-dev-client` já está instalado nos dois apps):

```bash
cd apps/passenger   # ou apps/driver
npx eas build --platform android --profile development
```

O EAS pode perguntar sobre a keystore de assinatura do Android — responda "yes"/"generate" (ele gera e guarda para
você, sem custo). O link que o terminal mostra tem o progresso e, no final, o `.apk` para baixar e instalar no
aparelho (ative "fontes desconhecidas" no Android para instalar fora da Play Store).

Verificação: o app abre no aparelho, mostra a tela inicial do VuumBora (não uma tela de erro do Expo). Se faltar
`EXPO_PUBLIC_MAPBOX_TOKEN` no ambiente `development` do projeto Expo (expo.dev > seu projeto > Environment
variables, ou `eas env:create`), o app abre mas o mapa fica em branco — não é erro de build, é variável faltando.

Se o terminal recusar algum campo do `eas.json` ou pedir algo que este roteiro não previu, não tente adivinhar —
provavelmente é uma versão de EAS CLI diferente da que validou o arquivo. Pare e chame o Vulcano com a mensagem de
erro completa.

## Perfil de build e guarda de identidade (o que `preview`/`production` fazem)

O `metro.config.js` de cada app decide o perfil (`VUUMBORA_BUILD_PROFILE`, preenchido pelo `eas.json`) e:

- **`production` tira as telas de desenvolvimento do bundle**: tudo sob `app/(dev)/` (hoje `catalogo` e `mapbox-check`,
  em `passenger`);
- **`preview` e `production` exigem identidade real**: o modo (`mock`/`http`) é escolhido por TROCA DE MÓDULO em tempo
  de build — `identityClient.ts` importa `./mode`, e o `resolver.resolveRequest` do `metro.config.js` o redireciona para
  `./mode.mock.ts` (padrão de `development`, dados de demonstração) ou `./mode.http.ts` (`preview`/`production`, sempre;
  em `development`, só com `VUUMBORA_IDENTITY=http` no ambiente real). Fora de `development`, o resolver SÓ aponta para
  `mode.http`, sem exceção — `npx eas build --platform android --profile preview|production` **aborta** se isso não
  valer (bug de configuração, não um caso esperado desde a F02/B4: os dois apps já têm `mode.http.ts`). Isso segue do
  código do Metro; o comportamento num build real do EAS não foi testado (a confirmar).
- **`preview` e `production` exigem `EXPO_PUBLIC_API_URL` em `https:`**: a build aborta sem isso, sempre — senha e
  tokens nunca podem viajar em texto claro por causa de uma URL errada numa build que sai do laptop.

Não existe mais escape para identidade simulada fora de `development` (`VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION`
foi removido na F02/B4, 22/11/2026) — nenhuma variável de ambiente libera `preview`/`production` com mock. Detalhes e
arquivos: `docs/mapbox.md`, seção "Perfil de build e telas de desenvolvimento".

## `eas submit` travado fora de `production`

`eas.json` só declara `submit.production` (Android e iOS); `eas submit --profile development|preview` falha porque o
perfil não existe no arquivo — não há lógica extra para isso, é o próprio comportamento do EAS CLI sem o perfil
declarado. Credenciais de loja (service account do Google Play, API key da App Store) ainda não foram configuradas
(a confirmar quando o dono tiver as contas).

## Build Android (.aab)

```bash
cd apps/passenger   # ou apps/driver
npx eas build --platform android --profile production
```

- Gera um `.aab` (Android App Bundle) — formato exigido pela Google Play desde
  2021 (não é mais `.apk` para publicação).
- **Credenciais Android**: EAS pode gerar e guardar a keystore de assinatura
  por você (gratuito, não depende de conta paga) — responda "yes" quando
  perguntado, ou gerencie com `npx eas credentials`.
- **O que exige conta paga do dono**: nada neste passo em si. EAS Build tem
  cota gratuita mensal de builds (plano "Free"); builds acima da cota, ou
  builds mais rápidos ("priority"), exigem plano pago da Expo (EAS
  Production/Enterprise). Publicar na **Google Play Console** exige taxa única
  de registro de desenvolvedor (~US$ 25, pagamento único, não recorrente) —
  conta do dono, não da Expo.

## Build iOS (.ipa)

```bash
cd apps/passenger   # ou apps/driver
npx eas build --platform ios --profile production
```

- Gera um `.ipa`.
- **Credenciais iOS**: exige **Apple Developer Program** (conta paga do dono,
  US$ 99/ano) para gerar certificado de distribuição e provisioning profile.
  Sem essa conta, o build iOS de produção não é possível — só builds internos
  com certificado ad-hoc/simulador, que não valem para a loja.
  `npx eas credentials` guia a criação do certificado a partir da conta Apple
  do dono; a Expo não fornece essa conta.
- EAS também pode gerenciar as credenciais automaticamente
  (`npx eas build --platform ios --profile production` pergunta e cuida do
  certificado/profile se a conta Apple já estiver logada via
  `npx eas credentials`).

## Publicação nas lojas

- **Google Play**: `npx eas submit --platform android` (usa o `.aab` do build
  acima). Exige a conta de desenvolvedor Google Play (taxa única, ver acima) e
  uma Service Account key configurada em `eas.json` ou passada por flag.
- **App Store**: `npx eas submit --platform ios` (usa o `.ipa`). Exige a conta
  Apple Developer Program ativa (anual, ver acima) e credenciais
  App Store Connect.

## Resumo do que é gratuito vs. pago

| Item | Custo |
|---|---|
| EAS Build (cota mensal gratuita) | Grátis até o limite do plano Free da Expo |
| EAS Build acima da cota / builds prioritários | Plano pago Expo (dono decide) |
| Keystore Android (gerada pelo EAS) | Grátis |
| Conta de desenvolvedor Google Play | ~US$ 25 (pagamento único, conta do dono) |
| Apple Developer Program | ~US$ 99/ano (conta do dono) — obrigatório p/ build iOS de produção e para `eas submit` na App Store |

## Pendências para o primeiro build real

- `eas.json` dos dois apps: feito (`856e399`).
- `projectId` do EAS: nasce com `npx eas init`, feito pelo dono junto com a conta (seção acima) — nada a conferir
  antes disso existir.
- `bundleIdentifier`/`package`: **resolvido** — confirmados pelo dono em 22/11/2026 (DN-07), não são mais pendência.
- Ícone, splash e adaptiveIcon (Apolo): **entregues**, conferidos no código em 22/11/2026 — não são mais pendência.
- `expo-dev-client`: **resolvido**, instalado nos dois apps (conferido em 27/11/2026) — ver seção "Pré-requisitos", item 5.
- Conta de desenvolvedor Google Play: o dono vai criar agora (seção "Antes de tudo"), guardada até o beta — não é
  mais pendência de "existir", só de uso (criar o app no Console) quando houver build para subir.
- Conta Apple Developer Program ativa, se o alvo for iOS — não entrou na decisão de 22/11/2026; continua em aberto.

## Pendências para antes da loja (anotadas em 27/11/2026, sem resolver)

Não bloqueiam o primeiro build de desenvolvimento nem o `preview`. Só importam para o build que vai à loja.
Achadas no `npx expo config --type introspect` dos dois apps.

- **Android: `SYSTEM_ALERT_WINDOW` ("sobrepor a outros apps") nos dois apps.** Vem do modelo de manifesto do Expo
  (`expo-template-bare-minimum`, marcado lá como "OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT NEED"), não de
  código nosso. Nenhum dos dois apps usa. Ela aparece na lista de permissões da ficha da Play. A decisão é se ela sai do
  build de loja por `android.blockedPermissions` no `app.config.ts`, só no perfil `production` ou em todos. Antes,
  é preciso conferir se alguma ferramenta de desenvolvimento depende dela.
- **iOS: `NSLocalNetworkUsageDescription` em inglês nos dois apps** ("Expo Dev Launcher uses the local network...").
  Vem do plugin do `expo-dev-client`. Lendo o plugin (`expo-dev-launcher`, `withDevLauncher.js`): ele acrescenta uma
  fase de build no Xcode que **apaga essa chave nos builds de release**, mas só se o texto ainda for o padrão (contém
  "Expo Dev Launcher"). Por isso **não traduza esse texto**: traduzido, a fase de build deixa de reconhecê-lo e ele
  vai para a loja. Falta provar no primeiro `.ipa` de produção que a chave sumiu do `Info.plist` (só dá com conta
  Apple e build iOS de verdade).
