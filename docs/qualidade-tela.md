# Ferramenta do portão de qualidade de tela

Implementa `docs/padrao-premium-telas.md` §14 (portão G-01 a G-28, §14.2 regressão
visual por captura, §14.3 sondas automáticas) para as telas de login, cadastro e
boas-vindas dos dois apps — o escopo desta rodada (F09, onda 0, parte a). Mora em
`tools/qualidade-tela/`. Não altera nenhum app; sobe um `expo start --web` (Metro de
desenvolvimento) de cada app e navega nele com Playwright — ver "Por que Metro ao
vivo" abaixo para o motivo de não ser mais um `expo export` servido estaticamente.

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

node cli.mjs capturar                 # sobe o Metro ao vivo dos 2 apps, matriz tela x estado x tamanho -> .saida/capturas
node cli.mjs linha-base               # promove .saida/capturas -> .baseline (só depois de aprovar)
node cli.mjs comparar                 # compara .saida/capturas (ou --capturas <dir>) contra .baseline
node cli.mjs sondas                   # estilo, geometria, texto, contraste, foco e ativação de links (§14.3) — também sobe o Metro ao vivo
node cli.mjs lado-a-lado              # G-07b: recorte da prancha + captura 390x844 lado a lado (pula telas sem prancha)
node cli.mjs autoteste                # controle negativo do comparador (sobe o Metro) + roda o autoteste-links no fim
node cli.mjs autoteste-links          # controle negativo da sonda de links (página falsa, sem Metro, segundos)
node cli.mjs tudo                     # capturar + sondas + lado-a-lado + comparar (se houver linha de base)
```

Todo comando aceita `--telas P01,M01` para rodar só um subconjunto (ver os IDs em
`screens.config.mjs`). `node cli.mjs ajuda` lista as opções de cada um.

**Códigos de saída:**
- `capturar` e `sondas` param com erro (código 1) na primeira falha — inclusive o corte
  de rede que não chega (ver "Estado sem-rede" abaixo).
- `lado-a-lado` (e portanto `tudo`) pula com aviso as telas sem prancha (`pranchaArquivo`
  ausente no `screens.config.mjs`) e junta os erros das outras: sai com código 1 se
  alguma tela der erro, e o `tudo` segue até o `comparar` mesmo assim.
- `comparar` sai com código 1 se houver reprovada.
- `autoteste` e `autoteste-links` saem com código 1 se o controle negativo falhar.

**Tempos (informados pelo Atlas, 27/11/2026, a confirmar):** captura completa ~20 min;
sondas ~39 min. A ferramenta não grava duração em nenhum arquivo de saída.

## Telas atrás da guarda `(app)` (P03, P04, M05...) — bootstrap de sessão (22/11/2026)

`capturar` e `sondas` navegam direto para `tela.rota` com `page.goto`. Para uma tela
pública (P01, P02a, P02b, M01, M02) isso basta. Para uma tela do grupo `(app)`
(protegida por `Stack.Protected` em `app/_layout.tsx` de cada app) sem sessão, o
app redireciona sozinho para a tela de entrada (`/boas-vindas` no passageiro,
`/entrar` no motorista) — sem tratar isso, a captura sairia da tela de login, não da
tela pedida (achado original da Lyra, `.claude/agent-memory/lyra/
project_m05_onda2_painel_motorista.md`).

`lib/auth-bootstrap.mjs` resolve isso: depois do `goto` e da espera de conteúdo
normal, `garantirSessaoEDestino(page, { app, rotaDestino })` confere se a página caiu
na tela de entrada do app sem ter sido isso que foi pedido; se sim, cria uma conta de
prova e loga pelo gancho `window.__vuumboraIdentity` (só existe em `__DEV__` web —
`register` → `verifyEmail({ code: '123456' })` → `login`, com `termsVersion`/
`privacyVersion: 'mock-1'`, a versão vigente do mock) e navega pelo CLIENTE até a
rota pedida (`history.pushState` + `popstate`, o mesmo mecanismo que o próprio
expo-router usa para navegação interna). **Nunca `page.goto` depois do login**: a
sessão mock vive só em memória (`createDeviceSessionStorage` no web não usa
`localStorage`) e qualquer navegação de documento a zera. Para uma tela pública a
função não faz nada (`false`) — o `pathname` já bate com a rota pedida e o bootstrap
nem dispara.

Verificado de ponta a ponta (22/11/2026): `node cli.mjs capturar --telas P03,P04,M05`
e `node cli.mjs sondas --telas P03,P04,M05` rodaram sem erro nas 4 larguras (20
combinações cada) e os PNGs abertos a olho mostram a Home do passageiro, a tela de
destino e o painel do motorista com conteúdo real — nunca a tela de login.

## Estado sem-rede: o corte chega à tela (27/11/2026, commit 07580fa)

`context.setOffline(true)` sozinho não chegava à tela: no Chromium, o NetInfo web
(`@react-native-community/netinfo`, `lib/internal/nativeModule.web.js`) escuta só
`navigator.connection` `change` quando a Network Information API existe, e ignora
`online`/`offline` da janela. Por isso `lib/sem-rede.mjs` faz, depois de `setOffline`:

1. dispara `change` em `navigator.connection` (o NetInfo relê `navigator.onLine`, que já
   é `false`);
2. confere `navigator.onLine === false`. Se ainda estiver `true`, **lança erro** e a
   captura para (aborta o `capturar`/`tudo` inteiro, não só a tela);
3. espera até 2 s pelo `NetworkBanner` (`packages/ui/src/NetworkBanner.tsx`:
   `role="status"`, texto "Sem conexão. Tentando reconectar…"). **Não ter banner não é
   erro**: `bannerVisivel` vira `false`, o log avisa "esperado só se a tela não tiver
   NetworkBanner", e a captura segue.

Onde o resultado aparece:

- `.saida/capturas/manifest.json`: cada item do estado `sem-rede` tem `semRede`:
  `{ onLine, temConnection, disparouChange, bannerVisivel, textoSemConexao }`.
- `.saida/sondas/<app>/<ID>-sem-rede-<L>x<A>.sondas.json`: o mesmo objeto em `semRede`.
- `.saida/sondas/resumo-sondas.json`: campo `bannerSemRede` (true/false) em cada
  combinação `sem-rede`. É esse campo que diz se "sem-rede" foi de fato a tela offline.

Para confirmar que o corte chegou, leia `bannerSemRede` antes de aceitar a captura
`sem-rede` como prova do estado offline.

### Por que Metro ao vivo, e não mais um `expo export` servido estaticamente (22/11/2026)

A versão anterior desta ferramenta gerava `apps/<app>/dist` com
`expo export --platform web --dev` e servia essa pasta com um servidor estático
próprio (`lib/server.mjs`, removido nesta rodada). A Íris achou (Q9, passada 8,
`docs/veredito-iris-s1-passada-8.md`) que isso quebra em QUALQUER rota com
"Requiring unknown module NNN" assim que o Chromium navega de verdade — confirmado
também ANTES da F02 (não é regressão de ninguém, é um problema estrutural do próprio
caminho).

**Causa raiz confirmada:** o bundle do `--dev` pede módulos em `lazy=true` (visível
na própria URL: `...entry.bundle?...&lazy=true...`) — o runtime do RN Web faz
`require` de módulos por ID NUMÉRICO sob demanda, um protocolo que só um Metro
rodando sabe responder (ele resolve o ID contra o grafo de dependências ao vivo).
Servido como arquivo estático, qualquer rota que dispare um desses requires não tem
para quem perguntar "o que é o módulo 847" e quebra. Não é uma falha de configuração
do servidor — é inerente ao formato do export `--dev`.

**Por que não dá para consertar o export estático sem afrouxar a guarda:** o
`metro.config.js` dos dois apps (fatia F02) só libera identidade simulada em
`VUUMBORA_BUILD_PROFILE=development` COM `NODE_ENV` diferente de `production` — e
`expo export` (sem `--dev`) força `NODE_ENV=production` por dentro do processo
filho (testado, ver a nota antiga abaixo), então a única forma de pedir um export
`development` pela CLI é `--dev`, que é exatamente o que mantém o `lazy=true`
quebrado. Desligar o lazy bundling do export exigiria mexer em
`apps/*/metro.config.js` (fora da fronteira desta ferramenta: a zona desta tarefa é
só `tools/qualidade-tela/` e este documento). **Caminho escolhido:** falar com o
Metro vivo (`expo start --web`), que é como qualquer dev roda o app de verdade — e é
o único jeito de ter identidade simulada depois da F02 de qualquer forma (ver
comentário de topo de `metro.config.js`: "a identidade simulada só existe com o
Metro de desenvolvimento").

**Como funciona (`lib/dev-server.mjs`):** sobe `npx expo start --web --port <porta>`
por app, com `cwd` dentro do app, `CI=1` (desliga file-watching/Fast Refresh — não
precisamos, é uma captura única, não uma sessão de edição; também é o que deixa o
bundle em `hot=false`) e `VUUMBORA_BUILD_PROFILE=development`. Espera o servidor
responder (qualquer status HTTP, nem precisa ser 200 — só prova que o listener do
Metro subiu) antes de navegar, e mata a árvore do processo inteira ao fechar
(`taskkill /T` no Windows, porque `shell:true` cria um `cmd.exe` intermediário entre
o `npx` e o `node` de verdade).

**Portas:** fixas, 8201 (passageiro) e 8202 (motorista), ACIMA de 8100 — escolhidas
para não colidir com outra sessão de QA rodando ao mesmo tempo na mesma máquina.
Override por `QUALIDADE_TELA_PORTA_PASSAGEIRO`/`QUALIDADE_TELA_PORTA_MOTORISTA`.

**Custo medido:** a PRIMEIRA navegação de cada app paga o compile completo do bundle
no Metro (~11s para ~13MB não-minificado, nesta máquina) — rotas seguintes do MESMO
app reaproveitam o cache do Metro e voltam a ser quase instantâneas. `capture.mjs` e
`run-sondas.mjs` usam timeouts generosos (`goto`: 60s, `waitForFunction`: 30s) por
causa disso.

(Nota histórica, ainda verdadeira sobre o `expo export` em si, só não é mais o
caminho desta ferramenta: `expo export` sem `--dev` força `NODE_ENV=production` por
dentro do processo filho, não importa o que se passe no `env` do `execSync` —
testado e confirmado antes desta mudança.)

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
| G-02, G-03, G-04, G-05, G-06 | assinatura premium, cor nos tokens, contagem de amarelo, tipografia | `lib/probes/estilo.mjs` | **parcial** — inventaria toda caixa; só G-03 (cor fora do conjunto) e G-04 (contagem de amarelo) viram achado automático. Ver "O que não foi validado": não conta amarelo vindo de gradiente. **O banner sem conexão ainda conta** como amarelo (`estilo.mjs` não o exclui): a decisão do Atlas de 27/11 (não conta no limite, `docs/fichas-de-tela/README.md`) ainda não está no código; até lá a Íris desconta o banner à mão nas capturas sem rede |
| G-09, G-11 (indício), G-12, G-13 (indício), G-21 | viewport, CTA visível sem rolar, sobreposição, alvo de toque | `lib/probes/geometria.mjs` | funcional — G-09 recorta pelos ancestrais com `overflow` ≠ `visible` antes de comparar com a viewport (ver item 10 de "O que esta ferramenta NÃO validou"), então uma Image com bleed contida por um `overflow:hidden` não dá falso positivo |
| G-10 | truncamento de texto | `lib/probes/texto.mjs` | funcional (sem lista de exceção — nenhuma tela desta rodada precisa) |
| G-20 | contraste de texto | `lib/probes/contraste.mjs` | funcional sobre fundo sólido (compõe alpha de camadas translúcidas empilhadas, ver nota 4 abaixo); fundo com imagem/gradiente fica "não medido" (ver limitações) |
| G-22 (ordem de tabulação + anel visível) | Tab percorre os interativos, anel de foco visível no Chromium e no WebKit | `lib/probes/foco.mjs` | **adaptação do `ring6.mjs`/`ring.mjs` que a Íris deixou na passada 6** — mede o recorte focado × desfocado e exige contraste ≥ 3:1 em ≥ 60% de cada um dos 4 lados (não só `outline-style !== 'none'`), mais o controle de mouse (pressionar com o mouse não pode acender o mesmo anel). Hoje só roda no Chromium pela matriz principal — ver limitações sobre o WebKit |
| G-22 (Enter e Espaço ativam) | ativação por teclado, refinada para `role="link"` | `lib/probes/ativacao-links.mjs` | **adaptação do `q4.mjs`** da Íris: Enter ativa; Espaço, Alt+Enter e segurar Enter (auto-repeat) não; controle — o clique de mouse tem que ativar, senão o link está morto e o resto não prova nada. **Reabertura (27/11):** depois de cada tecla, a página tem que voltar à URL de partida (`goBack` se preciso) e o link tem que continuar lá; se não voltar (ex.: `router.replace`), a próxima tecla roda numa página nova, reaberta do zero pelo `abrirTela` (mesmo estado e tamanho). O campo `passosEmPaginaNova` lista as teclas que rodaram em página reaberta. Sem `reabrir`, as teclas que faltam ficam `null` e o link vai para `controleInvalido` |
| G-07b | comparação lado a lado com o alvo de 22/11 | `lib/side-by-side.mjs`, comando `lado-a-lado` | monta a imagem e o gabarito da tabela de 8 linhas; telas sem `pranchaArquivo` (hoje P07, P07b, P07c, P07d, P10, P10b, P11b, M10, M12b, M13c — 10 de 35 em `screens.config.mjs`) são **puladas com aviso** (G-07b não se aplica); `pranchaArquivo` sem `recortePrancha` (ou o contrário) é erro de configuração. **Quem julga "confere/diverge" é humano** (Íris/Apolo), a ferramenta não decide layout |
| G-14 a G-16, G-23, G-24 (telas de aparelho/emulador) | fonte 200%, teclado, safe area, TalkBack | — | **fora do escopo desta ferramenta** (ela só roda em navegador/Expo Web) |
| G-17, G-18, G-19, G-25 a G-28 | estados, honestidade de conteúdo, `onPress` vazio, movimento | — | não automatizado nesta rodada (ver abaixo) |

## O que esta ferramenta NÃO validou

1. ~~O autoteste e a primeira matriz completa foram rodados com um export agora
   impossível de reproduzir~~ **RESOLVIDO (22/11/2026, rodada seguinte).** O
   bloqueio do `mode.ts`/`mode.http.ts`/`mode.mock.ts` (trabalho de outro agente,
   em andamento quando esta nota foi escrita pela primeira vez) terminou — o
   resolver de identidade em `metro.config.js` está funcionando. Mas a causa de
   fundo do problema era outra: a Íris achou (Q9, passada 8) que `expo export --dev`
   servido estaticamente quebra em runtime com "Requiring unknown module NNN"
   mesmo com o `mode.ts` resolvido — é inerente ao formato do export `--dev`
   (lazy bundling, ver "Por que Metro ao vivo" acima), não ao bloqueio do `mode.ts`.
   A ferramenta não exporta mais: fala com `expo start --web` ao vivo. A linha de
   base e os relatórios atuais (ver "Prova do que FOI validado") foram gerados por
   esse caminho novo.
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
   **Correção relacionada (22/11/2026, achado da Lyra):** `fundoEfetivo` parava no
   PRIMEIRO ancestral com `backgroundColor` de alpha > 0 e usava o RGB dele puro —
   falso positivo de REPROVAÇÃO em qualquer elemento "tingido" do design system
   (`InlineAlert`, `StatusBadge`: pintam `rgba(cor, 0.1)` por cima do fundo real da
   página). O "i" do `InlineAlert` info no M02 dava 1,92:1 (RGB cru da camada
   translúcida) quando o pixel real, medido pela Lyra com screenshot+pngjs, é
   ~7:1. Corrigido: `fundoEfetivo` agora compõe os alphas subindo a árvore
   (Porter-Duff "over") até achar uma camada OPACA ou esgotar os ancestrais (nesse
   caso assume branco, o canvas padrão do navegador).
   **Verificado (números reais, não estimados):** o mesmo "i" do M02 agora dá
   **7,41:1** (fundo composto calculado em `rgb(16,5, 23,5, 35,8)` — bate em
   direção e ordem de grandeza com o pixel real da Lyra). Rodei a bateria completa
   de novo (`sondas`, 40 combinações, pasta de saída própria — `.saida-vulcano-
   teste/`, sem tocar na linha de base nem na `.saida` de ninguém, portas 9301/9302):
   `contrasteReprovado` somado caiu de **8 para 0** — as 8 reprovações antigas eram
   TODAS o mesmo falso positivo do "i" do `InlineAlert` do M02 (uma por combinação
   de tamanho×estado, 8 no total); nenhuma das 5 telas desta rodada tem um caso de
   contraste baixo DE VERDADE. Para provar que a correção não "cegou" a sonda, montei
   um controle negativo à parte (fora da suíte, script ad-hoc): injetei um texto
   `rgb(40,40,40)` sobre fundo opaco `rgb(30,30,30)` numa página real — a sonda
   continuou reprovando (**1,13:1**, abaixo do limiar 4,5:1). O comparador de
   contraste detecta contraste ruim de verdade; só parou de confundir "cor diluída"
   com "cor ruim".
5. **O anel de foco (G-22) só rodou no Chromium na matriz principal.** O WebKit
   que a máquina tem instalado (`webkit-2370`) não casa a revisão exata que
   nenhuma cópia do Playwright em cache do npx conhece — `lib/browsers.mjs` força
   `executablePath` mesmo assim e o lançamento funciona (testado: abre página e
   tira screenshot), mas isso não é a combinação que o próprio Playwright testa.
   Rodar a sonda de foco no WebKit é só trocar `getChromium()` por `getWebkit()`
   em `run-sondas.mjs`, mas não validei essa segunda perna.
6. ~~O controle de mouse do anel de foco tem uma guarda nova, não reverificada~~
   **REVERIFICADO (22/11/2026, rodada seguinte) — a correção se sustenta.**
   `node cli.mjs sondas` rodou sobre as 40 combinações com o Metro ao vivo e a
   contagem de `aneisDeMouse` (anel de foco acendendo por PRESSIONAR o mouse, o
   que não devia acontecer) deu **0 em todas as 40** — a guarda de
   `lib/probes/foco.mjs` (detecta a navegação pela URL e volta antes de continuar)
   funciona de verdade, não só na dedução.
7. **Estados além de "padrao" e "sem-rede"**: as fichas pedem "erro de campo",
   "carregando", "sessão expirada" etc. (`docs/padrao-premium-telas.md` §14.2).
   Esta rodada só cobre os dois que dão para alcançar sem interação com a
   identidade simulada em várias etapas (carregar e, no caso de "sem-rede",
   `context.setOffline(true)` DEPOIS de carregar, mais o `change` do
   `navigator.connection` — ver "Estado sem-rede" — nunca editando código). Os
   demais exigem preencher formulário e observar a resposta do cliente `mock`,
   que fica para uma próxima rodada.
8. **"Sem-rede" chega à tela desde 27/11/2026 (commit 07580fa), mas a prova disso
   ainda não está registrada aqui.** Antes, `context.setOffline(true)` não chegava
   ao NetInfo web e a captura "sem-rede" saía igual a "padrao". Agora a captura
   dispara o `change` do `navigator.connection` e confere `navigator.onLine`
   (ver "Estado sem-rede"). O `NetworkBanner` existe em
   `packages/ui/src/NetworkBanner.tsx`. Se a tela mostra o banner ou não, depende
   da tela: leia `bannerVisivel`/`bannerSemRede` no manifesto, não a foto. **A confirmar:**
   nenhuma rodada com este commit foi lida e registrada no doc; a "Prova" abaixo é
   de 22/11, anterior à correção.
9. **G-14 a G-19, G-23 a G-28** (fonte 200%, teclado nativo, safe area, TalkBack,
   `onPress` vazio, honestidade de conteúdo, movimento): nada disso é
   automatizável em navegador; ficam para prova em aparelho/emulador (fora do
   escopo desta ferramenta) ou para leitura de código.
10. **Correção (22/11/2026, achado da Íris no portão da onda 2,
    `docs/veredito-iris-portao-onda2.md`): G-09 acusava falso positivo em Image
    com "bleed".** `sondaGeometria` (G-09) comparava o retângulo INTRÍNSECO do
    elemento com a viewport — uma `Image` maior que o container por desenho
    (`HomeMapPreview`, arquivo-fonte 1170×1560 recortado numa caixa bem menor)
    reportava `getBoundingClientRect()` do tamanho do arquivo, e a sonda acusava
    "ultrapassa a viewport" mesmo com um ancestral `overflow:hidden` do tamanho
    certo recortando tudo que sobra — na tela, visualmente, nada vaza (P03 dava
    `ultrapassaViewport: 2` nas 8 combinações, um falso positivo por tamanho×estado).
    Corrigido: `caixaRecortada()` (`lib/probes/geometria.mjs`) intersecciona o
    retângulo do elemento com a caixa de TODO ancestral que recorta (qualquer
    `overflow` ≠ `'visible'` naquele eixo — `hidden`, `clip`, `auto` ou `scroll`),
    subindo até `<html>`; um elemento recortado a zero por um ancestral (largura ou
    altura recortada ≤ 0) sai da checagem (não pode "vazar" o que está 100%
    invisível). **Verificado com números reais:** `node cli.mjs sondas --telas
    P03,P04,M05` deu `ultrapassaViewport: 0` nas 20 combinações (era 2 por
    combinação no P03 antes da correção; P04 e M05 já estavam em 0). Controle
    positivo (fora da suíte, script ad-hoc com `page.setContent`): um elemento
    deslocado para fora da viewport SEM nenhum ancestral recortando continua
    acusando (`ultrapassaViewport: 1`); um elemento recortado a zero por um
    ancestral não vira achado nem erro.

## Prova do que FOI validado

Rodada de 22/11/2026 (depois da troca para Metro ao vivo), `node cli.mjs tudo` de
ponta a ponta, sem intervenção manual entre os passos. **Esta prova é anterior ao commit
07580fa (27/11).** Os itens de sem-rede, reabertura da sonda de links, pulo do G-07b e
os códigos de saída mudaram depois dela e ainda não têm rodada registrada aqui:

- **40 capturas reais** (5 telas × 2 estados × 4 tamanhos, os dois apps) contra o
  Metro ao vivo — **abertas a olho** (não só "o comando não deu erro"): boas-vindas,
  login e cadastro do passageiro, entrar e criar-conta do motorista, em tamanhos
  diferentes (320×568 e 430×932) e no estado "sem-rede" — todas com conteúdo real
  (logo, textos em português, campos, CTA amarelo, aviso "A conta não é o cadastro
  de motorista" no M02), nenhuma em branco.
- **Zero erro "Requiring unknown module"** em nenhuma das 40 capturas nem nas 40
  sondas — o problema que o Q9 reportou (navegação direta sobre o export estático)
  não reaparece navegando contra o Metro ao vivo.
- **Determinismo:** promovi essas 40 capturas a `.baseline/` (`node cli.mjs
  linha-base`) e, na MESMA rodada de `tudo`, recapturei a matriz inteira do zero
  (subir e derrubar os dois Metro de novo) e comparei contra essa linha de base:
  **40 ok, 0 reprovadas, 0 sem linha de base.** Mesma fonte carregada
  (`document.fonts.ready`), `reducedMotion: 'reduce'`, `deviceScaleFactor: 2`.
- **Controle negativo (`node cli.mjs autoteste`), rerrodado já no caminho novo:**
  A (referência) vs B (idêntica) → `pass=true, ratio=0`; A vs C (mudança visual
  injetada em tempo de execução via `page.addStyleTag`, nunca edição de arquivo) →
  `pass=false, ratio≈4,37%`. O comparador segue detectando diferença de verdade.
- **G-07b funcionando de ponta a ponta nas 5 telas** (não só P01 como na rodada
  anterior): `.saida/lado-a-lado/{P01,P02a,P02b,M01,M02}-lado-a-lado.png` + o `.md`
  com a tabela de 8 linhas cada — recorte da prancha à esquerda, captura 390×844 à
  direita, mesma altura. Conferidas a olho (P01 e M01 em anexo a este handoff):
  conteúdo e proporção batem com a prancha de referência dos dois apps.
- **As 5 sondas rodaram sobre as 40 combinações** (não só 2 telas como na rodada
  anterior), com achados plausíveis e não-triviais: 136 ocorrências de "sem
  indicador de foco visível" (achado real de UI, não bug da sonda — fica para
  quem mexe na tela), 8 de contraste reprovado, 8 de controle inválido em link,
  **0 falhas de ativação por teclado** (Enter sempre ativou os links achados) e
  **0 "anéis de mouse"** (a guarda do item 6 de "O que esta ferramenta NÃO
  validou" se sustenta nas 40 combinações, não só numa amostra).

## Arquivos

```
tools/qualidade-tela/
  cli.mjs                    ponto de entrada (ver `node cli.mjs ajuda`)
  screens.config.mjs         a matriz: telas, tamanhos, recortes da prancha
  lib/
    resolve-dep.mjs          acha playwright/pngjs no cache do npx sem declarar dependência
    browsers.mjs             casa a revisão do Chromium/WebKit instalada com um Playwright em cache
    paths.mjs                caminhos (apps, linha de base, saída)
    dev-server.mjs            sobe/derruba "expo start --web" ao vivo por app (ver "Por que Metro ao vivo")
    auth-bootstrap.mjs        bootstrap de sessão mock p/ telas atrás de `(app)` (ver seção acima)
    abrir-tela.mjs            abre UMA combinação tela×estado×tamanho (usado por capturar, sondas e a reabertura da sonda de links)
    sem-rede.mjs              corte de rede que chega ao NetInfo web e confere o banner (ver "Estado sem-rede")
    autoteste-links.mjs       controle negativo da sonda de links (página falsa, sem Metro)
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
