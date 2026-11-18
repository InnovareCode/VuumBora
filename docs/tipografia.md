# VuumBora — Tipografia

> Peça que faltava da identidade. A paleta está em [identidade-visual.md](identidade-visual.md).
> Amostra visual: [prints/tipografia-candidatas.png](prints/tipografia-candidatas.png) (as 3 lado a lado, fundo `#070D18`, textos reais). Montserrat Alternates e o modelo de duas fontes: seção 7.
> Data: 2026-11-18 · Autor: Apolo (direção de arte) · Status: **proposta, aguardando escolha do dono**. Nada foi alterado em tokens, componentes ou dependências.

## 1. Recomendação

**Plus Jakarta Sans**, pesos 400 / 500 / 600 / 700, com `tabular-nums` obrigatório em todo valor que muda na tela.

Alternativa segura: **Manrope**. Alternativa expressiva: **Sora**. As três passam em todos os critérios inegociáveis. A escolha entre elas é de personalidade, e é do dono.

## 2. Critérios inegociáveis e como foram verificados

Nada abaixo veio de catálogo. Os arquivos foram baixados do repositório oficial do Google Fonts (`github.com/google/fonts/ofl/...`) e inspecionados com fontTools. Larguras e carregamento foram medidos no Chromium (Playwright), com a página servida por HTTP.

| Critério | Como foi medido |
|---|---|
| Licença comercial | Tabela `name` (ID 13) da própria fonte + `OFL.txt` do repositório |
| pt-BR completo | `cmap` verificado para `ã õ ç é à á í ó ú â ê ô ü` e maiúsculas: nenhuma faltando |
| Números tabulares | Existência da feature `tnum` no GSUB **e** largura renderizada de cada dígito 0–9 com `font-variant-numeric: tabular-nums`, nos pesos 400/500/600/700 |
| Pesos 400–700 | Eixo `wght` da tabela `fvar` |
| Corpo pequeno | Altura-x renderizada (canvas, `actualBoundingBoxAscent`) e amostra a 12 px no PNG |
| Tamanho | TTF variável, WOFF2 completo, WOFF2 só latin, e 4 TTF estáticos (instâncias geradas por `varLib.instancer`) |

## 3. Comparativo medido

| | **Plus Jakarta Sans** | **Manrope** | **Sora** |
|---|---|---|---|
| Licença | SIL OFL 1.1 | SIL OFL 1.1 | SIL OFL 1.1 |
| Variável | sim, `wght` 200–800 | sim, `wght` 200–800 | sim, `wght` 100–800 |
| pt-BR | completo | completo | completo |
| `tnum` | sim | sim | sim |
| Variação de largura dos dígitos com `tnum` | **0,00** em 400/500/600/700 | **0,00** | **0,00** |
| Largura do dígito tabular (100 px) | 60,0 px, igual nos 4 pesos | 62,0 px, igual nos 4 pesos | 67,6 px, igual nos 4 pesos |
| Variação **sem** `tnum` (100 px, peso 400) | 36,1 px (a que mais dança) | 23,1 px (a que menos dança) | 32,3 px |
| Altura-x / caixa-alta (em) | 0,54 / 0,75 | 0,54 / 0,72 | 0,54 / 0,73 |
| Endereço longo a 16 px¹ | 319 px | **310 px** | 345 px (+8%) |
| TTF variável | 172 KB | 160 KB | 108 KB |
| WOFF2 variável completo / só latin | 58 / 35 KB | 52 / 28 KB | 48 / 39 KB |
| 4 TTF estáticos (o que o app Expo embarca) | 4 × 94 = 377 KB | 4 × 95 = 381 KB | 4 × 57 = **228 KB** |
| Pacote Expo | `@expo-google-fonts/plus-jakarta-sans` | `@expo-google-fonts/manrope` | `@expo-google-fonts/sora` |

¹ "Av. Eng. Roberto Freire, 1962 - Ponta Negra", peso 400.

**Prova do tabular na amostra** (18 px, peso 600, medido no navegador):

| | Sem `tnum`: R$ 11,11 / 24,90 / 88,08 | Com `tnum` |
|---|---|---|
| Plus Jakarta Sans | 60,2 / 78,4 / 79,4 px (pula 19 px) | 75,7 / 75,7 / 75,7 px |
| Manrope | 59,1 / 75,1 / 75,7 px (pula 16 px) | 76,3 / 76,3 / 76,3 px |
| Sora | 64,0 / 82,4 / 82,5 px (pula 18 px) | 82,5 / 82,5 / 82,5 px |

