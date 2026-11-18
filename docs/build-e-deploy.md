# Build e deploy — VuumBora

Caminho de build para os dois apps (`@vuumbora/passenger` e `@vuumbora/driver`),
via **EAS Build** (serviço da Expo). Não há deploy automatizado ainda (sem CI
configurado) — este documento descreve o caminho manual, hoje.

## Pré-requisitos (uma vez por app)

1. Conta Expo (gratuita) e CLI autenticado: `npx eas login`.
2. `eas.json` na raiz de cada app (`apps/passenger/eas.json`,
   `apps/driver/eas.json`) com os perfis `development`, `preview` e
   `production`. Ainda não existe neste repo — criar com `npx eas build:configure`
   dentro de cada app na primeira vez (ele detecta o `app.config.ts` e grava
   o `projectId` do EAS em `extra.eas.projectId`).
3. Identificadores de loja definitivos. Hoje `app.config.ts` usa provisórios
   (`com.vuumbora.passenger`, `com.vuumbora.driver`) — ver "Decisões em aberto"
   no `PROGRESSO.md`. Trocar antes do primeiro build de produção, porque o
   identificador vira parte do artefato e é caro de mudar depois de publicado.
4. Ícone/splash/adaptiveIcon: pendentes (ver comentários `PENDENTE (Apolo)` em
   `app.config.ts`). EAS builda sem eles (usa placeholder padrão do Expo), mas
   não é o artefato final de loja.

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

- Rodar `npx eas build:configure` em cada app (cria `eas.json` + `projectId`).
- Resolver os `bundleIdentifier`/`package` definitivos (dependem de domínio/
  conta das lojas do dono — ver `PROGRESSO.md`).
- Ícone, splash e adaptiveIcon (Apolo) antes do build de produção — build de
  desenvolvimento roda sem eles.
- Conta Apple Developer Program ativa, se o alvo for iOS.
