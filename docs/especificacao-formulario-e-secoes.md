# Especificação: formulário de candidatura e seções depois da jornada

Autor: Apolo (direção de arte). Data: 19/11/2026.
Alvo: `site-cine/public/` (index.html, assets/css/style.css, assets/js/main.js).
Motivo: o dono reprovou a página pela quinta vez: "as imagens estão ótimas, mas o
restante do layout está muito feio e fraco, os elementos do formulário estão
amadores demais".

**O que NÃO muda:** as imagens, os recortes, os véus das faixas, a jornada de
scroll (o modo cinematográfico, as entradas das faixas, as brasas, a linha de
rota) e a paleta (`--canvas #0A1119`, `--panel #131E29`, `--accent #FFCC00`). A
tipografia continua Poppins 800 nos títulos e 500 no apoio, com JetBrains Mono
nos rótulos pequenos.

**Como isto foi medido:** Chromium 1254 (Playwright) contra o servidor
`http://localhost:4300`, nas larguras 1440x900, 1366x768, 1280x720 e 390x844,
com `getBoundingClientRect()` e `getComputedStyle()`. Nada aqui foi deduzido da
leitura do CSS. A parte 1 também foi **prototipada**: o CSS da seção 1.4 foi
injetado na página real, sem alterar arquivo nenhum, e os números "depois" da
tabela 1.6 são dessa injeção. As partes 2 a 6 são especificação com previsão.
Elas não foram prototipadas.

---

## 0. Três defeitos que valem para a página inteira

### 0.1 O peso 700 não existe, e tudo que pede 700 sai em 800

O Google Fonts carrega só `Poppins:wght@500;800`. Seis regras pedem
`font-weight: 700`: os rótulos, o botão, a pergunta do FAQ, o rótulo do
simulador, os valores do simulador e o skip-link. Medição: "Enviar candidatura"
a 40px mede **402,6px em 700 e 402,6px em 800**. É o mesmo desenho. Por isso
cada rótulo de campo grita com a mesma força do título do cartão, e o formulário
não tem hierarquia.

**Correção:** não carregue um terceiro peso. Troque cada `700` por `500` ou por
`800`, conforme a tabela de cada seção abaixo. A decisão do dono (800 e 500)
continua de pé.

### 0.2 A regra global de foco quadra os botões redondos

```css
a:focus-visible, button:focus-visible, ... { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
```

Medido navegando com Tab: o botão "Enviar candidatura" (`border-radius: 999px`)
vira **r=4px** quando recebe foco. Isso também acontece com o CTA do hero e com
as setas e a pausa do carrossel, que são círculos de 44px. A pílula vira um
retângulo no momento em que alguém a usa pelo teclado.

**Correção:** remova `border-radius: 4px;` dessa regra global. O contorno
(`outline`) já segue o raio do próprio elemento nos navegadores atuais. Os
campos de formulário ganham um foco próprio (seção 1.4), e o botão primário
também.

### 0.3 Os números da página não são tabulares

Poppins não tem algarismos tabulares. Medição: "11" e "88" a 40px dão 31,0px e
52,3px, **com e sem** `font-variant-numeric: tabular-nums`. Qualquer número que
muda enquanto a pessoa arrasta a barra do simulador faz o texto pular. A solução
está na seção 5: alinhar à direita dentro de uma caixa de largura fixa.

---

## 1. O formulário de candidatura (prioridade máxima)

### 1.1 O que está errado, medido em 1440x900

| # | Defeito | Medida | Por que parece amador |
|---|---|---|---|
| F1 | O cartão sai da tela em notebook comum | Em 1280x720, o topo do cartão fica em **y = -43px**, e o título "Candidatura de motorista" é cortado. Em 1366x768, o topo fica em y = 4,8px, por baixo do cabeçalho fixo de 76px. | O palco da jornada é `sticky` com 100svh e `overflow:hidden`. A faixa ancora o conteúdo embaixo (`align-items:flex-end`), então tudo que passa da altura da tela some para cima, e rolar não traz de volta. |
| F2 | O erro empurra o cartão para fora da tela | Ao enviar vazio em 1440x900, o cartão vai de **731px para 974px** de altura. O botão continua em y = 669px, mas o topo do cartão vai para **y = -106px**. O título e o campo Nome ficam inalcançáveis. Rolando para 150px e 300px, o botão continua em 669: nada se move. | É o defeito mais grave do formulário. A pessoa erra e perde de vista justamente o campo que errou. |
| F3 | Colunas de 159px | Com o cartão de 380px e padding de 24px, cada campo da linha dupla tem **159px**. | O campo é estreito demais para um e-mail ou um nome completo. |
| F4 | A primeira linha fica desalinhada | O rótulo "Telefone (WhatsApp)" quebra em 2 linhas (**47px** contra 24px). O campo Telefone começa em y = 252 e o Nome em y = 228: **24px de degrau**. | Campos lado a lado desalinhados são o sinal mais clássico de formulário malfeito. |
| F5 | Os rótulos competem com o título | Rótulo com 15,2px em 800 (o 700 do item 0.1). Título do cartão com 18,4px em 800. Razão de **1,2**. | Sem hierarquia: o olho não sabe por onde começar. |
| F6 | Campos que parecem "buracos pretos" | O fundo é `#0A1119` sólido sobre o vidro fosco, e a borda é `rgba(255,255,255,.14)`. Não há placeholder. | Retângulos opacos colados no vidro, sem nenhum sinal do que digitar. |
| F7 | O select é o nativo | `appearance: auto`. A seta é a do sistema, encostada na borda. "Selecione" aparece na mesma cor de um valor preenchido. | É o elemento que mais denuncia "formulário padrão do navegador". |
| F8 | Os rádios são o fieldset padrão | Cada fieldset tem **155px**. A legenda quebra em 2 linhas e fica **em cima da borda**. O fieldset começa em x = 917 e os campos em x = 915 (2px de margem padrão). Os rádios nativos de 18px ficam empilhados e soltos no meio. O alvo de toque do rótulo tem **24px** de altura, abaixo dos 44px recomendados. | Esse bloco é o que o dono chamou de amador. A legenda atravessando a borda é desenho de navegador dos anos 2000. |
| F9 | Foco duplo e solto | Fica a borda amarela **mais** um contorno de 3px afastado 3px. São dois anéis desencontrados. | O foco parece um erro de renderização, não um estado desenhado. |
| F10 | O erro é só cor | A mensagem tem 13,6px e quebra em **2 linhas** (42px) nas colunas de 159px. Não há `aria-invalid` (contei 0). Não há `aria-describedby`. Além disso, um resumo de 106px ("Revise os campos marcados") aparece acima do botão. | O resumo duplica as mensagens dos campos e é ele que mais faz o cartão crescer. |
| F11 | O aviso legal ocupa 15% do cartão | São 11,84px em 6 linhas: **107px de 731px**. | É letra miúda demais e ocupa espaço demais. |
| F12 | O CTA do hero não faz nada no desktop | "Quero me candidatar" (x = 170) aponta para `#candidatura`, que já está visível ao lado (x = 890). No modo cinematográfico, clicar não muda nada na tela. | Um botão que não reage parece quebrado. |
| F13 | O cabeçalho passa por cima do formulário no celular | Em 390px, ao rolar, a logo fixa (76px de cabeçalho, com gradiente que vai a 0% de opacidade) fica sobre o título do cartão. | Logo sobre texto parece sobreposição acidental. |