Um preço que vai de R$ 11,11 para R$ 24,90 sem `tnum` cresce 16 a 19 px na tela. Com `tnum`, zero. É isso que faz o preço, o ETA e a distância não "dançarem".

### Eliminadas na triagem (e por quê)

| Fonte | Motivo |
|---|---|
| **Urbanist** | Nome perfeito, mas **não tem `tnum`** no GSUB. Reprova no critério de números |
| **DM Sans** | **Não tem `tnum`** (v4.004). Reprova |
| **Inter** (token atual) | Passa em tudo e é a mais legível, mas é a fonte padrão de metade dos apps do mundo: não dá identidade. E é a mais pesada: 341 KB WOFF2 completo, 1,3 MB em 4 TTF estáticos |
| **Geist** | Passa, mas a largura do dígito tabular **muda com o peso** (60,0 → 63,6 px de 400 a 700): um preço que troca de peso no estado selecionado muda de largura. Cara de ferramenta de desenvolvedor, não de mobilidade |
| **Onest** | Passa, mas sem diferencial de marca sobre as finalistas |
| **Space Grotesk** | Altura-x menor (0,49 em), pior em 12 px. Personalidade excêntrica demais para "confiável" |

## 4. As três finalistas

### 4.1 Plus Jakarta Sans — recomendada

**Por que combina:** é literalmente uma fonte de cidade. Foi encomendada em 2020 para a identidade "+Jakarta City of Collaboration" do governo da província de Jakarta (Tokotype, Gumpita Rahayu), inspirada em Neuzeit Grotesk e Futura. Geométrica como a logomarca, mas com cantos vivos e contraste quase monolinear que leem como **direta e ágil**. A caixa-alta mais alta das três (0,75 em) dá presença em "Para onde vamos?" e no preço em 700, sem precisar de peso 800. Largura moderada: endereço longo cabe melhor que em Sora.

**Riscos:**
- Os algarismos proporcionais são os que mais variam (36 px por 100 px). Sem `tnum`, ela é a que mais dança. Por isso `tabular-nums` precisa ser **regra do componente de número**, não lembrança de quem implementa.
- `I` maiúsculo e `l` minúsculo são idênticos (vale para as três finalistas). Placa Mercosul é só caixa-alta, então o risco real é `1` × `I`: o `1` tem bandeira e se distingue. O `0` é mais estreito que o `O`, mas sem traço. Se a placa um dia precisar de desambiguação forte, a solução é tratar a placa como componente próprio, não trocar a fonte.
- Popular em SaaS desde 2022. Distingue-se da concorrência de mobilidade, não do mundo inteiro.

### 4.2 Manrope — alternativa segura

**Por que combina:** a mais neutra e compacta das três (endereço 310 px). Algarismos com a menor variação proporcional, ou seja, a que menos sofre se alguém esquecer o `tnum`. Lê como **confiável**, tom de fintech. WOFF2 só-latin de 28 KB, o menor para web.

**Riscos:**
- Personalidade mais discreta: "VuumBora" em texto não tem a mesma garra.
- Métricas verticais maiores: na amostra, com `line-height` automático, a coluna da Manrope ficou mais alta que as outras. No app, `lineHeight` precisa ser explícito em todo estilo (boa prática de qualquer forma).
- O padrão do arquivo variável é peso **200** (não 400). Com instâncias estáticas no app isso some; na web, sempre declarar o peso.

### 4.3 Sora — alternativa expressiva

**Por que combina:** a mais larga e aberta, com contraformas generosas e terminais retos: a mais "tecnológica" e a que mais conversa com o "MOBILIDADE URBANA" espaçado da logomarca. Ótima a 12 px por causa das aberturas largas. A mais leve no app (228 KB nos 4 pesos).

**Riscos:**
- Larga: o endereço ocupa 8% a mais que na Jakarta, e o dígito tabular é 13% mais largo. Em tela de 360 px, endereço longo trunca antes e o preço grande pede mais espaço.
- Origem: encomendada para um ecossistema de blockchain (Soramitsu). Ninguém vai saber, mas o tom dela puxa para cripto/fintech.
- Sem feature `pnum` (só `tnum`), o que não é problema prático.

## 5. Regras de uso (valem para qualquer uma das três)

