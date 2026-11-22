# Ferramenta do portão de qualidade de tela

Implementa `docs/padrao-premium-telas.md` §14 (portão G-01 a G-28, §14.2 regressão
visual por captura, §14.3 sondas automáticas) para as telas de login, cadastro e
boas-vindas dos dois apps — o escopo desta rodada (F09, onda 0, parte a). Mora em
`tools/qualidade-tela/`. Não altera nenhum app; só lê o `expo export --platform web`
que já existe, ou que você gera com o comando `exportar` abaixo.

## Como rodar

Pré-requisito: Playwright e `pngjs` **não são dependências do projeto** (pedido do
Vulcano: não mexer em `package.json`/`package-lock.json` da raiz, porque a Lyra é a
única pessoa no lock agora). A ferramenta reaproveita o que o `npx` já baixou e
deixou em cache nesta máquina (`npm config get cache`\`/_npx/*/node_modules/`). Se
nunca rodou `npx playwright ...` aqui, rode `npx playwright --version` uma vez para
baixar o pacote (os navegadores Chromium/WebKit em si, em
`%LOCALAPPDATA%\ms-playwright` no Windows, você já deve ter de outras sondas da
equipe). Sem isso, qualquer comando abaixo falha com uma mensagem que diz
exatamente o que rodar — nunca em silêncio (`lib/resolve-dep.mjs`).

```bash
cd tools/qualidade-tela

node cli.mjs exportar                 # expo export --platform web dos dois apps
node cli.mjs capturar                 # matriz tela x estado x tamanho -> .saida/capturas
node cli.mjs linha-base               # promove .saida/capturas -> .baseline (só depois de aprovar)
node cli.mjs comparar                 # compara .saida/capturas (ou --capturas <dir>) contra .baseline
node cli.mjs sondas                   # estilo, geometria, texto, contraste, foco e ativação de links (§14.3)
node cli.mjs lado-a-lado              # G-07b: recorte da prancha + captura 390x844 lado a lado
node cli.mjs autoteste                # controle negativo: prova que o comparador detecta mudança de verdade
node cli.mjs tudo                     # exportar + capturar + sondas + lado-a-lado + comparar (se houver linha de base)
```

Todo comando aceita `--telas P01,M01` para rodar só um subconjunto (ver os IDs em
`screens.config.mjs`). `node cli.mjs ajuda` lista as opções de cada um.

### O comando `exportar` e o perfil de build

`apps/<app>/metro.config.js` exige um `VUUMBORA_BUILD_PROFILE` explícito (fatia F02,
22/11/2026): `development` usa identidade simulada (dados de demonstração, sem API)
e é o perfil certo para esta ferramenta — **não existe mais** o escape antigo
(`VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION`); `preview`/`production` agora abortam
a build sem exceção se a identidade não for `'http'`.

`cli.mjs exportar` já roda com:

```
VUUMBORA_BUILD_PROFILE=development
EXPO_PUBLIC_API_URL=http://localhost:3101   (placeholder; as telas desta rodada usam identidade mock e não chamam a API de verdade)
npx expo export --platform web --dev --output-dir dist
```

