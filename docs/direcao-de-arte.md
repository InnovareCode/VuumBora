# Direção de arte: do correto ao premium

Autor: Apolo · 18/11/2026 · status: **proposta. Nada aplicado em tokens nem em componentes.**

Referências estudadas:

- `VuumBora_Claude_Design_System/referencias/passageiro_telas_premium.webp` (folha de contato do passageiro, 1536×1024)
- `VuumBora_Claude_Design_System/referencias/motorista_telas_premium.webp` (folha de contato do motorista, 1536×1024)
- `VuumBora_Claude_Design_System/referencias/premium/passageiro/P01…P13b.webp` (9 telas do passageiro, 863×1822 cada). **Fonte primária: todas as medidas deste documento saem daqui.**

Amostras (antes e depois):

- `docs/prints/direcao-arte-home-antes-depois.png`: início do passageiro em 320 e 390 pt. O "antes" é print real do app rodando no Expo Web; o "depois" é maquete HTML, não o app.
- `docs/prints/direcao-arte-boas-vindas.png`: boas-vindas (tela nova) em 320×568 e 390×844.
- `docs/prints/direcao-arte-assets.png`: os assets gerados.

---

## 0. O que mudou quando chegaram as telas em alta resolução

A primeira leitura veio da folha de contato. Medindo as telas em alta, três conclusões mudaram:

| Achei na folha de contato | Medido em alta resolução | Consequência |
|---|---|---|
| O CTA amarelo tem halo luminoso | **O halo não existe.** Sob o "Confirmar corrida" (P05) e o "Entrar" (P01), o pixel seguinte à borda já é fundo: `#322300`, depois `#040704`. O que o olho lê como brilho é **1 px de borda clara** em cima (`#FBE027`/`#FFF740`) e embaixo (`#F9DB38`/`#FEC613`), mais o gradiente vertical | Tirei o `glow.cta` amarelo. O CTA ganha borda clara interna e uma sombra escura |
| Cards com gradiente forte de superfície | O preenchimento é **quase chapado**: `#121F2F` em cima, `#0F1A29` embaixo (P03). O que dá volume é **borda iluminada de cima**: topo `#4F596D`, base `#1F2A3B` | O gradiente de superfície ficou sutil. Quem faz o trabalho é a borda clara no topo |
| Mapa escuro quase preto | O fundo do mapa é **azul-marinho saturado**, `#102645` (P05/P09), mais claro que o fundo do app | Refiz o asset de mapa e os tokens `map.*` |

O resto da leitura inicial se manteve: o amarelo é economizado, a busca é uma pílula clara, há fotografia noturna e a hierarquia é mais limpa.

---

## 1. Método e escala

- O aparelho da referência tem ilha dinâmica, então é iPhone 14 Pro, 15 ou 16. Assumi **393 pt** de largura útil.
- A moldura do telefone muda de tamanho em cada arquivo. Por isso medi a tela de cada um: localizei a borda interna (moldura clara, depois bezel preto, depois conteúdo) na mesma linha, dos dois lados.

| Arquivo | Tela (px) | px/pt |
|---|---|---|
| P01 | 696 | 1,771 |
| P03 | 720 | 1,832 |
| P05 | 753 | 1,916 |
| P09 | 748 | 1,903 |
| P12 | 733 | 1,865 |

- Cores: amostra de pixel por perfil de linha ou coluna (scripts no scratchpad da sessão, não versionados). O raio de canto saiu do recuo horizontal da borda na primeira linha do elemento. Contraste: fórmula WCAG 2.x.
- **O que não medi:** corpo e peso de fonte da referência. O render de IA não usa Plus Jakarta e o tamanho de glifo em imagem comprimida não é confiável. A escala tipográfica aprovada continua valendo.

### 1.1 Medidas extraídas (convertidas para pt)

| Elemento | Medido | Em pt | Hoje no app | Proposta |
|---|---|---|---|---|
| Margem lateral da tela | 25–26 px | **13–14** | 20 | 16 em < 375 pt, 20 a partir de 375 |
| Pílula de destino (P03): altura / raio | 110 / 37 px | **60 / 20** | barra amarela | 60 / 20 (52 / 16 em 320) |
| Atalho Casa/Trabalho (P03): altura, largura, vão, raio | 157 / 201 / 34 / 30 px | **86 / 110 / 18,5 / 16** | 4 colunas, vão 8 | vão 8 mantido (ver §6) |
| Card de categoria (P05): altura, vão entre cards | 127 / ~12 px | **66 / 6–8** | card vertical | linha de 64–68 pt, vão 8 |
| Caixa de ícone do veículo (P05) | 99×91 px, raio ~23 px | **~50×48, raio 12** | não existe | 48×48, raio 12 |
| Borda do card selecionado (P05) | 4–5 px | **2** | 1,5 | 2 |
| Halo do card selecionado | 8–9 px para fora, ~8 px para dentro | **~4** | nenhum | 4 pt, alfa 0,30 |
| CTA (P05): altura / raio / margem | 119 / 37 / 25 px | **62 / 19 / 13** | 52 / 16 | **56** / 16 (52 em altura < 640) |
| CTA (P01) altura | 109 px | **61,5** | 52 | idem |
| Halo amarelo sob o CTA | 1–2 px (antialias) | **0** | nenhum | nenhum |
| Sombra escura sob card (P03) | 18–34 px abaixo; o fundo cai de `#000A14` para `#00060D` | **10–18, quase imperceptível** | nenhuma | `elevation.1` |
| Rota no mapa: miolo / halo (P09) | 16 px / ~15 px de rampa | **8,4 / ~8** | linha cinza | 7 pt + halo |
| Balão de endereço no mapa (P09): fundo / borda | `#010D19` / topo `#929BA6`, base `#57687E` | borda de 1 | não existe | ver `map.balloon` |