| Uso | Peso | Observação |
|---|---|---|
| Texto corrido, endereço, legenda | 400 | Nunca abaixo de 400 em fundo escuro: 200 e 300 somem sobre `#070D18` |
| Rótulo, input, texto secundário | 500 | |
| Título de tela, ETA, item de lista em destaque | 600 | |
| Preço, CTA ("Solicitar corrida"), número de destaque | 700 | CTA em `#0C111B` sobre `#FFCC00` |
| Preço, ETA, distância, placa, contador, horário | qualquer | **`tabular-nums` sempre** |

- **Dark mode:** texto claro sobre fundo escuro "engorda" opticamente menos do que parece no Figma claro. Por isso o piso é 400 e o texto pequeno (12–13 px) usa `#8D9AAC` em 400, nunca em 300.
- **Escala atual dos tokens** (12 / 14 / 16 / 18 / 22 / 28 / 34) serve para qualquer finalista; não precisa mudar.
- **Logomarca:** continua imagem. A fonte do app não substitui nem redesenha o logo.

## 6. Notas para implementação (Lyra, depois da escolha)

- O app é **Expo / React Native**. Variável no RN não é confiável no Android (o eixo `wght` não é mapeado por `fontWeight`). Embarcar **4 TTF estáticos** via `@expo-google-fonts/<fonte>` (versões verificadas no npm: plus-jakarta-sans 0.4.2, manrope 0.4.3, sora 0.4.2) e mapear cada peso para um `fontFamily` próprio.
- Números: `fontVariant: ['tabular-nums']` no estilo do componente de número/preço/ETA/placa. **Não verificado no dispositivo** nesta análise; a prova acima é do Chromium. Conferir em Android e iOS reais.
- Web / landing: usar o WOFF2 variável com subset latin (28–39 KB).
- Token a trocar depois: `typography.family` (`"Inter"` hoje) em `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json`, e os espelhos listados na identidade visual.

## 7. Montserrat Alternates (pedido do dono, vista no ModaShop)

> Amostra: [prints/tipografia-candidatas-montserrat-alternates.png](prints/tipografia-candidatas-montserrat-alternates.png) — mesma régua das 3 finalistas (coluna 4) + a combinação de duas fontes (coluna 5, borda amarela).
> Placas: [prints/tipografia-placa-alternates.png](prints/tipografia-placa-alternates.png).
> No ModaShop (`Moda Shop/frontend/tailwind.config.js`) ela é a fonte `display` (títulos e preços), com Inter no corpo.

### 7.1 Veredito

**Não entra como fonte do app.** Passa nos quatro critérios técnicos (licença, pt-BR, `tnum`, pesos), mas **reprova em legibilidade de caixa-alta**, e isso pega a **placa**, que é o dado de segurança da corrida. Serve para peça de marketing (landing, splash, loja, anúncio), onde não há placa nem texto corrido.

### 7.2 Mesmos critérios, mesmos métodos

| | **Montserrat Alternates** | Montserrat (base) | Plus Jakarta Sans (ref.) |
|---|---|---|---|
| Licença | SIL OFL 1.1 | SIL OFL 1.1 | SIL OFL 1.1 |
| pt-BR | completo | completo | completo |
| `tnum` no GSUB | sim | sim | sim |
| Variação de largura dos dígitos com `tnum` (400/500/600/700) | **0,00** nos 4 | **0,00** nos 4 | 0,00 nos 4 |
| Largura do dígito tabular (100 px) | **70,0 px** nos 4 pesos | 70,0 px nos 4 pesos | 60,0 px |
| Variação sem `tnum` (100 px, 400) | 30,1 px | 30,1 px | 36,1 px |
| Variável? | **Não. Só estáticos** (v7.200, um arquivo por peso) | Sim, `wght` 100–900 (v9.000) | Sim |
| Altura-x / caixa-alta (em) | 0,53 / 0,70 | 0,53 / 0,70 | 0,54 / 0,75 |
| Endereço longo a 16 px | 342 px (+7%) | 339 px | 319 px |
| Frase de 70 caracteres a 16 px² | 579 px (+10%) | 562 px | 527 px |
| "R$ 24,90" a 30 px, 700, `tnum` | 141,6 px (+11%) | 141,6 px | 127,3 px |
| Placa a 22 px, 700 (EMU-4T56 / NWY-2E81 / KAW-0M37) | 158 / 161 / 172 px | — | 145 / 151 / 157 px |
| App: 4 TTF estáticos | 210 + 208 + 208 + 209 = **835 KB** | 4 × 365 = 1.460 KB³ | 377 KB |
| Web: WOFF2 só latin | 28–29 KB **por peso** (~113 KB os 4) | 62 KB (variável) | 35 KB (variável) |
| Pacote Expo | `@expo-google-fonts/montserrat-alternates` 0.4.1 | `@expo-google-fonts/montserrat` 0.4.2 | 0.4.2 |