O `--dev` é obrigatório: **testei e confirmei** que `expo export` sem `--dev` força
`NODE_ENV=production` por dentro do processo filho, não importa o que se passe no
`env` do `execSync` — e `development` com `NODE_ENV=production` é exatamente a
combinação que a guarda do `metro.config.js` recusa ("build de release com telas de
desenvolvimento e identidade simulada dentro"). `--dev` é o único jeito de pedir um
export `development` de verdade pela CLI.

## Onde fica a linha de base (decisão do Vulcano)

**Hoje:** `tools/qualidade-tela/.baseline/`, local e **fora do git**
(`tools/qualidade-tela/.gitignore`). Nunca comitada.

**Por quê:** o padrão estima ~260 PNGs só nas primeiras 11 fichas (§14.2); com as
~20 fichas do inventário completo, a linha de base inteira passa de 1000 imagens.
Pôr isso no git deixaria o repositório pesado para sempre (imagem binária não
comprime bem em diff, e git nunca esquece um blob antigo sem reescrever histórico).
Por isso a recomendação é **não versionar a linha de base no mesmo repositório do
código** — guardar em:

- um bucket de objeto (S3/R2/Backblaze) com versionamento próprio, ou
- um repositório Git LFS dedicado, ou
- uma pasta de rede/compartilhada que o CI e quem roda localmente montem igual.

A ferramenta já está pronta para isso: `QUALIDADE_TELA_BASELINE_DIR=<caminho>` (variável
de ambiente) aponta `lib/paths.mjs` para qualquer pasta — local, rede ou um
bucket montado como disco. **Decisão em aberto para o Atlas/dono:** qual dos três
acima usar; esta ferramenta funciona com qualquer um, só muda a variável.

`node cli.mjs linha-base` é uma promoção manual (`.saida/capturas` → `.baseline`
ou para onde `QUALIDADE_TELA_BASELINE_DIR` apontar) — só rode depois de alguém
(Íris/Apolo) aprovar as capturas novas, nunca automaticamente.

## Mapeamento G-xx -> sonda/comando

| G-xx | O que o padrão pede | Onde está | Status |
|---|---|---|---|
| G-02, G-03, G-04, G-05, G-06 | assinatura premium, cor nos tokens, contagem de amarelo, tipografia | `lib/probes/estilo.mjs` | **parcial** — inventaria toda caixa; só G-03 (cor fora do conjunto) e G-04 (contagem de amarelo) viram achado automático. Ver "O que não foi validado": não conta amarelo vindo de gradiente |
| G-09, G-11 (indício), G-12, G-13 (indício), G-21 | viewport, CTA visível sem rolar, sobreposição, alvo de toque | `lib/probes/geometria.mjs` | funcional |
| G-10 | truncamento de texto | `lib/probes/texto.mjs` | funcional (sem lista de exceção — nenhuma tela desta rodada precisa) |
| G-20 | contraste de texto | `lib/probes/contraste.mjs` | funcional sobre fundo sólido; fundo com imagem/gradiente fica "não medido" (ver limitações) |
| G-22 (ordem de tabulação + anel visível) | Tab percorre os interativos, anel de foco visível no Chromium e no WebKit | `lib/probes/foco.mjs` | **adaptação do `ring6.mjs`/`ring.mjs` que a Íris deixou na passada 6** — mede o recorte focado × desfocado e exige contraste ≥ 3:1 em ≥ 60% de cada um dos 4 lados (não só `outline-style !== 'none'`), mais o controle de mouse (pressionar com o mouse não pode acender o mesmo anel). Hoje só roda no Chromium pela matriz principal — ver limitações sobre o WebKit |
| G-22 (Enter e Espaço ativam) | ativação por teclado, refinada para `role="link"` | `lib/probes/ativacao-links.mjs` | **adaptação do `q4.mjs`** da Íris: Enter ativa; Espaço, Alt+Enter e segurar Enter (auto-repeat) não; controle — o clique de mouse tem que ativar, senão o link está morto e o resto não prova nada |
| G-07b | comparação lado a lado com o alvo de 22/11 | `lib/side-by-side.mjs`, comando `lado-a-lado` | monta a imagem e o gabarito da tabela de 8 linhas; **quem julga "confere/diverge" é humano** (Íris/Apolo), a ferramenta não decide layout |
| G-14 a G-16, G-23, G-24 (telas de aparelho/emulador) | fonte 200%, teclado, safe area, TalkBack | — | **fora do escopo desta ferramenta** (ela só roda em navegador/Expo Web) |
| G-17, G-18, G-19, G-25 a G-28 | estados, honestidade de conteúdo, `onPress` vazio, movimento | — | não automatizado nesta rodada (ver abaixo) |

## O que esta ferramenta NÃO validou

1. **O autoteste e a primeira matriz completa foram rodados com um export agora
   impossível de reproduzir pelo comando `exportar`.** Entre a primeira rodada
   (bem-sucedida, com o escape `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION`, hoje
   removido) e o fim desta tarefa, `apps/passenger` e `apps/driver` passaram a ter
   `src/identity/mode.ts` + `mode.http.ts` + `mode.mock.ts` (arquivos novos,
   **não commitados** no momento em que escrevo isto) e um resolver em
   `metro.config.js` que deveria redirecionar `./mode` para um dos dois — e esse
   redirecionamento **não está terminado**: toda tentativa de export com `--dev`
   nesta janela falhou em runtime com `src/identity/mode.ts foi carregado
   diretamente — o metro.config.js deveria ter redirecionado...`. Confirmei que é
   trabalho em andamento (`git status` mostra os arquivos como modificados/novos,
   não é bug desta ferramenta) e não tentei consertar código de outro agente em
   voo. **A linha de base em `.baseline/` (40 PNGs, 5 telas × 2 estados × 4
   tamanhos) e os relatórios em `.saida/` foram gerados ANTES disso, com conteúdo
   real renderizado (não páginas em branco) — ver prova abaixo — mas
   `node cli.mjs exportar` vai falhar até a fatia que mexe em `mode.ts` terminar.**
   Quando terminar, rode `node cli.mjs tudo` de novo para gerar uma linha de base
   limpa com o export funcionando.
2. **Armadilha real encontrada e corrigida:** a primeira versão do `capture.mjs`
   esperava só 150ms depois do `load` antes de tirar a foto — o bundle do RN Web
   (3-4 MB) ainda não tinha montado nada, e as primeiras 40 capturas (e a primeira
   rodada de sondas) saíram **completamente em branco**, sem que nenhum erro
   acusasse isso (o comparador dava "tudo OK" comparando branco com branco). Só
   apareceu ao abrir os PNGs manualmente e ao ver que as sondas de geometria/foco
   achavam zero elementos. Corrigido com `page.waitForFunction(() =>
   document.body.innerText.trim().length > 10)` antes de qualquer captura ou
   sonda. **Lição para quem mexer nisto depois: sempre abra pelo menos um PNG da
   captura a olho antes de confiar num "0 reprovadas".**
3. **G-04 (contagem de amarelo) não enxerga o CTA**, porque o botão amarelo usa
   `background-image: linear-gradient(...)` (gradiente), e a sonda hoje só
   verifica `background-color` sólida. Confirmado nos dados reais: o CTA de P01
   aparece no inventário com `temGradiente: true` e `backgroundColor: rgba(0,0,0,0)`,
   e a contagem de amarelo deu 0 apesar do CTA amarelo estar lá. Caminho para
   consertar: extrair as cores das paradas do `linear-gradient(...)` com um regex
   (a mesma função `cssCorParaRgb` de `lib/tokens.mjs` já quase serve) — não fiz
   por tempo.
4. **G-20 (contraste) não mede texto sobre imagem/gradiente** (ex.: o título de
   P01 sobre a foto do fundo) — fica em "não medido". Medir isso de verdade exige
   amostrar o pixel renderizado atrás do texto (um recorte da captura, não CSS
   computado), que é factível com a mesma infraestrutura de `anel-utils.mjs` mas
   não foi construído.
5. **O anel de foco (G-22) só rodou no Chromium na matriz principal.** O WebKit
   que a máquina tem instalado (`webkit-2370`) não casa a revisão exata que
   nenhuma cópia do Playwright em cache do npx conhece — `lib/browsers.mjs` força
   `executablePath` mesmo assim e o lançamento funciona (testado: abre página e
   tira screenshot), mas isso não é a combinação que o próprio Playwright testa.
   Rodar a sonda de foco no WebKit é só trocar `getChromium()` por `getWebkit()`
   em `run-sondas.mjs`, mas não validei essa segunda perna.
6. **O controle de mouse do anel de foco tem uma guarda nova, não reverificada ao
   vivo depois do bloqueio do item 1:** descobri que pressionar o mouse (só
   `mouse.down()`, sem soltar) em pelo menos um botão já disparava a navegação da
   tela — o Tab-walk original achava só 1 alvo em vez de 4 por causa disso.
   Corrigi (`lib/probes/foco.mjs`: detecta a navegação pela URL e volta antes de
   continuar), mas **não consegui rodar de novo depois da correção** porque o
   export parou de funcionar (item 1) bem nessa hora. A correção é defensiva e
   deveria resolver o problema independente da causa exata, mas isso é dedução,
   não prova — reabra esta nota depois de rodar `node cli.mjs sondas` de novo.
7. **Estados além de "padrao" e "sem-rede"**: as fichas pedem "erro de campo",
   "carregando", "sessão expirada" etc. (`docs/padrao-premium-telas.md` §14.2).
   Esta rodada só cobre os dois que dão para alcançar sem interação com a
   identidade simulada em várias etapas (carregar e, no caso de "sem-rede",
   `context.setOffline(true)` DEPOIS de carregar — nunca editando código). Os
   demais exigem preencher formulário e observar a resposta do cliente `mock`,
   que fica para uma próxima rodada.
8. **"Sem-rede" hoje é visualmente idêntico a "padrao"** nestas 5 telas: o
   `NetworkBanner` (item C-01 do padrão) ainda não existe
   (`docs/padrao-premium-telas.md` §15, C-01 — confirmado: não há
   `NetworkBanner`/`useNetworkStatus` em `packages/`). A ferramenta corta a rede
   de verdade (`context.setOffline(true)`); é a tela que ainda não reage.
9. **G-14 a G-19, G-23 a G-28** (fonte 200%, teclado nativo, safe area, TalkBack,
   `onPress` vazio, honestidade de conteúdo, movimento): nada disso é
   automatizável em navegador; ficam para prova em aparelho/emulador (fora do
   escopo desta ferramenta) ou para leitura de código.

## Prova do que FOI validado

- **40 capturas reais** (5 telas × 2 estados × 4 tamanhos) em `.baseline/`, com
  conteúdo renderizado de verdade (logo, textos, campos, CTA) — conferidas a olho.
- **Determinismo:** recapturei a matriz inteira duas vezes (rodadas separadas, cada
  uma com export + servidor + Chromium do zero) e comparei contra a linha de base:
  **0 reprovadas nas 40** as duas vezes — mesma Fonte carregada
  (`document.fonts.ready`), `reducedMotion: 'reduce'` e `deviceScaleFactor: 2`.
- **Controle negativo (`node cli.mjs autoteste`):** capturei A (referência) e B
  (idêntica) → comparação deu `pass=true, ratio=0`; capturei C com uma mudança
  visual injetada em tempo de execução (`page.addStyleTag`, nunca edição de
  arquivo) → comparação deu `pass=false, ratio≈4,4%`. O comparador detecta
  diferença de verdade, não é um "sempre aprova" disfarçado.
- **G-07b funcionando de ponta a ponta:** as 5 montagens lado a lado
  (`.saida/lado-a-lado/*.png` + o `.md` com a tabela de 8 linhas) foram geradas e
  conferidas a olho (P01 em anexo a este handoff) — recorte da prancha à esquerda,
  captura 390×844 à direita, mesma altura.
- **Sondas de estilo/geometria/texto/contraste rodaram sobre conteúdo real** (não
  a versão em branco) em P01 e M01, com achados plausíveis (CTA achado em
  geometria, textos "Termos de Uso"/"Política de Privacidade" achados por
  `ativacao-links.mjs`, com Enter ativando, Espaço/Alt+Enter não ativando e o
  clique de mouse confirmando que os links não estão mortos).

## Arquivos

```
tools/qualidade-tela/
  cli.mjs                    ponto de entrada (ver `node cli.mjs ajuda`)
  screens.config.mjs         a matriz: telas, tamanhos, recortes da prancha
  lib/
    resolve-dep.mjs          acha playwright/pngjs no cache do npx sem declarar dependência
    browsers.mjs             casa a revisão do Chromium/WebKit instalada com um Playwright em cache
    paths.mjs                caminhos (dist dos apps, linha de base, saída)
    server.mjs                servidor estático com fallback de SPA
    tokens.mjs                 lê vuumbora.tokens.json -> conjunto de cores aprovadas
    capture.mjs                 gera a matriz de capturas
    compare.mjs                   compara contra a linha de base (decodifica PNG com pngjs, diff pixel a pixel)
    image-utils.mjs                recorte/redimensionamento (vizinho mais próximo) para o G-07b
    side-by-side.mjs                monta a imagem e o gabarito do G-07b
    run-sondas.mjs                   roda as sondas do §14.3 sobre a matriz
    autoteste.mjs                     controle negativo (ver acima)
    probes/
      estilo.mjs, geometria.mjs, texto.mjs, contraste.mjs    sondas §14.3
      foco.mjs                 Tab-walk + anel de foco por contraste de pixel (adaptação do ring6.mjs/ring.mjs da Íris)
      ativacao-links.mjs        Enter/Espaço/Alt+Enter em role=link (adaptação do q4.mjs da Íris)
      anel-utils.mjs             matemática de contraste/cobertura por lado, compartilhada
      index.mjs                   agrega todas as sondas de uma página
```
