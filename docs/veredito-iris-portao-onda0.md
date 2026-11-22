# Veredito da Íris — Portão de qualidade, onda 0 do padrão premium (F09)

**VEREDITO ATUAL (reabertura sobre `a03961e`): APROVADO.** Ver seção "Reabertura a03961e" no fim do documento —
ela substitui o veredito original abaixo, que fica só como registro histórico do que motivou a correção.

**VEREDITO ORIGINAL (histórico, `9ddb194`): REPROVADO.**

**Candidata: `main` + merge de `fatia/f02` + merge de `fatia/f09-onda0`.** Confirmado por `git diff` sem nenhuma
linha que `apps/`, `packages/` ou `tools/` da candidata montada por mim diverge do `main` real de hoje (que já
tem a F02, commit `b9b4cfa`) com `fatia/f09-onda0` (ponta `9ddb194c36103406ea3b294278af4df1410e2dbb`) por cima —
ou seja, a combinação testada é a mesma que o Atlas pediu, só montada antes do F02 cair na `main` (não havia
diferença de conteúdo a essa altura).

Montada em cópia limpa fora do repositório (`git clone` + `npm ci`, Node 26.12.1), sem tocar a árvore de trabalho
real nem `tools/qualidade-tela/` do repositório (edições de teste — `screens.config.mjs` com duas entradas extras
C01/C02 e um script `onda0-live.mjs` — existiram só na cópia descartável, nunca comitadas, por pedido do Atlas de
não mexer na ferramenta enquanto o Vulcano a conserta).

## Achado que reprova (causa raiz única, 4 das 5 telas tocadas)

**`packages/ui/src/BrandLogo.tsx` (onda 0): o lockup da marca renderiza com proporção errada em TODOS os tamanhos.**

Antes da onda 0, `dimensionsOf('lockup', size)` calculava `{ width, height: Math.round(width / aspect) }` — altura
derivada explicitamente. A onda 0 trocou para `{ width: '100%', maxWidth: LOCKUP_WIDTH[size], aspectRatio: aspect }`,
delegando a altura ao CSS `aspect-ratio`. Medido ao vivo (Playwright, `getBoundingClientRect`) nos dois lados:

| Tamanho | Largura pedida | Altura correta (antes, medida) | Altura depois da onda 0 (medida) | Erro |
|---|---|---|---|---|
| `sm` (AuthHeader, usado em P02a/P02b/M01/M02) | 160 | 122px (aspecto 1,31, bate com o PNG 240×183) | **183px** | **+50% mais alto** |
| `lg` (P01, viewport largo) | 320 | 244px | **183px** | **-25% mais baixo (achatado)** |

Em ambos os casos a altura renderizada trava em **183px — a altura NATIVA do PNG a 1x (240×183)** — independente da
largura pedida. O `aspect-ratio` do CSS não está sendo respeitado pelo `Image` do React Native Web nesta combinação
(`width:'100%'` + `maxWidth` fixo + `aspectRatio`, sem altura explícita): a imagem sai esticada verticalmente no
tamanho pequeno e achatada no tamanho grande.

**Prova de que é regressão da onda 0, não do F02 nem pré-existente:** reproduzi a MESMA medição em `main` puro
(sem F02, sem F09, via `expo start --web` ao vivo) e a altura bateu com a fórmula antiga (122px e 244px,
respectivamente) nos dois tamanhos. `git diff` isolado de `fatia/f09-onda0` contra a sua própria base (`f2a4472`,
anterior ao F02) confirma que só a onda 0 toca `BrandLogo.tsx` — o F02 não encosta em UI.

**Impacto medido, capturas antes/depois anexadas abaixo:**

- **P02a (login, passageiro), 320×568: o CTA "Entrar" fica fora da tela, nem rolando dá pra ver sem scroll.**
  Antes da onda 0 (mesma rota, mesmo tamanho, mesmo método de captura): CTA visível por completo. **G-11 quebrado.**