---

## 2. Diagnóstico: o que cria a sensação premium

Em ordem de peso, medido e não estimado:

1. **Economia de amarelo.** Na referência, cada tela tem **um** bloco amarelo (o CTA), e o resto do amarelo aparece em ícones e traços. A nossa home tem sete focos amarelos competindo: avatar cheio, quatro selos "!" de mock, a barra de destino inteira, o card selecionado, a borda do banner e o CTA. Este é o maior ganho e não custa nenhum efeito.
2. **Borda iluminada de cima (top-lit edge).** Todo card, campo, balão e botão secundário tem a borda superior mais clara que a inferior: card `#4F596D`/`#1F2A3B`, campo `#364559`/`#384257`, balão `#929BA6`/`#57687E`. Isso simula luz vinda de cima e é o que separa o card do fundo. O nosso usa `#2D3A4C` igual nos quatro lados, e daí vem a sensação de "chapado".
3. **Contraste de elevação por inversão.** A busca de destino é uma pílula **clara** (`#FEFEFE`→`#EEF1F9`) numa tela escura. É o elemento mais "alto" da tela sem nenhuma sombra. O amarelo fica livre para o CTA.
4. **CTA com volume.** O gradiente vertical (`#FDD201`→`#FEB702`) é praticamente o nosso `#FED202`→`#FDB601`, com 1 px claro em cima e embaixo. Não tem halo.
5. **Fotografia e cena.** Cidade noturna com rastros de luz no onboarding e na base da home e das configurações. Dá contexto de mobilidade sem texto.
6. **Mapa com identidade.** Fundo azul-marinho, rota amarela grossa com halo, pinos da marca e balões escuros de borda clara.
7. **Fundo mais profundo que o card.** O fundo da referência fica entre `#010B15` e `#000B19`, um pouco mais escuro e mais azul que o nosso `#070D18`. A diferença é pequena e não justifica mexer num token aprovado. O mesmo efeito vem de um brilho radial no topo da tela (`gradient.screen`).

**Fora daqui:** o preenchimento dos cards. Ele é praticamente o nosso `background.surface` (`#111D2B` medido contra `#111B2A` aprovado). **A paleta aprovada estava certa. Faltava luz, não cor.**

### 2.1 O que é render de pôster e não vai para o app

| Na referência | Por que não reproduzir | O que fazer no lugar |
|---|---|---|
| Faixa amarela curva (swoosh) dentro da tela, na base de P02, P09, P12 e P13 | É a arte do pôster vazando para dentro do celular. Disputa com a barra de gestos e quebra a regra "amarelo nunca é fundo" | Nada. O swoosh fica no material de marketing |
| Logo grande (lockup) no topo de P03, P05, P09 e P12 | Ocupa 110–140 pt de altura. Em 320×568 isso é 25% da tela antes de qualquer conteúdo | Lockup só nas boas-vindas. Nas telas internas, logo horizontal pequeno (30 pt) ou nenhum |
| Carro 3D fotorrealista com a marca na porta (P03, P13b) | É render de IA de um carro com cara de Hyundai/Chevrolet. Ver §7 sobre licença e trade dress | Ilustração procedural (gerada) ou foto real licenciada |
| Mapa com rota que passa do embarque e se ramifica (P09) | Geometria impossível. É desenho, não dado | Rota sempre vem do provedor de mapa |
| Mapa sem nenhum rótulo de rua (P05, P09) | Mapa real tem rótulos, e sem eles o mapa não serve para orientar | Rótulos discretos (`map.label`) |
| Saldo da carteira em branco sobre laranja (P12) | **Reprova AA: 2,22:1** sobre `#F99700`. O gradiente ainda escurece até `#8A4A04` (marrom) à direita, fora da identidade | Texto navy sobre o gradiente da marca (§4) |
| Selo "Concluída" com texto branco sobre verde (P11) | Branco sobre `#22C55E` = **2,28:1**, reprova | Texto `#22C55E` sobre fundo verde escuro (6,74:1) |
| Banner "Indique e ganhe" roxo (P03: `#03205D`→roxo) | Roxo está fora da identidade (regra do dono: sem ciano e sem roxo) | Gradiente na matiz navy da marca (`gradient.promo`) |
| Ícone do PIX ciano | É marca de terceiro (Banco Central), cor obrigatória da marca PIX | Manter o ciano **só** no logo do PIX |

### 2.2 O que não é desculpa de "é render"

Tudo da seção 2 antes do 2.1 é reproduzível em React Native 0.88 (New Architecture, Expo 58): borda por lado, `boxShadow` (inclusive `inset`), gradiente e imagem. Nenhum desses itens exige blur nativo nem shader.

---

## 3. Referência do motorista: o que acrescenta e o que contradiz

### 3.1 Coerência entre os dois materiais (medido)