### 1.2 A nova estrutura do cartão

Ordem de cima para baixo (é a que foi prototipada):

1. Título "Candidatura de motorista".
2. **Nome completo**, em largura total.
3. **Telefone (WhatsApp)** e **E-mail**, em 2 colunas iguais.
4. **Cidade onde dirige** e **UF**, em grade `1fr 136px`. A UF é curta e não
   precisa de meia linha.
5. **Já dirige por aplicativo? (opcional)**: texto à esquerda e um controle
   segmentado [Sim | Não] à direita, numa linha só.
6. **Tem veículo próprio? (opcional)**: igual ao item anterior.
7. Botão "Enviar candidatura", em largura total.
8. Aviso legal, separado por um fio.

No celular (abaixo de 480px), Telefone e E-mail empilham. Cidade e UF continuam
lado a lado. Nas perguntas opcionais, o texto fica em cima e o segmentado ocupa
a largura toda.

### 1.3 Marcação (o que muda no index.html)

**Campos.** Reorganize as linhas assim e acrescente `placeholder`, `inputmode`
e o id da mensagem de erro:

```html
<div class="field">
  <label for="field-name">Nome completo</label>
  <input type="text" id="field-name" name="name" autocomplete="name" placeholder="Maria da Silva" required>
</div>
<div class="form-row">
  <div class="field">
    <label for="field-phone">Telefone (WhatsApp)</label>
    <input type="tel" id="field-phone" name="phone" autocomplete="tel" inputmode="tel" placeholder="(84) 90000-0000" required>
  </div>
  <div class="field">
    <label for="field-email">E-mail</label>
    <input type="email" id="field-email" name="email" autocomplete="email" inputmode="email" placeholder="voce@email.com" required>
  </div>
</div>
<div class="form-row form-row--city">
  <div class="field">
    <label for="field-city">Cidade onde dirige</label>
    <input type="text" id="field-city" name="city" autocomplete="address-level2" placeholder="Natal" required>
  </div>
  <div class="field">
    <label for="field-state">UF</label>
    <select id="field-state" name="state" autocomplete="address-level1" required>
      <option value="" disabled selected>Selecione</option>
      <!-- as 27 UFs, iguais às de hoje -->
    </select>
  </div>
</div>
```

**Perguntas opcionais.** A legenda continua existindo para o leitor de tela, mas
fica visualmente oculta. O texto visível é um `span` com `aria-hidden`.
Prototipei com `legend { float:left }` dentro de um fieldset flex e **não
funcionou** no Chromium: a legenda ficou centralizada em cima, a 75px de
altura por linha. Use o invólucro abaixo, que mediu 44px:

```html
<fieldset class="field field--choice">
  <legend class="visually-hidden">Já dirige por aplicativo? (opcional)</legend>
  <div class="choice__row">
    <span class="choice__label" aria-hidden="true">Já dirige por aplicativo? <span class="optional">(opcional)</span></span>
    <div class="seg">
      <label class="seg__opt"><input type="radio" name="alreadyDrivesForApp" value="true"><span>Sim</span></label>
      <label class="seg__opt"><input type="radio" name="alreadyDrivesForApp" value="false"><span>Não</span></label>
    </div>
  </div>
</fieldset>
```

Faça o mesmo para "Tem veículo próprio?" (`name="hasOwnVehicle"`). Os dois
fieldsets ficam dentro de um `<div class="form-choices">`, que substitui a
terceira `.form-row`.

**Botão.**
`<button type="submit" class="button button--primary button--submit"><span class="button__label">Enviar candidatura</span></button>`

### 1.4 CSS do formulário (valores finais)