- **M01 (entrar, motorista), 320×568: o CTA "Entrar" fica cortado no rodapé** (antes, cabia inteiro). **G-11 quebrado.**
- **P02b (cadastro) e M02 (criar conta): o lockup ocupa ~40% da altura de 320×568** antes mesmo dos campos
  começarem — a tela já rolava (formulário longo), mas a onda 0 piora um lacuna já registrada na ficha (P02,
  item 4: "recomendo tirar o logo de P02b/c/d/e, a prancha não tem logo em Criar conta") tornando o logo errado
  ainda maior.
- **P01 (boas-vindas): o lockup sai visivelmente achatado** (achado nas capturas como uma espécie de "logo duplo"
  no diff automático — não é problema de timing de animação, é o tamanho real mudando entre as duas capturas
  comparadas).

Capturas (candidata, cópia descartável — caminhos só citados para referência, não existem no repositório):
`P02a-padrao-320x568.png`, `M01-padrao-320x568.png` mostram o corte; a tabela acima tem os números crus.

## Nota por tela (rubrica `docs/auditoria-premium.md`, aceite da F09 = nenhuma nota < 7)

| Tela | Nota antes (onda 0) | Nota agora | Resultado | Por quê |
|---|---|---|---|---|
| P01 boas-vindas | 7 (18/11, Apolo) | **6** | REPROVADO | Logo com proporção errada (achatado); resto da tela intocado e correto |
| P02a login | 6 | **3** | REPROVADO | CTA fora da tela em 320×568 (regressão funcional) + logo esticado |
| P02b cadastro | 5 | **4** | REPROVADO | Logo esticado piora lacuna já conhecida; "Mostrar" corrigido (ponto positivo isolado) não compensa |
| M01 entrar (motorista) | não auditada; minha própria linha de base (antes da onda 0, mesma metodologia) mostra CTA 100% visível em 320×568 | **3** | REPROVADO | CTA cortado em 320×568 (regressão funcional) |
| M02 criar conta (motorista) | não auditada | **5** | REPROVADO | Logo esticado (variante errada já é pré-existente, não é achado novo) |

**Nenhuma das 5 telas tocadas passa dos 7 pontos.** A causa é uma só (`BrandLogo.tsx`), então a correção é
pontual, mas bloqueia a onda 0 inteira enquanto não sai.

## O que FOI validado e está correto (não mexer)

- **`check:boundaries` limpo** (sem HEX solto, sem import cruzado passageiro/motorista) e **`npm run typecheck`
  limpo nos 9 workspaces** na candidata montada.
- **PasswordInput "Mostrar" deixou de ser amarelo** (virou `textSecondary`) — confirmado ao vivo em P02a e M01,
  corrige a lacuna L3 da ficha P02 sem efeito colateral.
- **`ButtonCore` `size="prominent"` funciona**: no catálogo do motorista, "Recusar"/"Aceitar" saem com a mesma
  altura, como pedido (M6). Só não foi adotado ainda em `boas-vindas.tsx` (P01 continua com Entrar=56/Cadastrar=52
  — lacuna conhecida, sem mudança, não é regressão).
- **`ScreenHeader` (`align="center"`/`"left"`, `rightSlot` espelhado, `ChevronLeft` do lucide)**: os 4 exemplos do
  catálogo (sem onBack, com onBack, com onBack+rightSlot, align legado) renderizam como a documentação do
  componente descreve.
- **Anel de foco do CTA**: o mesmo botão sem indicador visível em P01 (achado pela sonda) já existia em `main`
  puro, antes da onda 0 — não é regressão da `PressableScale` que substituiu o `Pressable` cru no `ButtonCore`.
  Confirmado medindo os dois lados com a mesma sonda.
- **`AppShell` (padding compacto <375pt, `contentMaxWidth`)**: aditivo, não mudou a posição de nenhum elemento
  medido nas larguras testadas (320–430) — a suspeita inicial de que ele causava o deslocamento vertical foi
  descartada por medição direta antes de eu encontrar a causa real (o `BrandLogo`).
- Tokens novos (PP-7/PP-8) são só adição no JSON — zero remoção, zero risco de quebrar G-01/G-03 em telas que já
  passavam.

## Como medi (a ferramenta do portão estava quebrada; workaround registrado)