| Item | Passageiro | Motorista | Veredito |
|---|---|---|---|
| CTA amarelo | `#FDD201`→`#FEB702` | `#FCD301`→`#FDB400` ("Ficar Online"), `#FDD314`→`#FCAB00` ("Aceitar") | Mesmo token (`gradient.cta`) |
| Card | `#111D2B` | `#131A28` | Mesmo token (`background.surface`); a diferença é render |
| Botão secundário cheio ("Recusar") | n/a | `#273245`→`#232E3E` | É o `gradient.surface.overlay` |
| Ícones de lista no perfil | **amarelos** (P13) | **brancos** (Meu Perfil do motorista) | **Contradição.** Regra única: ícone de linha de lista em `text.secondary`; amarelo só no ícone do item ativo ou no atalho principal. Amarelo em toda linha do perfil anula a economia de amarelo do item 1 |
| Ação de recusa e cancelamento | "Cancelar corrida": contorno vermelho, fundo levemente vermelho | "Recusar": cinza cheio | **Não é contradição.** Cancelar uma corrida em andamento é destrutivo (`danger`); recusar uma oferta é neutro. Manter as duas, com essa regra escrita |
| Toggle desligado | n/a | branco | Toggle desligado em `border.strong`. Branco chama mais atenção que o estado ligado |
| Botão "som" duplicado na navegação | n/a | dois botões iguais | Erro de render, ignorar |

As duas referências são o mesmo sistema. Os tokens abaixo servem para os dois apps sem exceção por app.

### 3.2 Mapa como protagonista (navegação do motorista, P05/P09 do passageiro)

**O tratamento que deixa o mapa premium e legível em movimento:**

1. **Uma camada de cor por função, não por estética.** Solo `#0F2240`, quadra `#11264A`, via secundária `#1A3560`, via principal `#24477A`, água `#081A33`, área verde `#0F2A3A`. Os contrastes de via contra solo são baixos de propósito (1,30 e 1,71): a malha é pano de fundo. **Quem tem contraste é a rota**: `#FFCC00` sobre o solo dá 10,5:1 e sobre a via principal 6,15:1.
2. **Rota de 7 pt com contorno navy (`#0C111B`, 1,5 pt) e halo.** O contorno garante que a rota não se funda com via clara nem com o pino. O halo (amarelo a 25%, desfoque de ~8 pt) é o "brilho" medido na referência.
3. **Em movimento, menos é mais.** Na navegação: sem POI, rótulo só de via principal, sem quadra desenhada e solo chapado. O cartão de instrução (próxima manobra) é o único elemento grande sobreposto, com `surface.glassOnMap` e `elevation.2`.
4. **Sobreposições usam o balão escuro de borda clara**, nunca vidro com blur (§5).
5. **Modo dia e noite.** Esta especificação é só a noturna. Um mapa escuro sob sol forte ao meio-dia perde legibilidade. **Decisão em aberto:** o tema claro de navegação para o motorista ainda não foi especificado.

**O que depende do provedor (D-11, ainda aberta):**

| Recurso | Google Maps (`react-native-maps`) | Mapbox |
|---|---|---|
| Cor por camada (solo, via, água, POI) | Sim, por JSON de estilo ou Cloud Styling | Sim, total (Studio) |
| Esconder POI e rótulos por nível | Sim | Sim |
| Halo e contorno da rota | Polyline sem halo nativo: duas polylines sobrepostas (contorno + miolo) e uma terceira semitransparente para o halo | `line-blur` e `line-gap-width` nativos |
| Pino da marca e carro com rotação | Marker com imagem; desempenho de rotação a validar | Symbol layer com rotação nativa |
| Ângulo 3D na navegação | Limitado | Nativo |

O sistema visual inteiro cabe nos dois. O Mapbox entrega halo e navegação 3D com menos gambiarra; o Google, com a técnica de polylines sobrepostas, chega a uns 90% do visual. **Isso não decide a D-11.** Custo por volume e termos de uso pesam mais, mas sai da lista de riscos estéticos.

### 3.3 Gráfico de ganhos (motorista)

O gráfico da referência é enfeite: barras sem eixo, sem valor, sem rótulo de período. Ninguém extrai dele "quanto ganhei na terça". Regras para não repetir isso:

1. **O número vem antes do gráfico.** O total do período em `display` é a informação. O gráfico só compara.
2. **Toda barra tem rótulo de período** (Seg, Ter… ou 6h, 9h…) em `caption` `text.muted` (6,05:1 sobre o card).
3. **Valor da barra visível só na barra tocada ou na de destaque.** Valor em cima de todas as barras vira ruído em 320 pt. Tocar mostra o valor num balão.
4. **Cor:** o período atual ou tocado em `#FFCC00`; os outros em `#5A6A80`. Esse cinza dá 3,14:1 sobre o card e cumpre o 3:1 exigido para elemento gráfico (WCAG 1.4.11). O `#46566C` da referência dá só 2,31 e reprova.
5. **Zero é zero.** O dia sem ganho mostra um traço de 2 pt na linha de base, nunca a barra omitida (some o dia) nem uma barra mínima falsa (parece que houve ganho).
6. **Estado vazio** (nenhuma corrida no período): sem gráfico. Mostrar texto "Nenhuma corrida nesta semana" e o CTA "Ficar online".
7. **Dado fabricado:** um único chip de mock (`mock.chip`, §4) no cabeçalho do gráfico ("dados de exemplo"), e as barras com **hachura diagonal** em vez de preenchimento sólido. A hachura marca cada barra como "não real" sem acrescentar texto, e some sozinha quando o dado for real. Não usar o selo "!" amarelo por barra.
8. **320 pt:** com 7 barras em 288 pt úteis, cada barra fica com ~26 pt e vão de 14. Cabe. Com 24 barras (por hora) não cabe: agrupar em faixas de 3 h.
9. **Altura fixa de 120 pt** para o gráfico, para não empurrar a lista de ações para fora da tela em 568 pt de altura.