Novos tokens. Acrescente ao `:root`:

```css
:root {
  color-scheme: dark;                         /* lista do select, barra de rolagem e autocompletar em modo escuro */
  --danger: #FF8A80;                          /* já era a cor do erro; vira token */
  --danger-ring: rgba(255, 138, 128, 0.16);
  --field-bg: rgba(255, 255, 255, 0.05);
  --field-bg-focus: rgba(255, 255, 255, 0.08);
  --field-border: rgba(255, 255, 255, 0.14);
  --field-border-hover: rgba(255, 255, 255, 0.26);
  --label: #C9D3DE;                           /* entre o texto primário e o secundário */
  --placeholder: #7D8B9B;
  --ring: 0 0 0 4px rgba(255, 204, 0, 0.18);
}
```

| Elemento | Propriedade | Hoje (medido) | Novo |
|---|---|---|---|
| Cartão (>= 900px) | largura | 380px (flex-basis) | **440px** |
| Cartão | padding | 24px | **28px** (20px abaixo de 480px) |
| Cartão | raio | 16px | **20px** |
| Cartão | fundo e vidro | `rgba(19,30,41,.56)` + blur 18px | **`rgba(19,30,41,.72)`** + `blur(20px) saturate(140%)`; plano B sem backdrop: `rgba(19,30,41,.92)` |
| Cartão | borda e sombra | `1px rgba(255,255,255,.16)` | `1px rgba(255,255,255,.12)` + `inset 0 1px 0 rgba(255,255,255,.06), 0 30px 80px -24px rgba(0,0,0,.7)` |
| Título do cartão | tamanho, peso | 18,4px / 800 | **24px / 800**, `letter-spacing:-0.03em`, `line-height:1.2`, margem inferior **20px** |
| Espaço entre blocos do form | gap | 12px | **14px** (entre linhas) e **12px** (entre colunas) |
| Rótulo | tamanho, peso, cor | 15,2px / 800 / `#F4F7FA` | **13px / 500 / `--label`**, `line-height:1.45` |
| Rótulo até o campo | gap | 6,4px | **6px** |
| Campo | altura | 54px | **48px** fixos (`height`, não padding) |
| Campo | padding | 13,6px 16px | `0 14px` |
| Campo | raio | 10px | **12px** |
| Campo | fundo | `#0A1119` sólido | **`--field-bg`** (o vidro aparece por baixo) |
| Campo | borda em repouso | `rgba(255,255,255,.14)` | igual (`--field-border`) |
| Campo | borda no hover | não existe | **`--field-border-hover`** |
| Campo | texto | 16px `#F4F7FA` | igual. **Não desça de 16px**: abaixo disso o iOS dá zoom ao focar. |
| Campo | placeholder | não existe | `--placeholder`, `opacity:1` |
| Campo | foco | borda amarela + contorno de 3px a 3px | **`outline:none`**, borda `--accent`, fundo `--field-bg-focus` e anel **`box-shadow: var(--ring)`** (4px colado, sem vão) |
| Campo | transição | nenhuma | `border-color, box-shadow, background-color` .15s ease |

```css
.field label, .choice__label { font: 500 0.8125rem/1.45 var(--font-body); color: var(--label); letter-spacing: 0.005em; }
.optional { color: var(--text-secondary); }

.field input[type="text"], .field input[type="tel"], .field input[type="email"], .field select {
  height: 48px; padding: 0 14px; border-radius: 12px;
  background: var(--field-bg); border: 1px solid var(--field-border);
  font-size: 1rem; line-height: 1;
  transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
}
.field input:hover, .field select:hover { border-color: var(--field-border-hover); }
.field input:focus, .field select:focus {
  outline: none; border-color: var(--accent); background: var(--field-bg-focus); box-shadow: var(--ring);
}
.field input::placeholder { color: var(--placeholder); opacity: 1; }

/* Autopreenchimento do Chrome: sem isto o campo vira um bloco azul-claro no cartão escuro */
.field input:-webkit-autofill,
.field input:-webkit-autofill:hover,
.field input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text-primary);
  caret-color: var(--text-primary);
  box-shadow: 0 0 0 1000px #1A2531 inset;      /* cor do --field-bg sobre o cartão, em opaco */
  transition: background-color 9999s ease-out 0s;
}
.field input:-webkit-autofill:focus { box-shadow: 0 0 0 1000px #1D2834 inset, var(--ring); }
```

**Select de UF (o mais difícil).** O controle nativo é removido, mas o `<select>`
continua. Assim o teclado, o leitor de tela e a lista nativa do celular
continuam funcionando.

```css
.field select {
  appearance: none; -webkit-appearance: none;
  padding-right: 38px; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23A8B4C2' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 14px center; background-size: 12px 8px;
}
.field select:focus { background-image: url("...mesmo SVG com stroke='%23FFCC00'..."); }  /* a seta fica amarela no foco */
.field select:invalid { color: var(--placeholder); }   /* "Selecione" na cor de placeholder, não de valor */
.field select option { background: #131E29; color: #F4F7FA; }
.form-row--city { grid-template-columns: 1fr 136px; }  /* vale também abaixo de 480px */
```

- Atenção à largura da UF. No protótipo, com 104px, "Selecione" foi cortado
  para "Selecio". A coluna precisa de **136px**: 14px de padding, cerca de 80px
  de texto e 38px para a seta.
- `select:invalid` funciona porque o campo é `required` e a primeira opção tem
  `value=""`.
- `color-scheme: dark` no `:root` é o que deixa a lista aberta escura no
  Chrome/Edge do Windows. Isso **não foi verificado** (a lista nativa não sai
  na captura headless). Confira à mão.