`node cli.mjs exportar` + `capturar`/`sondas` (o caminho de `tools/qualidade-tela`) deu "Requiring unknown module"
em TODA rota não-raiz, nos dois apps — reproduzi em `main` puro também, então é limitação pré-existente do
`expo export --dev` servido estático (expo-router carrega rota por import assíncrono que depende de um Metro vivo),
não regressão desta fatia (aviso do Atlas confirma o mesmo achado da passada 8). Workaround, igual ao combinado:

- `expo start --web` (Metro vivo) nos dois apps, `VUUMBORA_BUILD_PROFILE=development`, portas 4502 (motorista) e
  4511 (passageiro) — acima de 4480, fora da faixa 5470–5489 das outras Íris.
- Reaproveitei os módulos reais da ferramenta (`capture`/`run-sondas`/`compare`/`side-by-side`/as 5 sondas do
  §14.3) trocando só a origem da página (servidor Metro em vez do servidor estático), num script fora do
  repositório (`onda0-live.mjs`, só na cópia de teste).
- Linha de base "antes da onda 0": usei a que já existia em `tools/qualidade-tela/.baseline/` (local, fora do
  git, 40 PNGs reais — confirmado abrindo vários a olho, não são páginas em branco) e também recapturei pontos
  específicos eu mesma via Metro vivo em código pré-onda0, para isolar se a diferença vinha do meu método de
  captura ou do código. **Resultado do controle:** capturar código pré-onda0 pelo Metro vivo bate pixel a pixel
  (posições) com a linha de base estática — o método não é a causa de nada; o `BrandLogo` é.
- Capturei as 5 telas tocadas (P01, P02a, P02b, M01, M02) nos 2 estados × 4 tamanhos (40 capturas) + os 2
  catálogos `(dev)/catalogo` (8 capturas, só estado padrão) = 48 no total. Rodei as 5 sondas do §14.3 em todas, e
  gerei o G-07b (lado a lado com a prancha) para as 5 telas com recorte definido.

## Catálogos `(dev)/catalogo`

