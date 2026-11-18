# VuumBora: identidade visual e paleta final

Data: 2026-11-18. Responsável: Apolo (direção de arte).
Status: **paleta final proposta**, ainda sem aplicação. O `tokens.json`, o `theme.css` e o `theme.ts` **não foram alterados**. Este documento só recomenda mudanças.

Identidade aprovada: azul-noturno, amarelo e branco. O produto é dark mode. O amarelo serve só para destaque e CTA, **nunca como fundo de tela**. Ciano e roxo não entram na paleta.

---

## 1. Método de medição

As cores foram medidas por amostragem de pixels, sem estimativa visual.

- **Leitura:** `System.Drawing.Bitmap` (PowerShell) com `LockBits`, que gera o dump BGRA cru de cada imagem. A análise foi feita num script Node, sobre os pixels.
- **Estatística por região:** para cada região, calculei mediana, média e moda dos pixels que passam por um filtro HSV. Um exemplo de filtro é "amarelo = matiz 25 a 60°, saturação > 0,6, valor > 0,6". O valor reportado é a **mediana** ou um **percentil** dela. Assim o anti-aliasing e o ruído de compressão não puxam o número.
- **Texto pequeno nos mockups:** usei a média do quartil mais claro dos pixels de texto. A mediana simples sai artificialmente escura por causa do anti-aliasing (detalhe na seção 3).
- **Contraste:** fórmula WCAG 2.x de luminância relativa, `(L1 + 0,05) / (L2 + 0,05)`. Divergência medida em **CIEDE2000 (ΔE00)**. ΔE00 < 2 fica no limiar de percepção.

**Fontes medidas:**

| Arquivo | Dimensão | Observação |
|---|---|---|
| `Imagens/LogoMarca.png` | 1254×1254, 24bpp | Fonte primária |
| `VuumBora_Claude_Design_System/referencias/logo_aprovada.png` | 1254×1254, 32bpp | **Idêntica pixel a pixel à LogoMarca** (0 pixels diferentes, delta máximo 0). Só o contêiner PNG muda |
| `referencias/passageiro_home.png` | 1122×1402 | Mockup |
| `referencias/motorista_telas.png` | 1536×1024 | Mockup |

Os cantos da logo, fora do quadrado arredondado, são `#000000` opaco, sem transparência. Por isso a logo **não serve como arte sobre fundo claro** e precisa de uma versão com alfa (ver Pendências).

---

## 2. Medições da logomarca (`LogoMarca.png`)

Coordenadas em pixels, no formato (x0,y0)–(x1,y1).

### 2.1 Amarelo: gradiente do logo

O amarelo do logo **não é uma cor chapada**. É um gradiente de amarelo-ouro (topo) para âmbar (base), com matiz entre 37° e 53°. Amostra: 175.962 pixels amarelos saturados (s > 0,85, v > 0,9).

| Ponto do gradiente | HEX medido | Onde |
|---|---|---|
| Realce (p95 de matiz) | `#FED202` | pixel (754,695), topo do "B" de Bora |
| Topo do pin (mediana da região) | `#FED001` | região (560,170)–(720,215), 6.720 px |
| Meio do gradiente (mediana global) | `#FDB601` | pixel (1136,781), "a" de Bora |
| Meio do pin | `#FEAF01` | região (770,330)–(850,420) |
| Ponta do pin | `#FEA801` | região (580,560)–(700,635) |
| Âmbar profundo (p5 de matiz) | `#FEA101` | pixel (1176,1198), swoosh inferior |
| Swoosh inferior (moda) | `#FDA101` | região (500,1050)–(1254,1254), 81.104 px |
| Texto "Bora" (mediana) | `#FEC101` | região (700,690)–(1180,845), 44.571 px |

### 2.2 Azul-noturno: campo do logo

O fundo tem um leve vinheteado e as linhas de mapa por cima. Amostra: 933.885 pixels escuros (v < 0,25).