**Controle segmentado (no lugar dos rádios).** O rádio nativo continua no DOM,
transparente e cobrindo a opção inteira. Por isso as setas do teclado, o Tab e
o leitor de tela funcionam sem nenhum JS.

```css
.form-choices { display: grid; gap: 10px; }
.field--choice { border: 0; padding: 0; margin: 0; min-inline-size: 0; }
.choice__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.seg {
  display: inline-grid; grid-auto-flow: column; grid-auto-columns: 76px; gap: 3px; padding: 3px; flex: 0 0 auto;
  border-radius: 12px; background: var(--field-bg); border: 1px solid var(--field-border);
}
.seg__opt {
  position: relative; display: flex; align-items: center; justify-content: center;
  height: 36px; border-radius: 9px;                      /* 12 - 3 de padding = raio concêntrico */
  font: 500 0.875rem/1 var(--font-body); color: var(--text-secondary); cursor: pointer;
  transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
}
.seg__opt input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.seg__opt:hover { color: var(--text-primary); }
.seg__opt:has(input:checked) { background: rgba(255, 204, 0, 0.16); color: var(--accent); box-shadow: inset 0 0 0 1px rgba(255, 204, 0, 0.55); }
.seg__opt:has(input:focus-visible) { box-shadow: 0 0 0 2px var(--canvas), 0 0 0 4px var(--accent); }

@media (max-width: 539px) {
  .choice__row { flex-direction: column; align-items: stretch; gap: 8px; }
  .seg { grid-auto-columns: 1fr; width: 100%; }
  .seg__opt { height: 40px; }                            /* a caixa .seg mede 48px: alvo de toque confortável */
}
```

- O selecionado usa o amarelo **translúcido**, não o sólido. O único amarelo
  sólido do cartão é o botão. Se o selecionado também fosse sólido, os dois
  disputariam o olhar.
- Navegadores sem `:has()` (Safari 15.3 ou anterior, Firefox 120 ou anterior)
  perdem só o realce visual da opção marcada. A escolha continua funcionando.
  Se for preciso cobrir esses navegadores, troque `:has()` por
  `input:checked + span` e aplique o fundo no `span`.

**Botão Enviar.**

| Estado | Valor |
|---|---|
| Repouso | altura **52px**, largura 100%, raio 999px, fundo `#FFCC00`, texto `#0A1119` Poppins **800** 16px `letter-spacing:-0.01em`, sombra `inset 0 1px 0 rgba(255,255,255,.35), 0 12px 28px -14px rgba(255,204,0,.6)`, margem superior 6px |
| Hover | fundo `#FFD84D`, `translateY(-1px)` (já existe) |
| Pressionado (`:active`) | fundo **`#E6B800`**, `transform: translateY(0) scale(.99)`, sombra `inset 0 2px 4px rgba(0,0,0,.18)` |
| Foco (teclado) | `outline:none`, `box-shadow: 0 0 0 3px #0A1119, 0 0 0 5px #FFCC00` (anel com vão navy, mantém a pílula) |
| Enviando | **continua amarelo**, com `opacity:.72` e `cursor:progress`. O texto vira "Enviando..." e um spinner de 16px (borda 2px `#0A1119` com o topo transparente, `animation: spin .7s linear infinite`) entra à esquerda. Use `aria-busy="true"` e `disabled`. **Hoje o botão fica cinza ao enviar, e isso parece erro.** |
| Desabilitado de fato | o estilo de hoje (painel e cinza) fica reservado para isso. Neste formulário ninguém usa. |

**Aviso legal.** `font-size: 12px; line-height: 1.55; color: var(--text-secondary);`
com `padding-top: 14px; border-top: 1px solid rgba(255,255,255,.08); margin-top: 2px;`.
O link continua amarelo.

### 1.5 Estados de erro, aviso e sucesso

**Erro no campo (validação do próprio navegador, antes de enviar):**

- A borda do campo fica `--danger`. No foco, o anel vira `0 0 0 4px var(--danger-ring)`.
- Mensagem: `<p class="field-error" id="err-<name>">`. O nome de classe novo
  substitui `.field--error`, que é nome de modificador usado como elemento.
  Estilo: 12.5px / 500, `line-height:1.4`, cor `--danger`, `display:flex; gap:6px; align-items:center`.
  Antes do texto vai um ícone SVG de 14px (círculo com exclamação,
  `stroke: currentColor`, 1.75).
- Acessibilidade: no input, `aria-invalid="true"` e `aria-describedby="err-<name>"`.
  Remova os dois quando o erro for limpo. Ao validar, coloque o foco no
  **primeiro** campo inválido.
- **Mensagens curtas, numa linha só** (a de 159px quebrava em 2):

  | Campo | Hoje | Novo |
  |---|---|---|
  | name | Preencha seu nome completo. | Informe seu nome completo. |
  | phone | Preencha um telefone com WhatsApp. | Informe um WhatsApp. |
  | email | Preencha um e-mail válido. | Informe um e-mail válido. |
  | city | Preencha a cidade onde você dirige. | Informe a cidade. |
  | state | Selecione a UF. | Escolha a UF. |

- **Correção ao vivo:** no evento `input` (ou `change`, no select), se o campo
  passou a ter valor, limpe o erro **daquele** campo. A pessoa vê a mensagem
  sumir enquanto corrige.
- **Não mostre o resumo "Revise os campos marcados"** na validação do próprio
  navegador. Ele é redundante com as mensagens dos campos e mede 106px. Esse
  tamanho é a causa principal do F2. O resumo continua só para erro do
  servidor.