### 3.4 Fotografia de pessoa: o ponto delicado

As duas referências usam pessoas. No passageiro: o avatar "Juarez" em P03 e P13 e o motorista "Carlos Silva" em P09. No motorista: um homem de uniforme com boné e camisa VuumBora.

**Isso não pode ir para o produto como está.** São rostos gerados por IA. Eles podem se parecer com uma pessoa real, que não autorizou. O uniforme com a marca sugere que o VuumBora tem motoristas uniformizados, o que é uma afirmação sobre o negócio.

| Uso | Viável sem sessão de fotos? | Como |
|---|---|---|
| Avatar do usuário dentro do app | Sim | Inicial sobre disco (o que já temos) com o anel amarelo proposto. A foto real é a que o próprio usuário envia, com consentimento no cadastro |
| Foto do motorista na corrida (P09) | **Só com a foto real do motorista.** Nunca banco de imagens nem IA | Foto enviada pelo motorista no cadastro e verificada (é requisito de segurança, não estética). Sem foto: inicial |
| Pessoa em tela de marketing do app (onboarding, vazio) | Não recomendo | Cena sem pessoas: cidade, carro, rota. É o que gerei |
| Material de captação (anúncio, loja de apps, site) com motorista de uniforme | Exige sessão fotográfica **ou** banco de imagens com licença comercial e liberação de modelo (*model release*) | Ver abaixo |

**O que uma sessão exigiria:** modelo ou motorista parceiro real, termo de autorização de uso de imagem por escrito (Código Civil, art. 20; LGPD trata imagem de rosto como dado pessoal, e o termo precisa dizer finalidade, meios e prazo), uniforme produzido (que é outra decisão de negócio) e fotógrafo com cessão de direitos patrimoniais para o VuumBora.

**Banco de imagens** (Getty, Shutterstock, Adobe Stock): licença comercial padrão com *model release* incluído. Dois cuidados: (1) a licença padrão **proíbe uso "sensível"** e associar a pessoa a uma marca como se fosse funcionária pode exigir licença estendida, então é preciso ler a cláusula; (2) a mesma foto pode estar no anúncio do concorrente.

**Rosto gerado por IA em material comercial:** não recomendo. O risco jurídico é baixo mas não zero (semelhança com pessoa real), e o risco de reputação é real. Num app de mobilidade, "motorista de mentira" mina justamente a confiança que o produto vende.

---

## 4. Tokens propostos (para `tokens/vuumbora.tokens.json`, NÃO aplicados)

Bloco para revisão. Mantive o formato DTCG do arquivo. Nenhum HEX aprovado muda; tudo abaixo é **acréscimo**, salvo duas alterações de regra sinalizadas com ⚠ (decisão do dono).