| Ponto | HEX medido | Onde |
|---|---|---|
| Mediana do campo | `#0C111B` | todo o campo escuro, (40,40)–(1214,1214) |
| Mais escuro (p5) | `#070B11` | pixel (477,381) |
| Mais claro do campo (p75) | `#101620` | pixel (734,67) |
| Matiz do campo | **216°** (p10 212°, p90 220°) | mesma amostra; é azul-marinho de fato, sem ciano nem roxo |
| Linhas de mapa | `#212936` | região (230,140)–(250,160) |
| Linhas de mapa (p99 do escuro) | `#1E2836` | pixel (179,342) |

### 2.3 Branco

| Elemento | HEX medido | Onde |
|---|---|---|
| "Vuum" | `#FEFEFE` (moda; `#FFFFFF` é a 2ª moda) | região (90,680)–(690,845), 49.162 px |
| Carro | `#FEFEFE` | região (480,280)–(770,470) |
| "MOBILIDADE URBANA" | `#FFFFFF` (moda) | região (250,955)–(1010,1000) |
| Elipse da base do pin | `#EAEDF0` (mediana, gradiente prata) | região (455,600)–(800,665) |

Conclusão: o branco da marca é `#FFFFFF`. O `#FEFEFE` é ruído de compressão.

---

## 3. Medições dos mockups (referência secundária)

Os mockups são renders, com texto pequeno, glow e vinheta. Servem para **confirmar faixas**, não para ditar HEX de texto.

| Elemento | HEX medido | Onde |
|---|---|---|
| Fundo da tela (passageiro) | `#01070D` a `#010710` | (245,745)–(870,760) e (300,1186)–(820,1200) |
| Fundo da tela (login motorista) | `#050B15` | motorista_telas (345,440)–(530,450) |
| Card / bottom nav | `#0F1722` | passageiro (500,780)–(660,800) e (380,1215)–(560,1240) |
| Card (atalho "Casa") | `#141C27` | passageiro (300,650)–(390,675) |
| Fundo de input | `#18202F` | motorista_telas (400,200)–(520,218) |
| Botão secundário "Recusar" | `#2A3549` | motorista_telas (1075,402)–(1110,435) |
| Botão "Solicitar corrida" | `#FEC501` | passageiro (262,1105)–(400,1175) |
| Botão de busca | `#FDBA01` | passageiro (262,535)–(350,605) |
| Texto sobre amarelo | `#050A0F` / `#040509` | "Solicitar corrida" e "Entrar" (50% mais escuro) |
| Texto secundário | mediana `#B8BBBF`, núcleo `#DCDEE0` a `#E2E3E7` | "Ponta Negra", "Meus destinos" |
| Verde (aprovado / embarque) | `#27C729` / `#2ABE33` | motorista_telas (1078,172) e (972,620) |
| Vermelho (badge / destino) | `#F82020` / `#F72914` | passageiro (832,175) e motorista_telas (1078,228) |
| Ponto de localização do usuário | `#0373B9` com halo **`#00EEFF`** | passageiro (505,435)–(560,490) |
| Fundo do mapa (ruas) | `#132033` | passageiro (260,420)–(380,470) |

**Alerta:** o mockup usa **ciano** (`#00EEFF`) no ponto de localização, e o token `info` / `userLocation` (`#38BDF8`, matiz 198°) também é ciano. Os dois violam a identidade aprovada. A correção está na seção 5.

---

## 4. Paleta final

Toda cor tem a origem declarada. Há três tipos de origem:
- **Medida:** o HEX saiu de um pixel ou região.
- **Herdada:** vem do `tokens.json` e foi conferida contra uma medida.
- **Derivada:** foi construída a partir de uma medida, com a regra explícita.

### 4.1 Marca

| Token | HEX final | Origem |
|---|---|---|
| `brand.yellow` | `#FFCC00` | **Herdada**, validada pela medida. ΔE00 = 1,51 contra o topo do pin `#FED001` (região (560,170)–(720,215)), abaixo do limiar de percepção. Mantida porque é o valor limpo da proposta e já está no código |
| `brand.yellowPressed` | `#FDB601` | **Medida**: mediana global do gradiente do logo, pixel (1136,781). Substitui `#E6B800` |
| `brand.yellowDeep` (hoje `brand.orange`) | `#FEA101` | **Medida**: âmbar p5 do logo, pixel (1176,1198). Substitui `#F5A400` |
| `brand.gradient` (novo) | `#FED202` → `#FEA101` | **Medida**: extremos p95 e p5 do gradiente do logo. Uso restrito a hero, splash e ilustração, nunca em texto |
| `brand.navy` | `#0C111B` | **Medida**: mediana do campo escuro do logo (933.885 px, matiz 216°). Substitui `#0B1220` |
| `brand.white` | `#FFFFFF` | **Medida**: moda de "MOBILIDADE URBANA" e 2ª moda de "Vuum" |

