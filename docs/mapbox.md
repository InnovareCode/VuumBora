# Mapbox — infraestrutura e prova

Decisão do dono: Mapbox (`docs/decisoes-do-dono.md`, item 1, 18/11/2026). Este
documento cobre só a infraestrutura (instalação, token, build, prova de que
carrega). A camada de UI do mapa (telas de produto) é outra missão.

> **Pendência de registro:** `docs/decisions.md` ainda tem D-11 como "SDK de
> mapa — Em aberto". Fora da fronteira deste documento (Nova/Atlas atualizam).

## O que foi instalado

Nos dois apps (`apps/passenger`, `apps/driver`), via `npx expo install`:

- `@rnmapbox/maps` — SDK nativo (iOS/Android), plugin de config Expo.
- `mapbox-gl@^2.9.0` (resolvido em `2.15.0`) — Mapbox GL JS, usado **só no alvo
  web**. Fixado na major 2 porque é a que `@rnmapbox/maps` declara como peer
  dependency; a 3.x não foi testada contra ele.
- `@types/mapbox-gl@^2.7.0` (dev) — tipos compatíveis com a major 2.
- `@expo/env` (dev, explícito) — ver seção "monorepo e `.env`" abaixo.

`app.config.ts` dos dois apps ganhou o plugin `'@rnmapbox/maps'` (sem opções —
ver "token de download" abaixo sobre por que não precisa de mais nada).

## Por que o SDK nativo não cobre o alvo web