```json
{
  "gradient": {
    "screen": { "$type": "gradient", "$value": "radial-gradient(120% 420px at 50% -60px, #0E1A2E 0%, rgba(14,26,46,0) 100%) sobre background.base",
      "$description": "Brilho de topo da tela. Só em telas com cabeçalho na área escura (início, carteira, perfil). Nunca sobre mapa." },
    "surface": {
      "raised":  { "$type": "gradient", "$value": [{"color":"#132033","position":0},{"color":"#0F1A28","position":1}],
        "$description": "Card, atalho, linha de lista. Vertical, 180°. Medido P03: #121F2F->#0F1A29. Substitui background.surface chapado em card; background.surface continua valendo em sheet e tab bar." },
      "overlay": { "$type": "gradient", "$value": [{"color":"#1D2B40","position":0},{"color":"#152132","position":1}],
        "$description": "Botão secundário cheio (Recusar), botão de ícone, CTA desabilitado. Medido no motorista: #273245->#232E3E (o render é mais claro; mantive a escala da paleta)." }
    },
    "cta": { "$type": "gradient", "$value": [{"color":"#FED202","position":0},{"color":"#FFCC00","position":0.45},{"color":"#FDB601","position":1}],
      "$description": "Botão primário. Medido P05 #FDD201->#FEB702 e P01 #FBD100->#FEB904. Texto sempre text.onYellow. Pior parada #FDB601: 10,68:1. Pressionado = brand.yellowPressed chapado." },
    "searchLight": { "$type": "gradient", "$value": [{"color":"#FEFEFE","position":0},{"color":"#EEF1F9","position":1}],
      "$description": "Pílula de destino (busca). Único elemento claro da tela. Texto #0C111B (16,72:1), apoio #4A5568 (6,66:1)." },
    "promo": { "$type": "gradient", "$value": [{"color":"#1D3A66","position":0},{"color":"#0F213D","position":1}],
      "$description": "Banner de promoção/segurança, 135°. Substitui o roxo da referência. Só text.primary (11,36:1) e text.secondary (6,43:1). text.muted REPROVA no topo (3,97:1): proibido." },
    "wallet": { "$type": "gradient", "$value": "usar gradient.brand (#FED202 -> #FEA101), 135°",
      "$description": "⚠ Card de saldo. Exige liberar gradient.brand sob texto, hoje proibido ('Nunca sob texto'). Com texto navy passa: pior parada #FEA101 = 9,28:1. Branco reprova (2,04:1). Decisão do dono." },
    "photoScrim": { "$type": "gradient", "$value": [{"color":"rgba(7,13,24,0)","position":"0"},{"color":"rgba(7,13,24,0.92)","position":"96pt"},{"color":"#070D18","position":"100%"}],
      "$description": "OBRIGATÓRIO atrás de qualquer bloco de texto sobre imagem. Ancorado no topo do bloco de texto (começa 96pt acima). Medido: sem ele, o rastro de luz do fundo cai atrás do título e o branco dá 1,29:1." }
  },
  "stroke": {
    "edgeTop":    { "$type": "color", "$value": "#46566C", "$description": "= border.emphasis. Borda SUPERIOR de card, campo e botão secundário (luz de cima). Medido: #4F596D (card), #364559 (campo)." },
    "edgeBottom": { "$type": "color", "$value": "#1E2A3B", "$description": "Bordas laterais e inferior. Medido #1F2A3B." },
    "ctaRim":     { "$type": "shadow", "$value": "inset 0 1px 0 rgba(255,255,255,0.60), inset 0 -1px 0 rgba(255,236,120,0.70)",
      "$description": "O 'brilho' do CTA medido na referência é isto: 1px claro em cima e embaixo, não halo." }
  },
  "elevation": {
    "0":   { "$type": "shadow", "$value": "none" },
    "1":   { "$type": "shadow", "$value": "0 2px 6px rgba(0,0,0,0.35)", "$description": "Card sobre fundo. Quase invisível sobre #070D18 (como na referência: delta de ~4 níveis). Quem separa é stroke.edgeTop." },
    "2":   { "$type": "shadow", "$value": "0 8px 20px rgba(0,0,0,0.45)", "$description": "Elemento sobre mapa ou foto (balão, cartão de instrução, pílula de destino). Aqui a sombra aparece e importa." },
    "3":   { "$type": "shadow", "$value": "0 -12px 28px rgba(0,0,0,0.50)", "$description": "Bottom sheet e tab bar (sombra para cima)." },
    "cta": { "$type": "shadow", "$value": "0 4px 12px rgba(0,0,0,0.45)", "$description": "Sombra escura sob o CTA. Sem cor." }
  },
  "glow": {
    "selected": { "$type": "shadow", "$value": "0 0 8px 1px rgba(255,204,0,0.30)", "$description": "Card selecionado (categoria, pagamento). Medido: ~4pt para fora. Junto com borda 2pt brand.yellow." },
    "route":    { "$type": "shadow", "$value": "rota extra de 7pt, #FFCC00 a 25%, desfoque 8pt", "$description": "Halo da rota no mapa (ver map.*)." }
  },
  "tint": {
    "yellowSoft": { "$type": "color", "$value": "rgba(255,204,0,0.10)", "$description": "Fundo da pastilha de ícone amarelo (atalhos). Composto sobre surface = #292D26; ícone amarelo sobre ele 9,27:1." }
  },
  "surface": {
    "glassOnMap": { "$type": "color", "$value": "rgba(17,27,42,0.88)", "$description": "Chip/cartão sobre mapa. SEM blur. Pior composição (sobre via principal) = #132034: muted 5,73:1, secondary 9,26:1. Borda 1px rgba(255,255,255,0.08), topo 0.14." },
    "tabBar":     { "$type": "color", "$value": "rgba(9,15,27,0.94)", "$description": "Tab bar + elevation.3 + borda superior stroke.edgeBottom. Aba ativa: ícone e rótulo brand.yellow + traço de 3pt no topo." }
  },
  "vehicle": {
    "iconBox": { "$type": "object", "$value": { "size": "48pt", "radius": "12pt", "fill": "gradient.surface.raised", "border": "stroke.edgeTop/edgeBottom", "icon": "carro frontal branco 28pt" },
      "$description": "Caixa do veículo na linha de categoria (P05). Medido ~50x48pt, raio ~12pt." },
    "iconBoxSelected": { "$type": "object", "$value": { "fill": "radial-gradient(circle, rgba(255,204,0,0) 35%, rgba(255,204,0,0.28) 100%) sobre background.surface", "border": "1px rgba(255,204,0,0.45)" },
      "$description": "Brilho INTERNO (amarelo nas bordas, escuro no centro), como medido: borda #7B6305, miolo #191B1F. Ícone continua branco (contraste máximo)." }
  },
  "map": {
    "land": "#0F2240", "block": "#11264A", "roadMinor": "#1A3560", "roadMajor": "#24477A", "water": "#081A33", "park": "#0F2A3A",
    "route": "#FFCC00 (já existe) · 7pt · contorno #0C111B 1,5pt · halo glow.route",
    "label": "#B9C4D2 com halo #0F2240 2pt (8,99:1)",
    "balloon": "fundo rgba(7,13,24,0.92), borda 1px topo rgba(185,196,210,0.55) base rgba(87,104,126,0.6), raio 12, elevation.2",
    "$description": "Medido P05/P09: solo #102645, vias #183862/#1C3D6D, rota 8,4pt. Pickup/destination/userLocation existentes: 6,97 / 5,75 / 6,58:1 sobre o solo."
  },
  "chart": {
    "barActive": "#FFCC00", "barInactive": "#5A6A80 (3,14:1 sobre surface; #46566C da referência reprova com 2,31)",
    "barMock": "hachura diagonal 45°, traço 2pt, cor da barra", "grid": "#1E2A3B", "label": "text.muted"
  },
  "mock": {
    "chip": { "$type": "object", "$value": { "border": "1px dashed #66768E", "text": "#B9C4D2", "size": "11pt/500", "height": "20pt" },
      "$description": "⚠ Proposta de trocar o MockBadge amarelo por chip neutro tracejado. Continua visível (texto 11,01:1, borda 4,21:1), mas tira 4 focos amarelos da home. Muda a convenção de honestidade da squad: decisão do Atlas/dono." }
  },
  "layout": {
    "screenPaddingCompact": { "$type": "dimension", "$value": "16px", "$description": "Largura < 375pt. screenPadding (20) continua a partir de 375." },
    "buttonHeightProminent": { "$type": "dimension", "$value": "56px", "$description": "CTA principal da tela. 52 (buttonHeight atual) quando altura da janela < 640pt." },
    "searchHeight": { "$type": "dimension", "$value": "60px", "$description": "Pílula de destino. 52 em < 360pt." }
  }
}
```