### 4.2 Fundos

| Token | HEX final | Origem |
|---|---|---|
| `background.base` | `#070D18` | **Herdada**, validada: ΔE00 = 0,88 contra o campo do logo `#0C111B` e 1,13 contra o fundo do mockup `#050B15` |
| `background.surface` | `#111B2A` | **Herdada**, validada: ΔE00 = 2,42 contra card/nav do mockup `#0F1722`. Mantida para garantir degrau de elevação legível |
| `background.elevated` | `#192536` | **Herdada**. Fica entre o card do mockup `#141C27` e as linhas de mapa do logo `#212936` |
| `background.input` | `#1F2B3D` | **Herdada**. O mockup mede `#18202F` (ΔE00 = 3,72). Mantida mais clara de propósito, para o input se separar do card |

### 4.3 Texto

| Token | HEX final | Origem |
|---|---|---|
| `text.primary` | `#FFFFFF` | **Medida** (branco do logo, seção 2.3) |
| `text.secondary` | `#B9C4D2` | **Herdada**, compatível com a medida: o texto secundário do mockup vai de `#B8BBBF` (mediana) a `#E2E3E7` (núcleo). Escolhida a versão com leve matiz azul, coerente com o navy 216° |
| `text.muted` | `#8D9AAC` | **Herdada**. Não aparece no logo. Matiz 215°, coerente com o navy medido |
| `text.onYellow` | `#0C111B` | **Medida**: igual a `brand.navy`, para unificar num token só. O mockup mede `#050A0F` sobre o amarelo. Substitui `#0B1220` (ΔE00 imperceptível, 12,49 contra 12,38 de contraste) |

### 4.4 Bordas

| Token | HEX final | Origem |
|---|---|---|
| `border.default` | `#2D3A4C` | **Herdada**, validada: ΔE00 = 2,34 contra o botão secundário do mockup `#2A3549`. **Só para separar cards (decorativa)** |
| `border.emphasis` | `#46566C` | **Herdada**. Uso decorativo |
| `border.strong` (novo) | `#66768E` | **Derivada**: matiz 216° do navy medido, com luminosidade subida até ≥ 3:1 contra os quatro fundos. Obrigatória em borda de input, checkbox, toggle e qualquer limite de controle |

### 4.5 Estados (semânticos)

| Token | HEX final | Origem |
|---|---|---|
| `semantic.success` | `#22C55E` | **Herdada**. O mockup mede `#27C729` (ΔE00 = 6,31, render saturado). O token tem contraste melhor e é mais sóbrio |
| `semantic.danger` | `#FF6B75` | **Derivada** do token `#F04452`: mesma matiz (~356°), clareada para passar em AA sobre `elevated` e `input`. Para texto, ícone e marcador |
| `semantic.dangerFill` (novo) | `#D02A38` | **Derivada** da mesma matiz, escurecida para o branco passar em AA por cima. Para badge, DangerButton e toast de erro |
| `semantic.warning` | `#FEA101` | **Medida** (= `brand.yellowDeep`). Substitui `#FFCC00`, que era idêntico ao CTA e fazia aviso parecer botão. Sempre com ícone e texto |
| `semantic.info` | `#6EA8FF` | **Derivada**: matiz **216°**, igual ao campo do logo, com luminosidade subida para AA. Substitui `#38BDF8` (ciano, 198°) |

### 4.6 Mapa