`@rnmapbox/maps` tem um módulo web interno (`lib/module/web/`), mas é
experimental ("Web support is work in progress, only basic map components
works" — `node_modules/@rnmapbox/maps/src/web/install.md`), não é exportado
pelo `package.json` do pacote (sem campo `browser`, `main` aponta só para o
build nativo) e pede configuração de Webpack que não existe mais neste projeto
(usamos Metro para web, não `@expo/webpack-config`). Por isso o alvo web usa
**Mapbox GL JS direto** (`mapbox-gl`), em arquivo `.web.tsx` separado — Metro/
Expo Router já escolhem esse arquivo automaticamente no alvo web e o `.tsx`
"puro" nos alvos nativos, sem configuração extra.

## Onde o token é lido

`EXPO_PUBLIC_MAPBOX_TOKEN` (prefixo `EXPO_PUBLIC_` = Expo inlina no bundle do
cliente em build time — é assim que o SDK sabe o token, não há passo manual).
Lido direto como `process.env['EXPO_PUBLIC_MAPBOX_TOKEN']` no código de cada
app. **Nenhum token está escrito em arquivo versionado** — vive só no `.env`
da raiz do monorepo (`.gitignore` já cobre `.env`/`.env.local`).

### Monorepo e `.env`: por que precisou de ajuste em `metro.config.js`

O carregador de `.env` embutido no `@expo/cli` (pacote `@expo/env`) só olha
`__dirname` do app (`apps/passenger` ou `apps/driver`) — **nunca sobe
diretório**, mesmo o Expo já detectando o monorepo para `watchFolders`. Sem
ajuste, rodar `expo start` de dentro do app não encontra o `.env` da raiz e o
token chega vazio no bundle (confirmado: a tela de prova mostrava "token
ausente" antes do ajuste).

Correção: `apps/passenger/metro.config.js` e `apps/driver/metro.config.js`
chamam `require('@expo/env').load(path.resolve(__dirname, '../..'))` antes de
`getDefaultConfig` — carrega o `.env` da raiz para `process.env` do processo
do Metro, sem sobrescrever variável já definida no ambiente (mesma regra do
próprio Expo). Zero passo manual: quem clonar o repo, colar o token no `.env`
da raiz e rodar `expo start` (de onde for) já funciona.

### Token de download (nativo, Android/iOS) — não precisa mais

Versões antigas do `@rnmapbox/maps` exigiam um segundo token, **secreto**
(`sk.`, escopo `Downloads:Read`), só para o Gradle/CocoaPods baixar o SDK
nativo no build. A Mapbox **removeu essa exigência de autenticação no
download** (confirmado em `node_modules/@rnmapbox/maps/android/install.md`:
"mapbox lifted auth requirement from downloads so MAPBOX_DOWNLOADS_TOKEN is no
longer needed"). Por isso o plugin em `app.config.ts` não recebe nenhuma
opção — o token público de runtime é o único que este projeto precisa. Se um
build futuro pedir esse token mesmo assim, ele vai via variável de ambiente
`RNMAPBOX_MAPS_DOWNLOAD_TOKEN` no momento do build (nunca em arquivo
versionado), não mais pela opção `RNMapboxMapsDownloadToken` do plugin (que o
próprio pacote marca como **deprecated**).

## O que exige development build

**Expo Go não serve** para telas nativas com Mapbox: `@rnmapbox/maps` é módulo
nativo novo, Expo Go só roda os módulos que já vêm compilados nele. Para
ver o `MapView` nativo (iOS/Android) é preciso:

1. `npx expo prebuild` (gera `ios/`/`android/` a partir do `app.config.ts`,
   com o plugin do Mapbox já aplicado), **ou**
2. um **development build** via EAS (`npx eas build --profile development`, dentro de `apps/passenger` ou
   `apps/driver`). Os `eas.json` existem nos dois apps (perfil `development` com `VUUMBORA_BUILD_PROFILE=development`;
   ver `docs/build-e-deploy.md`).

Sem isso, `expo start` em iOS/Android com um dev client comum vai falhar ao
tentar carregar o `MapView` (módulo nativo ausente). **O alvo web não tem essa
exigência** — `expo start --web` já roda o Mapbox GL JS de verdade, sem build
nenhum (é a prova que segue abaixo).

## Perfil de build e telas de desenvolvimento

`apps/passenger/metro.config.js` (idêntico ao de `apps/driver`, conferido com `cmp`) escolhe o perfil pela variável
`VUUMBORA_BUILD_PROFILE` (`development` | `preview` | `production`):

- Valor preenchido vale. Valor fora da lista aborta (`metro.config.js:52-56`). `development` com `NODE_ENV=production` aborta (`:57-62`).
- Sem a variável: `EAS_BUILD_PROFILE=production` ou `NODE_ENV=production` dão `production`; `NODE_ENV=development|test` dão
  `development` (`:71-73`). Build não interativa sem nenhum dos dois aborta (`:74-80`).
- Só `production` tira as telas de dev do bundle: tudo sob `app/(dev)/`, em qualquer nível, entra na `resolver.blockList`.
  `preview` não esconde telas de dev.
- Convenção: tela de desenvolvimento nova nasce em `app/(dev)/` e já fica fora da loja, sem editar lista.

Build `preview` ou `production` também **aborta** se a identidade for simulada (F02/B4, 22/11/2026): o modo (`mock`/
`http`) não é mais um valor fixo em `identityClient.ts` — é escolhido por TROCA DE MÓDULO em tempo de build. O arquivo
importa `./mode`, e o `resolver.resolveRequest` do `metro.config.js` redireciona esse pedido para `./mode.mock.ts`
(`development`, padrão) ou `./mode.http.ts` (`preview`/`production`, sempre; `development` com `VUUMBORA_IDENTITY=http`
no ambiente real). Fora de `development` o resolver SÓ pode apontar para `mode.http` — sem isso a build aborta, sem
exceção. Os dois apps (passageiro e motorista) já têm `src/identity/mode.http.ts`.

Não existe mais escape: `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION` foi removido do `metro.config.js` dos dois apps na
F02/B4 (22/11/2026). Nenhuma variável de ambiente libera `preview`/`production` com identidade simulada.

## Prova de que carrega (feita, não assumida)

Criada uma rota de diagnóstico em cada app — **não é tela de produto**, é só
prova de infraestrutura, descartável quando não fizer mais falta:

- `apps/passenger/app/(dev)/mapbox-check.tsx` (nativo) + `mapbox-check.web.tsx` (web)
- `apps/driver/app/(dev)/mapbox-check.tsx` (nativo) + `mapbox-check.web.tsx` (web)

A pasta `(dev)` é um grupo do Expo Router: não entra na URL, então a rota segue `/mapbox-check` (confirmado nos comentários
de `apps/passenger/metro.config.js:39-40` e no commit `0fe8883`; a URL não foi medida de novo nesta atualização).
A regra da pasta e o perfil de build estão na seção seguinte.

Testado via Playwright em `/mapbox-check`, nos dois apps, `expo start --web`:

```json
{
  "statusText": "status: mapa carregado",
  "canvasCount": 1,
  "canvasBox": { "x": 0, "y": 40, "width": 1280, "height": 680 },
  "consoleErrors": []
}
```

Captura de tela confirma o mapa renderizado (estilo escuro `dark-v11`,
região de São Paulo, atribuição Mapbox/OpenStreetMap visível, sem erro de
console). O lado nativo (iOS/Android) não pôde ser testado neste ambiente —
exige development build de verdade (ver seção acima); o código está escrito e
passa no `typecheck`, mas essa parte específica fica como prova pendente para
quem tiver o device/simulador.

## O que o dono precisa fazer no painel do Mapbox

1. **Restringir o token público (`pk.`) por URL e por app** —
   `account.mapbox.com` → Tokens → o token em uso → "URL restrictions" (listar
   os domínios de produção/preview) e as restrições de app (bundle ID iOS /
   nome de pacote Android: `com.vuumbora.passenger`, `com.vuumbora.driver`,
   provisórios — atualizar quando os definitivos existirem). **Sem isso,
   qualquer um que extrair o token do app ou de uma URL pode gastar a cota do
   dono** — token público sem restrição não é incomum, mas aqui é opcional
   deixar assim; restringir custa um clique e elimina o risco.
2. Acompanhar a cota de uso (Mapbox cobra por carregamento de mapa/geocoding
   acima da cota gratuita) — mesmo ponto já levantado em
   `docs/decisoes-do-dono.md` item 1.
3. **Não precisa** gerar o token secreto de download (`sk.`) — ver seção
   acima.

## Estilo escuro customizado — dá para fazer, e o que exige

Sim. Mapbox Studio permite criar um estilo próprio a partir de um dos estilos
escuros base (ex. `dark-v11`) e editar cor de água, estrada, parque, label etc.
até bater com a paleta do projeto (`docs/identidade-visual.md` — fora da minha
fronteira, só leitura). Dois caminhos:

1. **Editor visual (Mapbox Studio)** — o dono (ou quem ele autorizar na conta
   Mapbox) ajusta camada por camada na interface e publica; o resultado é uma
   `styleURL` (`mapbox://styles/<usuario>/<style-id>`) que substitui
   `'mapbox://styles/mapbox/dark-v11'` tanto no `MapView` nativo
   (`styleURL={...}`) quanto no `mapboxgl.Map({ style: ... })` do web — mesma
   URL nos dois alvos, sem código extra de infraestrutura.
2. **Estilo gerado por código** (JSON do Mapbox Style Spec, hospedado pelo
   próprio projeto ou embutido): mais controle, mais trabalho; só vale a pena
   se o visual exigir algo que o editor não cobre.

**O que isso exige, de verdade:** conta Mapbox do dono (a mesma do token já
criada) com acesso ao Studio — é a mesma conta, sem custo adicional de
plataforma (edição de estilo não é cobrada à parte; só o carregamento do
mapa, como qualquer outro estilo). Produzir o estilo em si (escolher cores,
validar contraste dos labels sobre o mapa) é trabalho de direção de arte, não
de infraestrutura — fica para Apolo/o dono decidirem o visual; esta seção só
confirma que o caminho técnico existe e é o mesmo de hoje (trocar uma string).

## Observação (fora do escopo desta entrega)

`npm run check` passa limpo nas partes tocadas aqui (`apps/passenger`,
`apps/driver`, `packages/tokens`, `packages/ui`, `packages/api-client`,
`packages/domain`, `check:boundaries`). No momento desta entrega, `apps/site`
— workspace novo, criado por outra missão durante esta sessão, nunca tocado
por mim — falha o `typecheck` isolado dele (`tsconfig.json` com `baseUrl`
deprecated, TS5101) e por isso `npm run check` do monorepo inteiro retorna
não-zero. Não é regressão deste trabalho; sinalizado para quem é dono de
`apps/site`.