**Mensagem de status (servidor):** use um componente só, com uma barra de 3px
à esquerda.

```css
.form-status { border-radius: 12px; padding: 12px 14px 12px 16px; font-size: 0.875rem; line-height: 1.5;
  border: 0; border-left: 3px solid; display: none; }
.form-status[data-state] { display: block; }
.form-status h3 { font-size: 0.9375rem; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 2px; }
.form-status[data-state="error"] { background: rgba(255,138,128,.10); border-left-color: var(--danger); color: #FFD3CF; }
.form-status[data-state="info"]  { background: rgba(255,255,255,.05); border-left-color: var(--text-secondary); color: var(--text-primary); }
```

O estado `info` com "Enviando..." deixa de existir, porque quem mostra o envio é
o botão. O `info` passa a valer só para "Ainda não dá para enviar por aqui".
Hoje esse é o caminho real em produção, porque `config.js` está com
`apiBaseUrl: ''`.

**Sucesso:** substitui o conteúdo do formulário, mas o cartão continua.

```css
.form-status[data-state="success"] { background: none; border: 0; padding: 8px 0 4px; text-align: center; }
.form-status[data-state="success"]::before {            /* selo de confirmação */
  content: ""; display: block; width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%;
  background: rgba(255,204,0,.14) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5' fill='none' stroke='%23FFCC00' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/26px no-repeat;
  box-shadow: inset 0 0 0 1px rgba(255,204,0,.45);
}
.form-status[data-state="success"] h3 { font-size: 1.375rem; letter-spacing: -0.03em; margin-bottom: 6px; }
.form-status[data-state="success"] p  { color: var(--text-secondary); font-size: 0.9375rem; max-width: 30ch; margin-inline: auto; }
```

O título do cartão ("Candidatura de motorista") continua visível acima do
selo. O texto do sucesso é o literal do pacote. Ao entrar no estado de sucesso,
mova o foco para o `#form-status` (com `tabindex="-1"`).

### 1.6 Antes e depois, medidos (o CSS acima injetado na página real)

| Medida | Antes | Depois (medido no protótipo) |
|---|---|---|
| Altura do cartão em repouso (1440x900) | 731px | **661px** |
| Altura do cartão com 1 erro (1440x900) | 974px (com todos os erros e o resumo) | **685px** (+24px por linha com erro, sem resumo) |
| Topo do cartão em 1440x900 | 137 | **207** |
| Topo do cartão em 1366x768 | 4,8 (sob o cabeçalho de 76px) | **75** (encosta no cabeçalho, ver 1.7) |
| Topo do cartão em 1280x720 | **-43** (cortado) | **27** (ainda sob o cabeçalho, ver 1.7) |
| Largura do campo Nome | 159px | **382px** |
| Telefone e E-mail | 159px cada, com degrau de 24px | **185px** cada, alinhados em y = 396 |
| Cidade e UF | 159 + 159, em linhas diferentes | **266 + 104** na mesma linha (a UF vai para 136, ver o aviso da 1.4) |
| Linha de cada pergunta opcional | 147px de altura, 155px de largura | **44px** de altura, 382px de largura |
| Segmentado | rádio de 18px, alvo de 24px | **163x44** (desktop), **292x48** (390px) |
| Botão | 330x55 | **382x52** |
| Cartão em 390x844 | 1029px | **874px** |

Capturas do protótipo (efêmeras, no scratchpad da sessão):
`C:\Users\PERSON~1\AppData\Local\Temp\claude\b965db02a7259a64\805e8af0-320a-41a6-b1e3-a1c062f8131d\scratchpad\m\proto-1440.png`,
`...\scratchpad\m\proto-card-erro.png` e `...\scratchpad\m\proto-390.png`.
O CSS injetado está em `...\scratchpad\m\spec.css`.

### 1.7 Rede de segurança da altura: obrigatória

O cartão melhorado mede 661px, mas o palco da jornada tem a altura da tela. Num
notebook de 1280x720, o cartão fica sob o cabeçalho mesmo depois de enxugado. Um
formulário nunca pode ficar fora do alcance. Regra no `main.js`:

- Em `cinematicAllowed()`, acrescente uma condição: o modo cinematográfico só
  liga se `window.innerHeight >= card.offsetHeight + 76 + 32 + 16`. Os números
  são o cabeçalho, o padding inferior do hero e uma folga.
- Rode `syncMode()` também **depois de mostrar ou limpar erros** e depois do
  sucesso, porque a altura do cartão muda nesses momentos.
- Quando a condição falha, a página cai no layout empilhado que já existe e
  que já funciona. As faixas continuam lá, só sem o palco fixo. Isso **só**
  acontece em telas baixas. Em 1440x900 e 1366x768 a jornada continua igual.
  Previsão: em 1366x768, 661 + 124 = 785 > 768, então **o modo cinematográfico
  desligaria em 1366x768** se o aviso legal continuar com 5 linhas. Por isso
  existe a decisão abaixo.

**Decisão do dono (registre em PROGRESSO.md):** encurtar o aviso legal visível
no cartão. Proposta, só com frases que já estão no texto literal:

> Usamos seus dados só para avaliar a candidatura e avisar o resultado. Não vendemos nem repassamos. <a>Como tratamos seus dados</a>