| Token | HEX final | Origem |
|---|---|---|
| `map.route` | `#FFCC00` | Herdada (= `brand.yellow`) |
| `map.pickup` | `#22C55E` | Herdada (= `semantic.success`) |
| `map.destination` | `#FF6B75` | Derivada (= `semantic.danger` final) |
| `map.userLocation` | `#6EA8FF` | Derivada (= `semantic.info` final, sem ciano) |
| `map.background` (referência) | `#132033` | **Medida**: ruas do mapa no mockup passageiro (260,420)–(380,470). Usada só para calcular contraste; o estilo real do mapa vem do provedor |

---

## 5. Divergências entre a medição e o tokens.json

| Token | tokens.json | Medido / final | ΔE00 | Recomendação |
|---|---|---|---|---|
| `brand.yellow` | `#FFCC00` | `#FED001` (topo do pin) | 1,51 | **Manter** `#FFCC00`. Diferença imperceptível |
| `brand.yellowPressed` | `#E6B800` | `#FDB601` | 6,41 | **Trocar.** `#E6B800` não existe no logo: escurece puxando para oliva sobre fundo escuro. O pressed passa a "descer" no gradiente da marca, rumo ao âmbar, como o próprio logo faz |
| `brand.orange` | `#F5A400` | `#FEA101` | 2,96 | **Trocar** e renomear para `yellowDeep`. O token é mais avermelhado e opaco que o âmbar real do logo |
| `brand.navy` | `#0B1220` | `#0C111B` | 2,43 | **Trocar.** `#0C111B` é a mediana real do campo do logo |
| `text.onYellow` | `#0B1220` | `#0C111B` | 2,43 | **Trocar** para apontar para `brand.navy` (um token a menos) |
| `background.base` | `#070D18` | `#0C111B` (logo) / `#050B15` (mockup) | 0,88 / 1,13 | **Manter** |
| `background.surface` | `#111B2A` | `#0F1722` (mockup) | 2,42 | **Manter** (degrau de elevação) |
| `background.elevated` | `#192536` | `#141C27` (mockup) | 3,94 | **Manter**. O mockup é render com vidro; o token garante separação |
| `background.input` | `#1F2B3D` | `#18202F` (mockup) | 3,72 | **Manter** |
| `border.default` | `#2D3A4C` | `#2A3549` (mockup) | 2,34 | **Manter**, mas só como borda decorativa (reprova 3:1 como limite de controle, ver seção 6) |
| `semantic.success` | `#22C55E` | `#27C729` (mockup) | 6,31 | **Manter** |
| `semantic.danger` | `#F04452` | `#F82020` / `#F72914` (mockup) | 11,5 | **Trocar** por `#FF6B75` (texto) + `#D02A38` (preenchimento). `#F04452` reprova como texto sobre `elevated` e `input` e com texto branco por cima |
| `semantic.warning` | `#FFCC00` | — | — | **Trocar** por `#FEA101`. Aviso idêntico ao CTA confunde |
| `semantic.info` | `#38BDF8` | — | — | **Trocar** por `#6EA8FF`. `#38BDF8` é ciano (198°) e fere a identidade |
| `map.userLocation` | `#38BDF8` | mockup `#00EEFF` (ciano) | — | **Trocar** por `#6EA8FF`. O mockup também está fora da identidade nesse ponto |
| `map.destination` | `#F04452` | — | — | Acompanhar `semantic.danger` → `#FF6B75` |
| *(novo)* `border.strong` | — | `#66768E` | — | **Criar** |
| *(novo)* `semantic.dangerFill` | — | `#D02A38` | — | **Criar** |
| *(novo)* `brand.gradient` | — | `#FED202` → `#FEA101` | — | **Criar** |

O mesmo conjunto de HEX está duplicado em `codigo/theme.css`, `codigo/theme.ts` e na tabela da seção de cores do `DESIGN_SYSTEM_MESTRE.md`. Os três precisam mudar junto com o `tokens.json`, senão o código e o design system divergem.

---

## 6. Contraste WCAG AA

Os limites usados:
- **4,5:1** para texto normal.
- **3:1** para componentes não-textuais (WCAG 1.4.11): limite de controle e marcador.

### 6.1 Diagnóstico dos tokens atuais: pares que reprovam

