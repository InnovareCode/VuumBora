# Build e deploy — VuumBora

Caminho de build para os dois apps (`@vuumbora/passenger` e `@vuumbora/driver`),
via **EAS Build** (serviço da Expo). Não há deploy automatizado de app: o CI
(`.github/workflows/ci.yml`) roda checagens, testes e o ensaio de backup, sem etapa de EAS. Este documento
descreve o caminho manual, hoje.

## Pré-requisitos (uma vez por app)

1. Conta Expo (gratuita) e CLI autenticado: `npx eas login`.
2. `eas.json` na raiz de cada app (`apps/passenger/eas.json`,
   `apps/driver/eas.json`), já no repo (commit `856e399`), com três perfis:
   - `development`: `developmentClient: true`, distribuição interna, Android `apk`.
   - `preview`: distribuição interna, Android `apk`.
   - `production`: distribuição `store`, Android `app-bundle` (`.aab`).

   Cada perfil define `env.VUUMBORA_BUILD_PROFILE` com o próprio nome (`development`, `preview` ou
   `production`), que é o que o `metro.config.js` lê (ver a seção abaixo). Confirmar se o `projectId` do EAS
   (`extra.eas.projectId` em `app.config.ts`) já foi gravado: a confirmar, não verificado nesta atualização.
3. Identificadores de loja definitivos. Hoje `app.config.ts` usa provisórios
   (`com.vuumbora.passenger`, `com.vuumbora.driver`) — ver "Decisões em aberto"
   no `PROGRESSO.md`. Trocar antes do primeiro build de produção, porque o
   identificador vira parte do artefato e é caro de mudar depois de publicado.
4. Ícone/splash/adaptiveIcon: pendentes (ver comentários `PENDENTE (Apolo)` em
   `app.config.ts`). EAS builda sem eles (usa placeholder padrão do Expo), mas
   não é o artefato final de loja.

## Perfil de build e guarda de identidade (o que o `production` faz)

O `metro.config.js` de cada app decide o perfil (`VUUMBORA_BUILD_PROFILE`, preenchido pelo `eas.json`) e, em `production`:

- **tira as telas de desenvolvimento do bundle**: tudo sob `app/(dev)/` (hoje `catalogo` e `mapbox-check`, em `passenger`);
- **aborta se a identidade for simulada**: `IDENTITY_MODE` precisa ser `'http'`. Hoje o passageiro está em `'mock'` e o
  motorista não tem `src/identity/`. Resultado: `npx eas build --platform android --profile production` **falha** nos dois
  apps enquanto não houver identidade real (B4/A3 no passageiro; B2 no motorista; ver `docs/plano-apps-execucao.md`).
  Isso segue do código do Metro; o comportamento num build real do EAS não foi testado (a confirmar).

Escape temporário, só para exportar e provar a A1: `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1` (só o valor `1`; cada uso
imprime aviso). Não pode ir para a loja. Como o EAS injeta essa variável no build: a confirmar (o Metro só lê
`process.env`, verificado; o caminho pelo painel do EAS não foi testado). Detalhes e linhas: `docs/mapbox.md`, seção
"Perfil de build e telas de desenvolvimento".

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

- `eas.json` dos dois apps: feito (`856e399`). Falta confirmar o `projectId` do EAS (a confirmar).
- Resolver os `bundleIdentifier`/`package` definitivos (dependem de domínio/
  conta das lojas do dono — ver `PROGRESSO.md`).
- Ícone, splash e adaptiveIcon (Apolo) antes do build de produção — build de
  desenvolvimento roda sem eles.
- Conta Apple Developer Program ativa, se o alvo for iOS.