O link abre um `<details>` logo abaixo, com o texto literal completo. Previsão:
o aviso cai de 108px para cerca de 38px, e o cartão de 661 para cerca de **591px**.
Com isso, 1366x768 fica no modo cinematográfico (591 + 124 = 715 < 768), e
1280x720 também (715 < 720, no limite). **Sem a aprovação do dono, mantenha o
texto inteiro e confie na rede de segurança.**

### 1.8 Cabeçalho e CTA do hero (fecham F12 e F13)

- **Cabeçalho sólido ao rolar.** Coloque a classe `.is-scrolled` quando
  `cinematic ? scrollY > journey.offsetHeight - 76 : scrollY > 8`. Estilo:
  `background: rgba(10,17,25,.82); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(255,255,255,.06);`
  com transição de .2s. Sobre as fotos da jornada no desktop, o cabeçalho
  continua transparente como hoje.
- **CTA "Quero me candidatar"** a partir de 900px: no clique, `preventDefault()`
  e `document.getElementById('field-name').focus({ preventScroll: true })`. O
  anel de foco amarelo (seção 1.4) passa a ser a resposta visível ao clique.
  Abaixo de 900px a âncora continua como hoje. Acrescente `scroll-margin-top: 92px`
  no `#candidatura`, para a âncora não parar debaixo do cabeçalho.

---

## 2. Os quatro motivos

**Medido em 1440:** 4 cartões de 257x206px. A seção não tem título visível (o h2
é `visually-hidden`). Título com 20px. O texto termina em alturas diferentes, e o
cartão 3 tem cerca de 70px de painel vazio embaixo. O rótulo mono de 12,8px é o
único acento. A seção mede 350px e fica parecendo uma faixa de cartões soltos,
sem começo.

**Novo padrão de abertura de seção** (vale para motivos, FAQ e simulador):

```css
.section-head { margin-bottom: 40px; max-width: 640px; }              /* 28px abaixo de 640px */
.section-head .eyebrow { display: block; margin-bottom: 12px; font-size: 0.75rem; }
.section-head h2 { font-size: clamp(2rem, 1.3rem + 2.2vw, 2.75rem); letter-spacing: -0.035em; line-height: 1.1; }
```

Previsão: 44px em 1440 e 32px em 390. O `.section-heading` de hoje mede 33,6px.

- Torne visível o h2 que já existe: "Motivos para se candidatar". Rótulo acima: `MOTIVOS`.
- Grade: 4 colunas a partir de 1100px, 2 a partir de 640px, 1 abaixo. `gap: 20px`.
- Cartão:

```css
.reason-card {
  position: relative; min-height: 248px; padding: 28px 24px 32px; border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)), #111B25;
  border: 1px solid rgba(255,255,255,.07);
  transition: border-color .2s ease, transform .2s ease;
}
.reason-card::before { content: ""; display: block; width: 28px; height: 2px; border-radius: 2px; background: var(--accent); margin-bottom: 20px; }
.reason-card:hover { border-color: rgba(255,204,0,.32); transform: translateY(-2px); }
.reason-card__label { font-size: 0.6875rem; letter-spacing: 0.16em; }
.reason-card__title { font-size: 1.375rem; letter-spacing: -0.03em; line-height: 1.2; margin: 10px 0; }
.reason-card__body  { font-size: 0.9375rem; line-height: 1.6; }
```

  O `min-height` iguala o fundo dos quatro cartões. Abaixo de 640px use
  `min-height: 0`.

## 3. O compromisso público

**Medido:** 1100x102px. O fundo é `rgba(255,204,0,.18)` sobre `#0A1119`, o que dá
cerca de **`#36331A`**: um verde-oliva sujo, que não pertence à paleta. A borda é
amarela sólida de 1,5px. O texto ocupa 1 linha e meia em 16,8px, e o ícone tem
28px. Fica parecendo um alerta de sistema, não uma promessa da marca.

```css
.commitment {
  max-width: 880px; margin-inline: auto;
  display: grid; grid-template-columns: 56px 1fr; gap: 24px; align-items: start;
  padding: 36px 40px; border-radius: 24px;
  background: radial-gradient(120% 160% at 0% 0%, rgba(255,204,0,.09) 0%, rgba(255,204,0,0) 55%), #111B25;
  border: 1px solid rgba(255,204,0,.28);
}
.commitment__icon-wrap { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center;
  background: rgba(255,204,0,.12); border: 1px solid rgba(255,204,0,.3); color: var(--accent); }
.commitment__icon { width: 26px; height: 26px; margin: 0; }
.commitment .eyebrow { display: block; margin-bottom: 8px; font-size: 0.75rem; }
.commitment p { font-size: 1.25rem; line-height: 1.5; max-width: 52ch; }
@media (max-width: 639px) {
  .commitment { grid-template-columns: 1fr; gap: 16px; padding: 24px; }
  .commitment p { font-size: 1.0625rem; }
}
```

Marcação: envolva o SVG em `<span class="commitment__icon-wrap">`. Acrescente
`<span class="eyebrow">COMPROMISSO PÚBLICO</span>` antes do `<p>`. O texto é o
do `aria-label`, que já existe.

## 4. Perguntas frequentes

**Medido em 1440:** 5 caixas de 1100x66px. As perguntas têm cerca de 250px de
texto, e o "+" fica a 1100px de distância delas. São 850px de barra vazia por
linha. O "+" é o caractere da JetBrains Mono, não um ícone desenhado.

- Layout de 2 colunas a partir de 960px: `grid-template-columns: 340px 1fr; gap: 64px; align-items: start`.
  - **Esquerda**, com `position: sticky; top: 112px`: rótulo `DÚVIDAS`, o h2
    "Perguntas frequentes" e um parágrafo de 15px em `--text-secondary`: "Não
    achou sua dúvida? Fale pelo WhatsApp <a>(84) 3113-2584</a>." (o contato é o
    mesmo do rodapé).
  - **Direita**: a lista, `max-width: 720px`.