| Par | Razão | Mínimo | Situação | Ajuste proposto |
|---|---|---|---|---|
| `danger` `#F04452` sobre `elevated` `#192536` | 4,16:1 | 4,5 | REPROVA | `danger` → `#FF6B75` (5,60:1) |
| `danger` `#F04452` sobre `input` `#1F2B3D` (erro de campo) | 3,84:1 | 4,5 | REPROVA | `danger` → `#FF6B75` (5,17:1) |
| Branco sobre `danger` `#F04452` (badge, DangerButton) | 3,71:1 | 4,5 | REPROVA | Preencher com `dangerFill` `#D02A38` (5,16:1) |
| Branco sobre `success` `#22C55E` | 2,28:1 | 4,5 | REPROVA | Usar `onYellow`/navy `#0C111B` sobre success (8,29:1). Regra: **texto escuro sobre qualquer preenchimento claro** |
| Branco sobre `info` `#38BDF8` | 2,14:1 | 4,5 | REPROVA | `info` → `#6EA8FF` com texto navy (7,83:1) |
| Branco sobre `yellow` `#FFCC00` | 1,51:1 | 4,5 | REPROVA | Já proibido pelo DS. Mantém-se texto navy (12,49:1) |
| Desabilitado: branco a 45% sobre `surface` / `input` | 4,46 / 4,11:1 | 4,5* | REPROVA | Trocar opacidade por cores sólidas: fundo `elevated` + texto `muted` (5,41:1) |
| Botão amarelo desabilitado a 45% sobre `base` | 1,80:1 | 4,5* | REPROVA | Mesmo ajuste: o botão desabilitado perde o amarelo e vira `elevated` + `muted` |
| `border.default` `#2D3A4C` como borda de input | 1,24 a 1,69:1 | 3 | REPROVA | Borda de controle → `border.strong` `#66768E` (3,09 a 4,21:1) |
| `border.emphasis` `#46566C` como borda de input | 1,91 a 2,60:1 | 3 | REPROVA | Idem |
| Fundo de `input` contra `surface` / `base` (sem borda) | 1,21 / 1,36:1 | 3 | REPROVA | Input sempre com `border.strong` |

\* A WCAG isenta componentes inativos (1.4.3). Mesmo assim a correção é proposta: em app de mobilidade, um "Solicitar corrida" desabilitado ilegível vira suporte.

Todos os outros pares atuais passam: texto primário, secundário e muted em todos os fundos, amarelo como texto, success, info (cor) e `onYellow` sobre `yellow`, `yellowPressed` e `orange`.

### 6.2 Tabela final com a paleta da seção 4