### 4.1 Tabela de contraste das superfícies novas (texto, WCAG AA 4,5:1)

| Superfície (pior parada) | primary | secondary | muted | amarelo | success | danger |
|---|---|---|---|---|---|---|
| `gradient.screen` topo `#0E1A2E` | 17,41 | 9,86 | 6,10 | 11,52 | 7,64 | 6,31 |
| `surface.raised` topo `#132033` | 16,38 | 9,27 | 5,73 | — | — | — |
| `surface.overlay` topo `#1D2B40` | 14,27 | 8,08 | 4,99 | 9,44 | 6,26 | 5,17 |
| card selecionado (8% amarelo) `#293135` | 13,25 | 7,50 | 4,64 | 8,76 | 5,81 | 4,80 |
| `gradient.promo` topo `#1D3A66` | 11,36 | 6,43 | **3,97 ✗** | 7,51 | 4,98 | **4,12 ✗** |
| `surface.glassOnMap` sobre via `#132034` | — | 9,26 | 5,73 | — | — | — |
| `map.balloon` sobre via `#091220` | 18,77 | 10,63 | — | — | — | — |
| `map.land` `#0F2240` | — | 8,99 | 5,56 | 10,50 | 6,97 | 5,75 |
| CTA desabilitado, texto muted sobre `#1D2B40` | — | — | 4,99 | — | — | — |

| Texto navy `#0C111B` sobre | Contraste | Branco sobre | Contraste |
|---|---|---|---|
| `#FED202` (topo do CTA) | 12,98 | idem | 1,45 ✗ |
| `#FDB601` (base do CTA) | 10,68 | idem | 1,77 ✗ |
| `#FEA101` (base da carteira) | 9,28 | idem | 2,04 ✗ |
| `#EEF1F9` (pílula de destino) | 16,72 | — | — |

**Regras que saem disso:** no banner promo, nada de `text.muted` nem de `danger`. Sobre qualquer amarelo, só navy. O amarelo continua sem ser fundo de tela: CTA, carteira e chip são blocos delimitados.

---

## 5. Implementação em React Native (para a Lyra)

- **Borda iluminada:** `borderWidth: 1`, `borderColor: stroke.edgeBottom`, `borderTopColor: stroke.edgeTop`. O RN aceita cor por lado. Não precisa de biblioteca.
- **Sombra e brilho interno:** a prop de estilo `boxShadow` (RN ≥ 0.76, New Architecture, iOS e Android, com cor e `inset`). O projeto está em RN 0.88 com New Arch obrigatória no Expo 58. ⚠ Funciona em teoria, mas **nenhum agente provou isso num aparelho Android**. Validar num Android de entrada antes de espalhar.
- **Gradiente:** duas opções. (a) `experimental_backgroundImage: 'linear-gradient(...)'` do RN core: sem dependência, mas com prefixo *experimental*, então é preciso confirmar o suporte na 0.88 e o comportamento no Android. (b) `expo-linear-gradient`: estável, mas é dependência nova (decisão do Atlas). Recomendo (b) para CTA e cards, que é onde o gradiente não pode falhar.
- **Vidro:** **não usar `expo-blur`.** No Android o blur é caro e inconsistente, e sobre mapa em movimento custa quadros. O "vidro" da referência medido é opaco a 88–92% com borda clara, e isso não precisa de blur.
- **Imagens:** `expo-image` com `contentFit="cover"` e `contentPosition` (precisa instalar; hoje não está). Com `Image` do RN core funciona igual, com `resizeMode="cover"`.
- **Ícone do veículo frontal:** o lucide não tem carro de frente. O SVG usado na maquete está em `tools/art-assets/home-premium.html`. Vale virar componente em `packages/ui`.

---

## 6. Comportamento em 320 pt (e em 568 pt de altura)