- Os itens deixam de ser caixas e viram uma lista com fios:

```css
.faq__item { background: none; border: 0; border-top: 1px solid rgba(255,255,255,.08); border-radius: 0; padding: 0; }
.faq__item:last-child { border-bottom: 1px solid rgba(255,255,255,.08); }
.faq__item summary { min-height: 72px; padding: 22px 0; font-size: 1.0625rem; font-weight: 800; letter-spacing: -0.02em; gap: 24px; }
.faq__item summary::after {                               /* círculo de 32px com um "+" desenhado por gradiente */
  content: ""; width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,.18);
  background:
    linear-gradient(var(--accent), var(--accent)) center/12px 1.75px no-repeat,
    linear-gradient(var(--accent), var(--accent)) center/1.75px 12px no-repeat;
  transition: transform .2s ease, background-color .2s ease, border-color .2s ease;
}
.faq__item summary:hover::after { border-color: var(--accent); }
.faq__item[open] summary::after {
  transform: rotate(45deg); border-color: var(--accent);
  background:
    linear-gradient(#0A1119, #0A1119) center/12px 1.75px no-repeat,
    linear-gradient(#0A1119, #0A1119) center/1.75px 12px no-repeat, var(--accent);
}
.faq__item p { margin: 0; padding: 0 56px 24px 0; border: 0; font-size: 1rem; line-height: 1.65; max-width: 60ch; }
```

## 5. O simulador de taxa

**Medido em 1440:** a seção fica espremida à esquerda. Os 3 cartões terminam em
x = 810, num container que vai até 1270, e sobram **460px vazios** à direita. O
valor "20%" está em JetBrains Mono, cujo **zero tem um ponto no meio**: na
captura, "20%" se lê "28%". Para um número que é a razão de existir da seção,
esse é um defeito de legibilidade. A barra é o `range` nativo com trilho cinza.
Os rótulos dos 3 cartões estão em mono maiúsculo de 11,5px, cada um numa caixa,
e a conta não parece uma conta.

- **Painel único centrado:** `max-width: 960px; margin-inline: auto; padding: 40px; border-radius: 24px; background: #111B25; border: 1px solid rgba(255,255,255,.07);`
  (24px de padding abaixo de 640px).
- Cabeçalho com o `.section-head` da seção 2: rótulo `A CONTA` e o h2 "Simule a
  taxa". A introdução vai logo abaixo.
- **Duas colunas** a partir de 900px: `grid-template-columns: 1fr 1fr; gap: 48px; align-items: center`.
  Abaixo disso, uma coluna.
- **Coluna esquerda (controle):**
  - O rótulo vira "Taxa de exemplo", em 13px / 500 / `--label`.
  - O valor sai do rótulo e vira um número grande: Poppins **800 64px**, `line-height:1`,
    `letter-spacing:-0.04em`, cor `--accent`, dentro de uma caixa
    `display:inline-block; min-width: 2.6em; text-align: left`. Ele sai da
    JetBrains Mono (ver 0.3: a Poppins não tem algarismos tabulares, e a
    largura mínima segura o salto).
  - Faixa customizada:

```css
.rate-sim input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 28px; background: transparent; cursor: pointer; }
.rate-sim input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px;
  background: linear-gradient(to right, var(--accent) 0 var(--pct, 50%), rgba(255,255,255,.12) var(--pct, 50%) 100%); }
.rate-sim input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; margin-top: -9px; border-radius: 50%;
  background: var(--accent); border: 4px solid #0A1119; box-shadow: 0 0 0 1px rgba(255,204,0,.6), 0 4px 12px rgba(0,0,0,.4); }
.rate-sim input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,.12); }
.rate-sim input[type="range"]::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--accent); }
.rate-sim input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 4px solid #0A1119; box-shadow: 0 0 0 1px rgba(255,204,0,.6); }
.rate-sim input[type="range"]:focus-visible { outline: none; }
.rate-sim input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 1px rgba(255,204,0,.6), 0 0 0 7px rgba(255,204,0,.25); }
.rate-sim input[type="range"]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 7px rgba(255,204,0,.25); }
```

  - JS: dentro de `render()`, chame `range.style.setProperty('--pct', (value / max * 100) + '%')`.
  - Escala abaixo da faixa: "0%" à esquerda e "40%" à direita, em 12px
    `--text-secondary`, com `display:flex; justify-content:space-between; margin-top:6px`.
- **Coluna direita (a conta, em formato de recibo):**

```css
.rate-sim__breakdown { display: block; max-width: none; margin: 0; }
.rate-sim__breakdown div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
  background: none; border: 0; border-radius: 0; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
.rate-sim__breakdown dt { font-family: var(--font-body); font-size: 0.9375rem; text-transform: none; letter-spacing: 0; color: var(--text-secondary); margin: 0; }
.rate-sim__breakdown dd { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; text-align: right; min-width: 7ch; }
.rate-sim__breakdown div:last-child { border-bottom: 0; padding-top: 20px; }
.rate-sim__breakdown div:last-child dt { color: var(--text-primary); }
.rate-sim__breakdown div:last-child dd { font-size: 2rem; color: var(--accent); }
```

  Na linha "Taxa", o valor ganha um sinal de menos: "- R$ 20,00". É o hífen do
  teclado. Não use travessão, que o portão do texto proíbe.