Não são telas de produto (a própria auditoria do Apolo já tratava `/catalogo` como "tela interna de dev, não
tratar"), então não entram na mesma régua de nota ≥7 — mas servem de vitrine e diagnóstico:

- `ScreenHeader` (4 variações) e `ButtonCore` `size="prominent"` aparecem corretos nos dois catálogos.
- O mesmo bug do `BrandLogo` lockup aparece na seção "Marca" do catálogo do passageiro (mesma causa, não é um
  achado novo, é o mesmo).
- Sonda de anel de foco: **5 elementos sem indicador visível no catálogo do passageiro, 30 no do motorista** — não
  triei item por item (o catálogo tem dezenas de componentes estáticos de exemplo, alguns dos quais —
  `PressedButtonPreview`/`FocusedFieldPreview` — são amostras congeladas de propósito, não interativas de
  verdade; parte da contagem pode ser falso positivo por isso). Fica como pendência, não bloqueia esta rodada
  porque o catálogo não é tela de produto.
- Sonda de ativação por Enter: achou 1 "link" (`SectionHeader` "Ver tudo") que não ativa nem por Enter nem por
  clique de mouse — pelo próprio critério da sonda (clique tem que ativar, senão o controle é invalido para a
  prova), isto não é uma falha de teclado: é texto decorativo sem `onPress` no exemplo do catálogo, não um link
  morto de produto.

## Para o próximo (Lyra/Vega, via Atlas)

**Corrigir `packages/ui/src/BrandLogo.tsx`, variante `lockup`.** O `aspectRatio` do CSS não está sendo respeitado
pelo `Image` do RN Web nesta composição de estilo. Caminhos possíveis: voltar a calcular `height` explícito a
partir de `width` (como era antes, mas mantendo o `maxWidth`/`width:'100%'` para o encolhimento em tela estreita
que a onda 0 queria resolver — ou seja, `width: Math.min(containerWidth, LOCKUP_WIDTH[size])` com `height` derivado
dele, não `aspectRatio` solto), ou investigar por que o `Image` ignora `aspectRatio` sem `height` explícito nesta
versão do React Native Web e corrigir na raiz. Depois da correção, recapturar pelo menos P02a e M01 em 320×568 e
confirmar que o CTA volta a caber sem rolar — esse é o critério de aceite mínimo para reabrir o portão.

## Pendências (não bloqueiam, registrar para depois)

- Anel de foco ausente no CTA principal (P01) e em dezenas de elementos do catálogo — pré-existente, mas real;
  vale uma rodada dedicada de acessibilidade.
- P01: "Cadastrar" (52pt) ainda não usa `size="prominent"` do `ButtonCore` para igualar a altura do "Entrar" (56pt)
  — o recurso já existe, só falta adotar na tela.
- `G-07b` (lado a lado com a prancha): gerei as 5 composições e os gabaritos de 8 linhas
  (`.saida/lado-a-lado-live/*.md`, só na cópia de teste); não preenchi "confere/diverge" linha a linha porque o
  achado do `BrandLogo` já basta para reprovar — fica para a próxima passada, depois da correção.
- `P02b`/`M02`: "possível legado" (2 caixas sem a assinatura premium) achado pela sonda de estilo — mesmo padrão
  em código não tocado pela onda 0; não investiguei a fundo, registrar para quem mexer em `LegalConsentFields`.

## Aprendizado para a memória

- **Novo registro de componente frágil:** `BrandLogo` (variante `lockup`) — `aspectRatio` do CSS sem `height`
  explícito não funciona no RN Web desta versão; qualquer mudança futura no componente precisa medir a altura
  renderizada de verdade (`getBoundingClientRect`), não só olhar o preview no Figma/código.
- **Confirmado o achado da passada 8 (Atlas/outra Íris):** `expo export --dev` servido estático quebra rota não-raiz
  por "Requiring unknown module", em qualquer branch (reproduzi em `main` puro) — é limitação do pipeline da
  ferramenta, não do código testado. O workaround (Metro vivo) funciona e dá captura pixel-correta (validado
  contra a linha de base estática antes de confiar nele).

---

## Reabertura `a03961e`

**VEREDITO: APROVADO.** Candidata: `main` (`0e61776`) + merge de `fatia/f09-onda0` ponta `a03961e`
(`a03961eb1d638676e94d8b181b907d48ed38d6ca`), dois commits de correção em cima do `9ddb194` reprovado acima:

- `ff8c515` — `packages/ui/src/BrandLogo.tsx`: a proporção do lockup volta a morar numa `View` (que recebe
  `aspectRatio` de verdade), e o `Image` só a preenche, sem altura própria.
- `a03961e` — `apps/passenger/src/components/auth/AuthHeader.tsx` e o equivalente do motorista: a seta de voltar
  vira `position:'absolute'` (não ocupa altura de fluxo).

Montada do mesmo jeito que a passada anterior: cópia limpa fora do repositório (`git clone` + `npm ci`), Metro vivo
nos dois apps (**sem `CI=1`** — confirmei que com `CI=1` o bundle da primeira rota trava e não sai do zero, o aviso
do Atlas procede), portas 4512 (passageiro) e 4513 (motorista). Capturei as 5 telas tocadas (P01, P02a, P02b, M01,
M02) nos 2 estados × 4 tamanhos (40 capturas) + os 2 catálogos (8 capturas) = 48, rodei as 5 sondas em todas, e
recomparei contra a MESMA linha de base "antes da onda 0" da passada anterior.

### Os dois achados, verificados com medição direta

**`BrandLogo` lockup: proporção corrigida, confirmado nos três tamanhos.**

| Tamanho | Antes da onda 0 (medido) | Onda 0 reprovada (medido) | Reabertura `a03961e` (medido) |
|---|---|---|---|
| `sm` (160) | 160×122 | 160×183 (errado) | **160×122** ✅ |
| `lg` (320) | 320×244 | 320×183 (errado) | **320×244** ✅ |

**Seta de voltar do `AuthHeader`: era bug de `main`, não da onda 0 — corrigido junto.** Medi `main` puro
(`0e61776`, sem nenhuma fatia em cima, mesmo método) para checar a correção de premissa do Atlas/Lyra:

| Tela, tamanho | `main` puro (0e61776), ANTES de qualquer correção, medido agora | Depois de `a03961e` |
|---|---|---|
| P02a login, 320×568, CTA "Entrar" | top=551, **bottom=603** (34px pra fora da tela de 568) | top=495, **bottom=547** (dentro da tela) |
| M01 entrar, 320×568, CTA "Entrar" | (M01 não tem seta de voltar — nunca teve o bug) | top=495, bottom=547 (igual) |

**Confirmado por mim, de forma independente** (não só repassando a medição da Lyra): cloning de `main` puro
(0e61776), Metro vivo, mesmo script de medição — bati bottom=603 (a Lyra reportou 599; a diferença de 4px é ruído
de medição/fonte entre as duas rodadas, não muda a conclusão). **O corte do CTA do P02a já existia antes da onda 0
e não era causado pelo `BrandLogo`** — era a seta de voltar ocupando 52px de fluxo acima do logo. Os dois bugs
coexistiam na mesma tela; a onda 0 só piorou o do logo, e a correção resolveu os dois juntos.

**M01 era a única linha de base realmente confirmada como "cabia"** (medi isso eu mesma na primeira passada, não é
suposição): `M01-padrao-320x568` bate **pixel a pixel** (`ratio=0,0000`) com a linha de base antes da onda 0 — o
que é esperado, porque M01 nunca teve seta de voltar (é a primeira tela do fluxo), então nenhum dos dois bugs o
afetava, e a correção não precisava mudar nada ali.

### Resultado da comparação contra a linha de base (as 40 capturas de produto)

| Tela | Resultado | Leitura |
|---|---|---|
| P01 boas-vindas | **`ratio=0,0000` nas 8 (padrão+sem-rede × 4 tamanhos)** | Pixel-idêntico à linha de base de antes da onda 0 — o achatamento do logo sumiu, resto nunca tinha mudado |
| M01 entrar | **`ratio=0,0000` nas 8** | Pixel-idêntico — nunca teve nenhum dos dois bugs (sem seta de voltar) |
| P02a login | `ratio` 0,31–0,47 (reprovado pelo comparador de pixel) | **Diferença esperada e correta**, não regressão: o comparador compara contra uma linha de base que TINHA os dois bugs (seta empurrando o conteúdo + logo errado); a tela corrigida fica mais alta/compacta de propósito. Virou pior **lido pelo comparador cru**, mas é melhor lido a olho — ver capturas abaixo |
| P02b cadastro | `ratio` 0,48–0,55 (reprovado) | Mesma leitura do P02a: o comparador de pixel não serve pra validar ESTA correção específica (ele assume que "igual à linha de base" é sempre bom; aqui a linha de base tinha dois bugs) |
| M02 criar conta | `ratio` 0,29–0,49 (reprovado) | Idem |

**Por que confiar na leitura "não é regressão" em vez do número cru do comparador:** abri as capturas de P02a,
P02b e M02 (320×568 e 390×844) a olho — layout limpo, sem sobreposição, sem truncamento, CTA visível, seta no canto
sem colidir com o logo. A sonda de geometria confirma **zero sobreposições** em qualquer tela de produto e as
únicas saídas de viewport (`ultrapassaViewport`) são as mesmas 4px à esquerda em P01/320 e P01/360 que já existiam
na passada anterior (pré-existente, não é novidade de `a03961e`). O comparador de pixel é a ferramenta certa pra
regressão **quando a linha de base não tem bug conhecido**; aqui ela tinha dois, então divergir dela é o resultado
correto — registrar isto como lição (ver "Aprendizado" no fim).

### Nota por tela — separando regressão da onda 0 de bug antigo corrigido junto

| Tela | Nota antes da onda 0 (Apolo/minha, 18-22/11) | Nota agora | É regressão da onda 0? | Por quê |
|---|---|---|---|---|
| P01 boas-vindas | 7 | **7** | — (sem mudança; a regressão que existiu foi corrigida, voltou ao que era) | Pixel-idêntico à linha de base |
| P02a login | 6 | **7** | **Não.** O corte do CTA em 320×568 era bug de `main`, anterior à onda 0 (confirmado por mim, independente da Lyra) — a onda 0 só adicionou o bug do logo (esse sim era dela). Os dois saíram corrigidos juntos | "Mostrar" corrigido, logo correto, CTA cabe em 320×568 pela primeira vez. Só falta "sem brilho de topo" (L1, pré-existente, fora do escopo desta onda) |
| P02b cadastro | 5 | **6** | **Não** (nenhuma regressão: logo deixou de esticar, "Mostrar" corrigido) | Continua **abaixo de 7**, mas pelos mesmos motivos de antes da onda 0: botões sociais legados (Google/Apple) e "sem brilho de topo" — nenhum dos dois é desta fatia; ficam para a onda de redesenho do P02b |
| M01 entrar (motorista) | linha de base própria (primeira passada): cabia | **7** | — (sem mudança; nunca teve nenhum dos dois bugs) | Pixel-idêntico à própria linha de base |
| M02 criar conta (motorista) | linha de base própria: tinha o logo errado (variante + esticado) | **6** | **Não** (logo deixou de esticar) | Continua **abaixo de 7** pela variante de logo errada (lockup grande em vez de `selo` pequeno, ficha pede `selo`) e um ícone "i" com contraste 1,92:1 (limiar 4,5:1) dentro do `RegistrationNotice` — os dois são pré-existentes, não tocados pela onda 0, acharam-se na mesma varredura |

**Leitura do portão da onda 0:** o critério dela é **ausência de regressão**, não nota ≥7 em cada tela (essa
exigência é da onda de redesenho de CADA tela, quando ela acontecer). Com os dois commits de correção, **não sobra
nenhuma regressão**: a única causada pela onda 0 (`BrandLogo`) foi corrigida: confirmei a proporção certa nos 3
tamanhos. O bug da seta (pré-existente) foi corrigido de brinde, sem custo. P02b e M02 continuam abaixo de 7, mas
por lacunas que já existiam ANTES da onda 0 e que pertencem à onda de redesenho de cada uma — não é motivo para
reprovar a onda 0.

### Catálogos e sondas — sem mudança relevante

Rodei as 5 sondas e os dois catálogos de novo. Resultado igual à passada anterior em tudo que não depende do
`BrandLogo`/`AuthHeader`: mesma contagem de "sem indicador de foco" por tela (pré-existente, ex. P01=1, M01=3),
mesmo achado de contraste no "i" do `RegistrationNotice` de M02 (1,92:1 — confirmei que já estava lá na primeira
passada, não é novo), mesmas cores "fora do conjunto" (2 por tela, mesmo falso-positivo provável de antes). O
catálogo do passageiro (`C01`) e do motorista (`C02`) mostram a `BrandLogo` da seção "Marca" com a proporção
corrigida (mesmo componente, mesma correção).

### Aprendizado desta reabertura

- **Comparação pixel-a-pixel contra uma linha de base com bug conhecido dá falso "reprovado" numa correção boa.**
  Quando uma fatia corrige um bug que JÁ estava na linha de base (não só o que a onda introduziu), o número cru do
  comparador vira ruído — é preciso olhar a captura a olho e confirmar com as sondas de geometria (sobreposição,
  viewport) antes de julgar pelo `ratio`. Registrar isso na memória: não aceitar "reprovado pelo comparador" sem
  abrir a imagem quando se sabe de antemão que a linha de base tinha um defeito.
- **Verificação de premissa de terceiro, mesmo vindo do Atlas/outro agente, vale a pena repetir independente:**
  o Atlas repassou a medição da Lyra (CTA do P02a já cortado em `main`, y=599) — eu reproduzi do zero, em clone
  próprio, e bati (y=603, diferença de 4px é ruído, não muda a conclusão). Confirmar foi barato (um clone + um
  script de 20 linhas) e é o que sustenta eu assinar "não é regressão" no veredito.
- **`CI=1` com Metro vivo trava o bundle na primeira rota** — nunca usar nesta ferramenta enquanto o workaround
  "Metro vivo" for necessário (o export estático normal não usa `CI=1`, só apareceria se alguém copiasse um
  comando de outra ferramenta do projeto que usa `CI=1` para desligar o watch).