Medido na maquete com viewport emulado em 320, 360, 375, 390 e 430: **nenhum elemento passa da viewport, nenhum texto truncado, todo alvo de toque ≥ 44×44** (script em `tools/art-assets/render.js`, variável `MEASURE`). É maquete HTML: isto prova que a proposta *cabe*, não que o RN vai renderizar igual.

| Recurso | 390–430 pt | 320 pt | Por quê |
|---|---|---|---|
| Borda iluminada | igual | **igual** | Custa 0 pt |
| Gradiente de superfície | igual | igual | Custa 0 pt |
| Sombra (`elevation.1`/`2`) | completa | `elevation.2` cai para `0 6px 14px` | A sombra não ocupa layout, mas a margem de 16 pt corta sombra larga na lateral |
| Halo do card selecionado | 8 pt de desfoque | igual; o card ganha 1 pt de margem negativa para a borda de 2 pt não empurrar o layout | O halo transborda 4 pt e cabe nos 16 pt de margem |
| Sombra do CTA | `0 4px 12px` | igual | — |
| Atalhos Casa/Trabalho/Favoritos/Agendar | 4 colunas, ícone em cima | **2×2, ícone ao lado** | Em 4 colunas sobram 64 pt por atalho e o subtítulo trunca. É o que acontece **hoje** no app: "Escolha data e…" e "verificados e…" aparecem truncados no print real de 320 |
| Categorias | 3 cards lado a lado com ilustração do veículo | **lista vertical com caixa de ícone 48 pt** (padrão P05) | 3 colunas em 288 pt dão 88 pt por card, e "Vuum Econômico" quebra em 2 linhas |
| Ilustração do veículo | 120×52 pt no card | **substituída pela caixa de ícone** | Não cabe com legibilidade |
| Banner promo | 2 colunas com divisória | **empilhado** | O "10% OFF" de 24 pt não cabe ao lado |
| Pílula de destino | 60 pt | 60 pt (52 em < 360 se a altura apertar) | — |
| Mapa da home | 200 pt | **168 pt** | Altura, não largura: em 568 pt cada 32 pt conta |
| Fundo fotográfico do onboarding | cena inteira acima do texto | **a cena vira uma faixa de ~45% superior**; o scrim cobre o resto | Medido: em 320×568 o texto começa em 46% da altura. Sem scrim, o rastro de luz cai atrás do título (1,49:1). Com scrim, 16,8:1 |
| Lockup do logo no onboarding | 62% da largura (máx. 260) | 52% da largura (máx. 200) quando a altura < 640 | Altura |
| Logo grande nas telas internas (referência) | **não usar** | não usar | Ver §2.1 |

**Nenhum efeito é inviável em 320.** O que muda em 320 é **layout** (grade para lista), não acabamento. Fonte do sistema em 200%: a maquete não testou isso. A lista vertical de categorias e a grade 2×2 são justamente o que aguenta texto maior, mas **ninguém mediu ainda**.

---

## 7. Assets

### 7.1 Gerados (em `packages/ui/assets/`)

Todos procedurais (canvas/SVG renderizado no Chromium). São **ilustrações, não fotografia**. Não há imagem de terceiros, rosto, modelo de carro real nem marca de montadora: **sem implicação de licença**, e o VuumBora é o autor. Para regerar, use os fontes em `tools/art-assets/` (semente fixa, reprodutível).

| Arquivo | Tamanho | Uso | Fonte |
|---|---|---|---|
| `backgrounds/onboarding-noturno.jpg` | 1080×2340, 186 KB aprox. | Fundo das boas-vindas. `cover`, posição `center 30%`. Horizonte a 45% da altura; a partir de 72% é `#070D18` sólido. **Sempre com `gradient.photoScrim` sob o texto** | `onboarding-bg.html` |
| `map/mapa-escuro-natal.jpg` | 1170×1560 | Placeholder da porta de mapa estática (`HomeMapPreview`) até a D-11. Malha urbana + orla a leste, nas cores `map.*` | `map.html` |
| `vehicles/veiculo-{economico,comfort,plus}.png` + `@2x` + `@3x` | 150×65 pt | Perfil lateral com contorno iluminado (rim light amarelo). Só nos cards de categoria ≥ 360 pt | `cars.html?k=…` |

Limites honestos dos gerados: o fundo do onboarding tem estética de ilustração e **não iguala** a foto da referência. As silhuetas dos carros são genéricas, e o hatch "Econômico" se distingue pouco do sedã. Se o dono quiser o patamar "foto", ver 7.2. Um ilustrador refina as silhuetas em meio dia de trabalho.

### 7.2 Dependem de fotografia ou render 3D real (não gerei)

| Asset | Para quê | Caminhos | Licença e implicações |
|---|---|---|---|
| Foto noturna de cidade com rastros de luz | Onboarding nível "foto" | (a) banco de imagens (Adobe/Shutterstock) ~US$ 10–80; (b) foto própria de Natal (ex.: Ponte Newton Navarro, Via Costeira) com fotógrafo local | (a) licença padrão cobre uso em app; ler a cláusula de "uso em logotipo/marca" (não pode). (b) Cessão de direitos patrimoniais por escrito. Prédio identificável em foto de via pública é uso livre no Brasil (Lei 9.610, art. 48) |
| Carro na cena (P01, P03, P13b) | Herói da home e do onboarding | (a) render 3D de carro **genérico** (Sketchfab/TurboSquid com licença comercial) com o adesivo VuumBora aplicado; (b) foto de carro real da frota parceira | O carro da referência tem desenho de Hyundai/Chevrolet. Usar modelo **reconhecível** num anúncio sugere parceria com a montadora (trade dress). O render precisa ser de modelo genérico ou com a grade e o logo removidos |
| Pessoas (motorista, passageiro) | Marketing | Ver §3.4 | Termo de uso de imagem, LGPD, *model release* |
| Ilustração 3D do presente (P03 "Indique e ganhe") | Banner | Pack de ícones 3D com licença comercial, ou nada (ícone `gift` do lucide em `tint.yellowSoft` resolve) | Só se a funcionalidade existir (§8) |

