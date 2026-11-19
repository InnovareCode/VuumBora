---
name: project_site_cine_pagina_estatica
description: Página de pré-lançamento do VuumBora em site-cine/public — HTML/CSS/JS puro, sem build, jornada cinematográfica com crossfade por scroll sobre as 3 fotos (amanhecer/dia/entardecer). Use ao mexer em site-cine/public/ ou ao reaproveitar o padrão "jornada por scroll" em outro projeto.
metadata:
  type: project
---

Construída em 19/11/2026 a partir de `site-cine/PACOTE-DE-DESIGN.md` (rito da
skill `10k-websites`, com o desvio de usar 3 fotos geradas em vez de vídeo —
ver seção "Desvio declarado" do pacote). Projeto **separado** de `apps/site`
(Next.js) — fica dentro do monorepo Vuumbora mas não compartilha nada com ele
(sem tokens/`packages/*`, de propósito: arquitetura exigida era só
`index.html` + `assets/`, zero npm/build).

- **Estrutura:** `site-cine/public/index.html` + `assets/{css,js,img}`. As 3
  fotos (amanhecer/dia/entardecer, 1920 e 960) já vinham processadas em
  `assets/img/`, servidas via `<picture>`.
- **Jornada por scroll (hero cinematográfico):** cada faixa (`.faixa`) carrega
  foto+véu+texto JUNTOS no mesmo bloco (não um "stage" de imagens separado de
  um "stage" de textos) — a troca de faixa move foto e texto como uma unidade
  só. Modo BASE (sem JS, mobile, `prefers-reduced-motion`): `.faixa` é
  `position:relative;min-height:100svh`, empilhadas normalmente no fluxo — É
  o fallback real, funciona sem JS nenhum. Modo "cinematográfico" (classe
  `.is-cinematic`, só adicionada por JS quando `matchMedia('(min-width:900px)')`
  E `!prefers-reduced-motion`): `.journey` vira `height:300vh`,
  `.journey__stage` fica `position:sticky;top:0;height:100svh`, e cada
  `.faixa` vira `position:absolute;inset:0` com `opacity` controlada por JS
  (crossfade contínuo) + `data-active` (booleano, discreto) que dispara a
  "entrada" própria de cada faixa via CSS (faixa 1: sobe+desfoca; faixa 2:
  desliza lateral; faixa 3: só opacidade). **Writes no DOM só quando o índice
  ativo muda** (`data-active`); a opacidade contínua é escrita toda vez que
  há scroll, mas o laço (`requestAnimationFrame`) só é agendado por evento de
  `scroll`/`resize` — fica parado quando a página não rola.
- **Bug sério achado e corrigido:** `<picture>{display:block}` sem altura
  própria faz `img{height:100%}` resolver pra `auto` — ver
  [[bug_picture_sem_altura_img_height100_vira_auto]]. Só apareceu no modo
  empilhado; o cinematográfico mascarava porque `.faixa` ali também é
  `inset:0` (altura herdada direta).
- **Véu local sobre a foto** (não a foto inteira): gradiente vertical, mais
  forte perto do fim (onde o texto fica, `align-items:flex-end`). Calibrado
  por MEDIÇÃO real (Playwright + `sharp`, pixel do screenshot, nunca cor
  computada) contra o PIOR pixel numa faixa lateral ao texto (não embaixo do
  glifo, não a média da foto) — primeira calibração deu 4,63:1 no rótulo
  pequeno (eyebrow) a 1440px, perto demais do mínimo 4,5:1; reforcei o
  gradiente (estágios mais cedo: 28%/48%/66% em vez de 38%/62%/85%) e todas
  as combinações texto×faixa×largura (320/390/768/1440) ficaram ≥7,3:1.
- **Armadilha de medição própria (script, não bug da página):** ao sondear o
  "fundo atrás do texto" numa faixa HORIZONTAL inteira da tela, a amostra
  pegou a cor da **linha de rota SVG fixa** (decorativa, `position:fixed`,
  canto direito) a ~1400px de x, longe do texto — dava falso "REPROVA"
  (1,4:1, cor idêntica ao accent). Corrigido limitando a amostra a uma
  margem de ~110px ao lado do texto (e reservando a faixa da linha de rota
  quando ela existe, ≥1024px). Lição: amostrar fundo "ao lado do texto" tem
  que ser uma margem PRÓXIMA, não a tela inteira — outros elementos
  decorativos fixos podem estar longe o bastante pra não importar
  visualmente mas perto o bastante pra entrar na amostra.