- O aviso fica **abaixo das duas colunas**, ocupando a largura toda:
  `margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.08); font-size: 0.8125rem; max-width: none;`.

## 6. O rodapé

**Medido em 1440:** 4 parágrafos empilhados, com no máximo 614px de largura. A
metade direita do rodapé (656px) fica vazia. Todos os links estão sublinhados
em amarelo. E a última linha publica uma **nota interna**: "A marca é real,
então não existe aviso de marca fictícia...". Ela está no PACOTE-DE-DESIGN.md
como texto literal, mas é anotação de bastidor, não texto para o motorista. Ver
Pendências.

```css
.site-footer { background: #070D14; padding: 64px 0 32px; border-top: 1px solid rgba(255,255,255,.06); }
.site-footer__grid { display: grid; gap: 40px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .site-footer__grid { grid-template-columns: 1.4fr 1fr 1fr; gap: 64px; } }
.site-footer h3 { font-family: var(--font-mono); font-weight: 500; font-size: 0.6875rem; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--text-secondary); margin-bottom: 14px; }
.site-footer ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.site-footer a { color: var(--text-primary); text-decoration: none; }
.site-footer a:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.site-footer__bottom { margin-top: 48px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.06);
  font-size: 0.75rem; color: var(--text-secondary); display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: space-between; }
```

Estrutura:

- **Coluna 1:** a logo com 36px de altura e, abaixo, "VuumBora, mobilidade
  urbana." em 15px `--text-secondary`.
- **Coluna 2, `CONTATO`:** lista com e-mail, WhatsApp (84) 3113-2584 e
  Instagram @vuumbora.oficial. Cada item leva um ícone de 16px
  (`stroke: currentColor`) com 10px de gap.
- **Coluna 3, `EMPRESA`:** "Desenvolvido por Innovare Code" e "CNPJ
  09.813.446/0001-00", em linhas separadas.
- **Barra inferior:** à esquerda "© 2026 VuumBora". À direita, o aviso das
  fotos, no texto que o dono escolher (ver Pendências).

`#070D14` é o canvas escurecido 4%, para fechar a página. É derivado da paleta,
não é cor nova.

## 7. Ritmo da página depois da jornada

- **Medido:** todas as seções têm `padding-block: 72px` e todas são separadas
  por um fio. O resultado é uma faixa de altura igual atrás da outra, sem
  respiro maior antes das seções importantes.
- **Novo:** `padding-block: 112px` no desktop (a partir de 900px) e 72px no
  celular. Os fios em `--accent-muted` continuam, como pede o pacote, mas
  ficam a 112px do conteúdo.
- O compromisso entra mais perto: `padding-block: 72px` só nessa seção, porque
  ele é uma faixa e não uma seção com título.

## 8. Opcional, de menor prioridade: o título do hero

O H1 mede **44px** em 1440. A auditoria anterior (`docs/auditoria-arte-site.md`,
C2 e C3) fixou de 64 a 72px no desktop e nunca menos de 40px no celular. Isso é
texto, não imagem nem scroll, então não toca no que foi aprovado. Proposta:
`.hero-grid h1 { font-size: clamp(2.5rem, 1.6rem + 3vw, 4rem); }`, com
`.hero-grid .faixa-text { max-width: 600px; }`. Previsão: 64px em 1440, 3
linhas, e 40px em 390. **Faça depois das seções 1 a 7, e só se a altura
continuar cabendo:** o texto do hero divide a faixa com o cartão.

---

## 9. Critérios de aceite medíveis (para virar teste, não opinião)

Em 1440x900, 1366x768, 1280x720 e 390x844, com o servidor reiniciado:

1. O cartão está inteiro dentro da área visível e abaixo do cabeçalho:
   `card.top >= 76` e `card.bottom <= innerHeight` no modo cinematográfico,
   **em repouso e depois de enviar vazio**. Se não couber, o modo cinematográfico
   precisa estar desligado (`.journey` sem `is-cinematic`).
2. Em cada `.form-row`, os campos irmãos têm o mesmo `top` (diferença de 0px).
3. Todo input e select de texto mede 48px de altura. O botão mede 52px.
4. Cada opção do segmentado mede pelo menos 36px de altura no desktop, e a
   caixa `.seg` mede pelo menos 44px. No celular, cada opção mede pelo menos
   40px.
5. Nenhum `getComputedStyle(el).fontWeight === '700'` no documento.
6. Ao focar o botão pelo teclado, `borderRadius` continua `999px`.
7. Depois de enviar vazio, cada campo obrigatório tem `aria-invalid="true"` e um
   `aria-describedby` que aponta para uma mensagem existente, com altura de 1
   linha (no máximo 20px).
8. `select#field-state` tem `appearance: none`, e sua largura é de pelo menos
   136px.
9. No simulador, a fonte do valor em destaque é Poppins, e as 3 linhas da conta
   ficam à direita do controle a partir de 900px (`left` da conta > `right` da
   faixa).
10. O rodapé não contém o texto "marca fictícia".

## 10. Ordem de execução sugerida

1. Itens globais 0.1 e 0.2 (pesos e raio do foco). São 10 minutos e já
   melhoram tudo.
2. Formulário: 1.3, 1.4 e 1.5, depois a rede de segurança 1.7 e por fim 1.8.
3. Simulador (5), FAQ (4), motivos (2), compromisso (3), rodapé (6) e ritmo (7).
4. Medir os 10 critérios da seção 9 e comparar as capturas com
   `proto-1440.png` e `proto-390.png`.
5. Opcional: H1 (8).