---

## 8. Registrado, não resolvido (decisões do dono)

1. **Carteira (P12):** saldo, adicionar e transferir saldo. O visual está especificado (`gradient.wallet` com texto navy), mas **a existência de carteira com saldo não está decidida**. Saldo guardado tem implicação regulatória (arranjo de pagamento, Banco Central) e não é só tela.
2. **"Indique e ganhe" (P03):** visual especificado (`gradient.promo`). A **existência do programa de indicação não está decidida**.
3. **Categorias e preços:** a referência usa "VuumBora Econômico / Comfort / Premium" a R$ 14,90 / 19,90 / 29,90. O app implementa "Vuum Econômico / Vuum Comfort / Vuum Plus" a R$ 23,90 / 29,90 / 37,90 (mock). Os nomes e preços não são decisão minha. Os assets de veículo ficaram nomeados `economico/comfort/plus` e um eventual "premium" usa o `plus`.
4. **⚠ `gradient.brand` sob texto:** hoje é proibido pelo token aprovado. A carteira precisa dessa liberação, com texto navy.
5. **⚠ MockBadge neutro:** trocar o selo amarelo por chip tracejado neutro mexe numa convenção de honestidade da squad.
6. **Barra de destino clara no lugar da amarela:** é a mudança de maior impacto visual e a mais visível para o dono. Recomendo; não é óbvia.
7. **Tema claro do mapa para o motorista de dia:** não especificado.

---

## 9. Ordem de aplicação para a Lyra (maior impacto por esforço primeiro)

1. **Tirar amarelo de onde não é ação** (depende das decisões 5 e 6): barra de destino em `gradient.searchLight`; avatar com anel em vez de disco cheio; MockBadge neutro; banner sem borda amarela. *Esforço baixo, maior ganho.*
2. **Borda iluminada** (`stroke.edgeTop`/`edgeBottom`) em todo card, campo e botão secundário: alterar `InfoCard`, `InputCore`, `SecondaryButton`, `QuickAccessGrid`, `RideCategoryCard`, `PaymentMethodOption`, `RouteSummaryRow`.
3. **CTA**: `gradient.cta` + `stroke.ctaRim` + `elevation.cta` em `ButtonCore`/`PrimaryButton`. Estado desabilitado em `gradient.surface.overlay`, sem brilho. Altura 56 (52 com altura < 640).
4. **Card selecionado**: borda 2 pt + `glow.selected` (categoria e pagamento).
5. **Responsividade de layout em 320** (§6): atalhos 2×2, categorias em lista com `vehicle.iconBox`, promo empilhado. Isso corrige a truncagem que **já existe hoje** em 320.
6. **Superfícies e tab bar**: `gradient.surface.raised` nos cards, `gradient.screen` nas telas, `surface.tabBar` + `elevation.3`.
7. **Mapa**: trocar o placeholder por `mapa-escuro-natal.jpg`; chips sobre o mapa em `surface.glassOnMap`. A especificação `map.*` fica para o SDK.
8. **Assets de veículo** nos cards ≥ 360 pt.
9. **Boas-vindas** (tela nova): fundo + scrim + lockup, conforme a maquete `tools/art-assets/onboarding-premium.html`.

Para cada item: medir no navegador em 320/360/390/430 (skill `medir-antes-de-afirmar`) e passar pela Íris.

---

## 10. Reprodução

```
cd tools/art-assets
set PLAYWRIGHT_CORE=<caminho de uma instalação de playwright-core>   (o repo não tem)
node render.js onboarding-bg.html out.png 1080 2340 1
node render.js map.html out.png 1170 1560 1
node render.js "cars.html?k=plus" out.png 600 260 0.75          (ALPHA=1 para fundo transparente)
node render.js home-premium.html out.png 320 700 2 1
node render.js onboarding-premium.html out.png 320 568 2
```

O "antes" da amostra é o app real: `npx expo start --web` em `apps/passenger`, capturado em 320 e 390 pt com viewport alta para o `ScrollView` caber inteiro.

---

## 11. Decisões do dono registradas em 18/11/2026 (tarde)

1. **Padrão premium vale para TODAS as telas**, não só as da referência. Telas
   construídas antes do acabamento (fluxo de corrida, autenticação, dashboard do
   motorista) precisam ser auditadas e trazidas ao mesmo nível.
2. **Fundo dos renders de veículo:** o dono aceita o fundo preto por ora. A
   remoção para fundo transparente fica para uma ferramenta dedicada, depois —
   não é motivo para segurar a entrega nem para gastar crédito tentando
   contornar o limite do plano gratuito.
3. **Tipografia:** Plus Jakarta Sans confirmada. A diretriz que pedia Inter foi
   revista pelo próprio dono.