² "Seu motorista está a caminho. Confira a placa antes de entrar no carro."
³ A Montserrat base cobre cirílico e vietnamita completos; com subset latin cairia bastante, mas o pacote Expo não faz subset.

**Montserrat × Alternates nos números:** idênticas. Os dígitos são os mesmos desenhos: mesma largura tabular (70 px), mesma variação proporcional nos quatro pesos. O que muda entre elas são **só as letras**.

### 7.3 Onde ela falha: as maiúsculas alternativas

O que dá personalidade à Alternates são as maiúsculas redesenhadas: `E` vira `ɛ`, e `M N U W Y` têm forma de minúscula (na altura de maiúscula: medi o contorno, todas chegam a 700 unidades). Em título com caixa mista isso é charme. Em **caixa-alta** vira problema:

- **Placa** (Mercosul é só caixa-alta): `EMU-4T56` aparece como "ɛmu-4T56", `NWY-2E81` como "nwy-2ɛ81". Na amostra, a placa ABC-1D23 escapou porque A, B, C e D não têm alternativa. É exatamente o dado que o passageiro compara com o carro na rua, em movimento e sob sol. **Reprova neste uso.**
- **Rótulos em caixa-alta** ("ETA", "NÚMEROS QUE MUDAM NA TELA", "SEM TNUM"): na coluna 4 da amostra aparecem como "ɛTA", "númeRos que mudam na tela". Leitura mais lenta e aparência de erro.
- **Corpo pequeno:** as minúsculas são Montserrat (boas), mas é 7 a 10% mais larga que a Jakarta, o que trunca endereço antes. Em 12 px *muted* ela aguenta, mas não ganha de nenhuma finalista.
- **Dark mode:** sem problema específico nos pesos 400–700. O risco do dark (peso fino) não se aplica se o piso for 400.

### 7.4 Modelo de duas fontes (Alternates no título e preço, outra no corpo)

Mostrado na coluna 5 da amostra: Alternates em "VuumBora", título, preço e botão; Plus Jakarta Sans no resto.

| | Uma fonte (Jakarta) | Duas fontes (Alternates 600/700 + Jakarta) |
|---|---|---|
| Peso no app | 377 KB | 377 + 418 = **795 KB (+111%)** |
| Peso na web (latin) | 35 KB | 35 + 57 = 92 KB |
| Números no mesmo card | um desenho, dígito de 60 px | **dois desenhos**: preço com dígito de 70 px (Alternates), ETA e distância com 60 px (Jakarta). Medido: R$ 11,11 = 84,3 px contra 75,7 px na Jakarta |
| Regra de uso | uma | todo componente precisa saber se é "título" ou "corpo". Preço é as duas coisas, e a fronteira vaza (o CTA é título? o ETA é dado?) |

**Não vale a pena no app.** Dobra o peso, mistura dois desenhos de número na tela que mais importa (a do preço e da chegada) e cria uma regra que cada componente pode errar. O ganho, personalidade nos títulos, já é entregue pela logomarca, que aparece no splash, no ícone e no topo.

**Onde ela pode morar:** no material de marketing (landing, anúncio, prints da loja, splash), em caixa mista e sem placa. Lá o peso não pesa, e é onde personalidade de marca rende.

**Se o dono quiser o estilo Montserrat no app mesmo assim:** a **Montserrat base** passa em tudo, não tem as maiúsculas problemáticas e é variável. Mas custa mais no app (1,46 MB sem subset) e é das fontes mais usadas no Brasil, então tem menos identidade que a Jakarta.

## 8. Limites desta análise

- Medido em Chromium desktop com `deviceScaleFactor` 2. Não medido em celular real, sob sol, nem em movimento: "legível sob sol" foi inferido por altura-x, abertura e peso mínimo, não testado em campo.
- Tamanhos em KB são dos arquivos do repositório oficial em 2026-11-18 (Plus Jakarta Sans v2.071, Manrope v4.505, Sora v2.000, Montserrat Alternates v7.200, Montserrat v9.000).