| Uso | Texto / elemento | Fundo | Razão | Mínimo | Resultado |
|---|---|---|---|---|---|
| Texto primário | `#FFFFFF` | base `#070D18` | 19,45:1 | 4,5 | PASSA |
| Texto primário | `#FFFFFF` | surface `#111B2A` | 17,30:1 | 4,5 | PASSA |
| Texto primário | `#FFFFFF` | elevated `#192536` | 15,45:1 | 4,5 | PASSA |
| Texto primário | `#FFFFFF` | input `#1F2B3D` | 14,27:1 | 4,5 | PASSA |
| Texto secundário | `#B9C4D2` | base | 11,01:1 | 4,5 | PASSA |
| Texto secundário | `#B9C4D2` | surface | 9,79:1 | 4,5 | PASSA |
| Texto secundário | `#B9C4D2` | elevated | 8,75:1 | 4,5 | PASSA |
| Texto secundário | `#B9C4D2` | input | 8,08:1 | 4,5 | PASSA |
| Texto muted / placeholder | `#8D9AAC` | base | 6,81:1 | 4,5 | PASSA |
| Texto muted / placeholder | `#8D9AAC` | surface | 6,05:1 | 4,5 | PASSA |
| Texto muted / placeholder | `#8D9AAC` | elevated | 5,41:1 | 4,5 | PASSA |
| Texto muted / placeholder | `#8D9AAC` | input | 5,00:1 | 4,5 | PASSA |
| Texto sobre amarelo (CTA) | `#0C111B` | yellow `#FFCC00` | 12,49:1 | 4,5 | PASSA |
| Texto sobre amarelo (pressed) | `#0C111B` | yellowPressed `#FDB601` | 10,68:1 | 4,5 | PASSA |
| Texto sobre âmbar | `#0C111B` | yellowDeep `#FEA101` | 9,28:1 | 4,5 | PASSA |
| Amarelo como link / aba ativa | `#FFCC00` | base | 12,86:1 | 4,5 | PASSA |
| Amarelo como link / aba ativa | `#FFCC00` | surface | 11,44:1 | 4,5 | PASSA |
| Amarelo como link / aba ativa | `#FFCC00` | elevated | 10,22:1 | 4,5 | PASSA |
| Amarelo como link / aba ativa | `#FFCC00` | input | 9,44:1 | 4,5 | PASSA |
| Sucesso (texto) | `#22C55E` | base / surface / elevated / input | 8,54 / 7,59 / 6,78 / 6,26:1 | 4,5 | PASSA |
| Erro (texto) | `#FF6B75` | base / surface / elevated / input | 7,05 / 6,27 / 5,60 / 5,17:1 | 4,5 | PASSA |
| Aviso (texto) | `#FEA101` | base / surface / elevated / input | 9,55 / 8,49 / 7,59 / 7,01:1 | 4,5 | PASSA |
| Info (texto) | `#6EA8FF` | base / surface / elevated / input | 8,06 / 7,17 / 6,41 / 5,92:1 | 4,5 | PASSA |
| Badge de notificação / DangerButton | `#FFFFFF` | dangerFill `#D02A38` | 5,16:1 | 4,5 | PASSA |
| Badge de sucesso ("Aprovado") | `#0C111B` | success `#22C55E` | 8,29:1 | 4,5 | PASSA |
| Badge de info | `#0C111B` | info `#6EA8FF` | 7,83:1 | 4,5 | PASSA |
| Badge de aviso | `#0C111B` | warning `#FEA101` | 9,28:1 | 4,5 | PASSA |
| Botão desabilitado | `#8D9AAC` | elevated `#192536` | 5,41:1 | 4,5 | PASSA |
| Borda de input / controle | `#66768E` | base / surface / elevated / input | 4,21 / 3,75 / 3,35 / 3,09:1 | 3 | PASSA |
| DangerButton contra o fundo | `#D02A38` | base / surface | 3,77 / 3,35:1 | 3 | PASSA |
| Foco / card selecionado (borda amarela) | `#FFCC00` | base / surface | 12,86 / 11,44:1 | 3 | PASSA |
| Rota no mapa | `#FFCC00` | mapa `#132033` | 10,83:1 | 3 | PASSA |
| Marcador de embarque | `#22C55E` | mapa | 7,19:1 | 3 | PASSA |
| Marcador de destino | `#FF6B75` | mapa | 5,94:1 | 3 | PASSA |
| Localização do usuário | `#6EA8FF` | mapa | 6,79:1 | 3 | PASSA |

**Resultado: 0 pares reprovando** com a paleta final.

---

## 7. Regras de uso (inegociáveis)

1. **O amarelo é destaque, nunca fundo de tela.** Ele aparece em CTA, aba ativa, link, borda de seleção ou foco, rota e ícone. Não preenche área de tela, nem header, nem fundo de seção.
2. **Nunca texto branco sobre amarelo, âmbar, success ou info.** Sobre preenchimento claro, o texto é sempre `#0C111B`.
3. **O branco só aparece sobre preenchimento escuro.** Isso vale para `dangerFill` e para os fundos navy.
4. **Gradiente `#FED202 → #FEA101`** é reservado à marca: splash, hero e ilustração. Botão é chapado em `#FFCC00`.
5. **Borda de controle usa `border.strong`.** `border.default` fica para separar cards.
6. **Desabilitado usa cores sólidas** (`elevated` + `muted`), sem opacidade.
7. **Estado nunca só por cor:** ícone e texto sempre juntos. Isso já está no DS e fica reforçado, porque warning e marca agora compartilham o âmbar.
8. **Sem ciano nem roxo.** Qualquer azul de interface deriva da matiz 216° do navy.