- **Outra armadilha, essa de regra GLOBAL vazando pra seção errada:** a regra
  `section{padding-block:var(--space-7)}` (pensada pra espaçar as seções
  DEPOIS da jornada) também pegava a própria `<section class="journey">`
  (é um `<section>` também!) — criava 72px de padding-top na jornada
  inteira, cortando 72px da imagem por baixo (sticky stage com `overflow:
  hidden`) e deixando uma faixa preta vazia no topo. Corrigido trocando o
  seletor pra `.after-journey > section` (escopado). Lição: seletor de tag
  genérica (`section`, `button`, etc.) pra "espaçamento padrão de uma parte
  do layout" sempre vaza pra qualquer outro uso da mesma tag em outra parte
  da página — escopar pelo contêiner, não pela tag.
- **Linha de rota SVG** (`.route-line`, fixa, só ≥1024px): progresso do
  `stroke-dashoffset` segue o scroll da PÁGINA INTEIRA (não só da jornada).
  Sob `prefers-reduced-motion`, o JS nem roda (`initRouteLine` retorna cedo)
  e o traço fica 100% desenhado por padrão (sem `stroke-dasharray` definido
  em CSS = traço contínuo cheio) — estado final visível, motor parado, sem
  precisar de regra CSS extra pra isso.
- **Broken image:** `.faixa__media img{font-size:0;color:transparent}` —
  se a foto falhar, em vez do ícone quebrado + legenda alt enorme por cima da
  seção (testado derrubando todas as `.jpg` via `page.route().abort()`),
  sobra só o retângulo liso na cor do painel. O `alt` continua no DOM e chega
  normal a leitor de tela (visualmente invisível ≠ removido da árvore de
  acessibilidade).
- **Endpoint do formulário:** `POST /v1/driver-applications`, mesmo contrato
  de `packages/api-client/src/driver-applications` (anti-enumeração, erro
  400 com mapa `fields`, 429 rate limit, 5xx `unavailable`). Como a página é
  HTML estático sem build, não existe `process.env` — o endereço do backend
  vive num arquivo próprio, `assets/js/config.js`
  (`window.VUUMBORA_CONFIG.apiBaseUrl`), editado à mão por quem publica.
  Vazio por padrão: o formulário mostra aviso honesto ("ainda não dá pra
  enviar por aqui... fale pelo WhatsApp") em vez de fingir envio — testado
  via Playwright preenchendo e submetendo com `apiBaseUrl:''`.
- **Texto 100% literal do pacote de design**, inclusive a mensagem de
  sucesso (só aparece depois de um POST real, então vive em `main.js`, não
  no HTML estático) — conferido por script que extrai o texto renderizado do
  `index.html` e bate frase a frase contra o pacote; as duas únicas "ausentes"
  nessa checagem automática eram exatamente as que só existem via JS
  (confirmadas à parte, grep em `main.js`). Buscas por travessão (—) e pelas
  palavras de encher linguiça do pacote: zero ocorrências em todo
  `site-cine/public/` (HTML, CSS, JS, inclusive comentários).
- **Acréscimos de 19/11/2026 (logo, formulário no hero, carrossel):**
  logomarca (`assets/img/logo-vuumbora.png`) num `.site-header` fixo (overlay,
  `pointer-events:none` exceto no link da marca) e no rodapé; o cartão de
  candidatura inteiro (`#candidatura`) foi RELOCADO pra dentro da faixa 1,
  virando `.hero-card` em vidro fosco (`backdrop-filter` + `@supports` com
  plano B sólido) ao lado do texto — duas colunas só a partir de 900px
  (mesmo ponto em que o modo cinematográfico liga, de propósito, pra nunca
  existir uma faixa de largura com os dois modos descasados), `align-items:
  flex-start` (colunas de altura desigual, ver
  [[bug_align_items_center_vao_vazio_colunas_desiguais]]). Expôs 3 bugs reais
  só visíveis medindo (não lendo o CSS): [[bug_flex_item_min_width_auto_vaza_largura_input]],
  [[bug_veu_calibrado_para_posicao_antiga_do_texto]] (veio do reposicionamento
  do texto) e, no carrossel novo (5 artes, scroll-snap + autoplay 5,5s pela
  receita de [[feedback_carrossel_autoplay_acessivel]]),
  [[bug_carrossel_multi_peek_indice_e_fim_de_lista]] e
  [[bug_hidden_attribute_perde_para_display_de_autor]]. Título de carrossel em
  duas partes (`<strong>`+`<em>`, a segunda cor `--accent`) virou padrão
  reaproveitável pra "destaque parcial de frase" nesta página.
- **Medição sem ferramenta de browser dedicada:** mesma receita de
  [[feedback_medir_site_sem_browser_tool]] (`playwright-core` + `sharp`,
  versão 1.60.0 bateu com Chromium já em cache nesta máquina). Testado:
  overflow horizontal em 320/390/768/1440 (com JS, sem JS, com imagem, sem
  imagem) = 0 em todos; contraste por pixel real em todas as combinações
  faixa×largura; comportamento funcional (slider, validação de formulário,
  aviso sem API, fallback sem JS, foco no skip-link).
