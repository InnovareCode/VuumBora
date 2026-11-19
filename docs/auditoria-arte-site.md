# Auditoria de direção de arte — site de pré-lançamento

Apolo, 19/11/2026. Quarta reprovação do dono: "está muito muito muito FEIO".

Tudo abaixo foi **medido** no `localhost:3000` com Playwright (Chromium), em
1440×900 e 390×844, lendo `getBoundingClientRect()`, `getComputedStyle()` e a
luminância dos pixels renderizados. Onde digo "parece", é opinião de diretor de
arte e está marcado como tal.

---

## Veredito em uma frase

**A estrutura está errada na raiz. Não remende.** A página pegou as artes do
dono — que já são composições prontas, claras, quentes e com tipografia grande
— e as desmontou em seis cartões escuros, do mesmo formato, com título de 28px.
O resultado é o oposto do que ele mesmo desenhou. Ele olha a página e não
reconhece o próprio trabalho: é isso que "feio" quer dizer aqui.

A prova mais simples: abra `Imagens_Site/VuumBora em Ponta Negra ao amanhecer.png`
ao lado do hero. Na arte dele, o título ocupa ~30% da largura e o céu é dourado.
No site, o título ocupa 1,9% da largura da tela e a foto virou azul-marinho.

---

## CRÍTICO

### C1. O véu apagou as fotos — a página inteira tem um tom só

| Foto | Luminância média da fonte (0–255) | Renderizada | Faixa do meio (rosto/tronco) |
|---|---|---|---|
| Hero (Ponta Negra) | 106 | 40 | **26** |
| Repasse rápido | 104 | 42 | **27** |
| Motorista mulher | 99 | 37 | **31** |
| Prefere motorista mulher | 104 | 39 | **30** |
| Sua escolha | 103 | 38 | **29** |
| Suporte local | 101 | 36 | **33** |

As fotos perdem **~62% da luz**, e o miolo — onde estão rosto, uniforme com a
marca e o carro — cai para 26–33 de 255, praticamente preto. Por isso tudo lê
como uma só massa navy lamacenta, sem um ponto de luz na página.

**Causa raiz:** a receita do ModaShop (`docs/padrao-visual-site.md` §1) foi
aplicada ao pé da letra. O véu de baixo chega a **80% de opacidade a 55% da
altura** (`PhotoCard.module.css`, `.veilBottom`) e o de cima soma 50% no topo:
o cartão fica coberto do topo à base. No ModaShop a foto é fundo decorativo de
um cartão de escolha; aqui **a foto é o produto** — gente local, sorrindo, com a
camisa da marca. Receita certa no contexto errado.

**Correção:** véu só onde há texto, e curto. Para texto ocupando os 25–30% de
baixo do quadro:
```
linear-gradient(to top, rgba(7,13,24,.92) 0%, rgba(7,13,24,.6) 22%, rgba(7,13,24,0) 42%)
```
Sem véu de cima. Meta medível: faixa do meio da foto renderizada ≥ 85% da
luminância da fonte (hoje: ~28%).

### C2. Não existe hierarquia tipográfica: sete títulos com 28px

Desktop: H1 do hero = **28px/800**. Os cinco H2 dos cartões = **28px/800**. O H2
do formulário = **28px/800**. A página não tem um título principal — tem sete
títulos iguais.

Mobile é pior: o **H1 tem 20px** e o H2 do formulário logo abaixo tem **28px**.
A hierarquia está invertida: o título da página é o menor título da tela.

Referência do próprio dono: na arte do hero, "Dirija com a VuumBora." ocupa
~500 de 1672px (30% da largura). Trazido para 1440px, isso é um H1 de
**64–72px**. O site usa 28px — menos da metade.

**Correção:** escala com degraus de verdade.
- H1: `clamp(40px, 6vw, 72px)`, 800, tracking −0,03em, line-height 1.02
- H2 de seção: `clamp(28px, 3.4vw, 44px)`
- Título de cartão (se sobrar algum): 22–24px
- Mobile: H1 ≥ 40px. Nunca menor que qualquer outro título da tela.

### C3. O hero não tem título visível na primeira dobra

Em 1440×900, o H1 está em **y = 957** — abaixo da dobra. O que o visitante vê
em 3 segundos: um logotipo de 140×34, **212px de vazio** acima da foto, uma foto
escurecida sem texto, e um formulário de 1012px de altura começando em y = 128.

Em 1366×768 (o notebook mais comum no Brasil) o título fica ainda mais longe.

A causa é geométrica: a grade do hero usa `align-items: center` e o
formulário tem **1012px** de altura (maior que a tela). A foto (779px) é
centralizada contra ele, então desce 158px em relação ao topo do formulário e
leva o título para fora da tela.

Leitura em 3 segundos hoje: "formulário de cadastro num fundo escuro". Não se
lê *o que* é o VuumBora, *onde* (Natal) nem *por que* (taxa menor).

**Correção:** o hero tem que caber em 100svh e conter, nesta ordem: marca,
H1 grande, promessa ("taxas mais competitivas para motoristas de Natal e
região"), um botão amarelo "Quero dirigir com a VuumBora" e a foto clara. O
formulário completo sai do hero (ver E1).

### C4. Um bloco só, repetido seis vezes — o defeito que o doc mandava evitar

`docs/padrao-visual-site.md` §4 diz: "nenhum bloco se repete em seguida". A
página tem **seis instâncias do mesmo `PhotoCard`** (hero + 2 + 2 + 1), todas com:
foto escura → pílula amarela → título 28px com destaque amarelo → apoio 14px.
Mudou só a proporção (4/5, 4/3, 8/9, 16/9). Proporção diferente não é bloco
diferente: o olho lê o mesmo cartão seis vezes.

A pílula "PRÉ-LANÇAMENTO" aparece **6 vezes** (3 delas "PRÉ-LANÇAMENTO • GRANDE
NATAL"). Repetida, deixa de informar e vira ruído.

E nenhum cartão tem ação: **zero botões** entre o formulário do hero
(y ≈ 1000) e o da lista de passageiros (y = 3651). Quase 2.700px de página sem
nada para clicar, numa página cuja única função é captar motorista.

**Correção:** é aqui que a estrutura precisa ser refeita (ver "Estrutura
proposta").

---

## ALTO

### A1. Enquadramento — o recorte a 48% corta o que importa

- **Hero:** o carro aparece cortado ao meio na borda esquerda; o braço do
  motorista é cortado na borda direita. O assunto está empurrado para a direita
  de um quadro 3:4.
- **Suporte local, desktop:** a fonte tem **1120×1213** (quase quadrada) e é
  exibida num quadro de **1084×610** (16:9) com `object-position: 50% 50%`. Só
  **52% da altura** aparece: a testa é cortada, o rosto vira um close gigante
  que ocupa o quadro inteiro.
- **Suporte local, mobile:** quadro de **329×185**. O corte passa nos olhos e o
  bloco de texto cobre boca e queixo. É a pior imagem da página.
- Nenhuma imagem define `object-position`; todas estão no centro geométrico,
  que raramente é onde está o rosto.

**Correção:** `object-position` por arte, com o rosto no terço superior (ex.:
suporte `50% 18%`; hero `70% 30%`). Banda 16:9 não serve para foto quase
quadrada — ou a faixa vira 4:3/1:1, ou a foto vai em meia-largura.

### A2. Resolução insuficiente para tela de alta densidade

| Foto | Natural | Caixa CSS | Necessário em 2× |
|---|---|---|---|
| Hero | 792×858 | 584×779 | 1168×1558 |
| Suporte local | 1120×1213 | 1084×610 | 2168×1220 |
| Prefere motorista mulher | 864×936 | 631×473 | 1262×946 |

Em notebook Retina/celular, todas ficam moles. O teto é a própria arte: a parte
fotográfica do original de 1672px tem ~870px de largura.

**Correção:** pedir ao dono as **fotos sem texto** em alta (≥ 2000px de largura)
— ele gerou as artes, deve ter as bases. Enquanto não chegam, nenhuma foto deve
ser exibida a mais de ~600px CSS de largura.

### A3. Marca fraca

Logotipo com **140×34px** (9,7% da largura em 1440). Na arte do dono, o logo
ocupa ~18% da largura, com o selo "MOBILIDADE URBANA". O header não tem nenhuma
ação (nem um "Quero dirigir"), e logo abaixo dele há 212px de vazio.

**Correção:** logo ≥ 180px de largura no desktop, header com botão de contorno
"Quero dirigir" ancorado no formulário.

### A4. O compromisso público vira o elemento mais gritante no mobile

No 390px, a faixa "Compromisso público" tem **8 linhas de título em 800**,
borda amarela e brilho — é mais alta e mais pesada que o H1 do hero (20px).
O conteúdo é ótimo; a forma rouba o foco do que importa.

**Correção:** texto em 18–20px/600, sem brilho, com a borda amarela só à
esquerda (4px), e posicionado junto ao formulário, como argumento de
confiança — não como seção solta.

---

## MÉDIO

### M1. Ritmo: hairline + 40px entre todos os blocos

Todas as seções têm `padding: 40px/40px` e `border-top: 1px`. São seis linhas
finas idênticas cortando a página em fatias iguais de foto. Ritmo uniforme lê
como lista.

**Correção:** remover as linhas; respiro de 96–128px entre blocos no desktop
(56–72px no mobile); alternar fundo (navy base / navy surface / uma faixa
clara ou amarela) para marcar mudança de assunto.

### M2. Formulário longo demais para o primeiro contato

Cartão do formulário: **1012px** no desktop, **916px** só o `<form>` no mobile.
No mobile, o botão "Enviar candidatura" está em **y = 1569** — quase 2 telas
abaixo do topo. O aviso de privacidade em 12px tem 7 linhas logo abaixo do
botão.

**Correção:** etapa 1 com nome, WhatsApp e cidade. E-mail e as duas perguntas
opcionais podem ir para depois do envio (ou ficar colapsados). Privacidade em
2 linhas + link.

### M3. Campos em Arial

Os `<input>` e `<select>` renderizam em **Arial 16px** — não herdam Poppins.
Placeholder e valor ficam com outra fonte, ao lado de rótulos em Poppins. É o
tipo de detalhe que faz o formulário parecer "de template".

**Correção:** `input, select, textarea, button { font: inherit; }` no global.

### M4. Três estilos de olho/pílula

- Formulário: 14px/600, tracking 1,96px, amarelo, sem fundo
- Cartões: 12px/600, tracking 1,68px, amarelo, pílula escura
- Passageiro/rodapé: 12px/600, cinza `rgb(141,154,172)`, sem fundo

O doc pede 800 de peso para a pílula; está 600. E o H2 do formulário tem
tracking `normal`, enquanto os cartões têm −0,7px.

**Correção:** um único estilo de olho (12px/700, +0,12em, amarelo, sem fundo),
e tracking negativo em todos os títulos.

---

## O que presta — não destrua

- **Paleta navy + `#FFCC00`**: correta e coerente com a arte e com o app.
- **Poppins 800 com o destaque em amarelo** no fim do título ("Repasse mais
  **rápido.**"): é a assinatura visual das artes do dono. Mantenha, só que
  grande.
- **As fotos em si**: são boas, locais (Morro do Careca, Ponte Newton Navarro,
  Forte dos Reis Magos), com gente real e a camisa da marca. O problema é o
  tratamento, não a matéria-prima.
- **O texto do formulário e do compromisso**: honesto, claro, sem promessa
  vazia. O conteúdo fica; muda a forma.
- **Rodapé**: organizado, colunas alinhadas, bem resolvido.
- **Bloco do passageiro**: forma diferente dos demais, botão claro — é o único
  bloco que varia de verdade. Pode ficar quase como está.
- Raio de 28px nas fotos e de 16px no botão: corretos.

---

## Estrutura proposta (refazer, não remendar)

A lógica: **o site deve parecer a arte do dono ganhando vida**, não um mural
de cartões.

1. **Hero de tela cheia (100svh)** — reproduz a composição das artes: foto da
   Ponta Negra **clara**, à direita, sangrando até a borda; degradê navy só à
   esquerda (como na arte original: navy sólido → transparente em ~45%);
   à esquerda, logo grande, olho "PRÉ-LANÇAMENTO · NATAL E GRANDE NATAL", H1 de
   64–72px ("Dirija com a **VuumBora.**"), promessa em 18–20px, botão amarelo
   "Quero dirigir" (âncora para o formulário) e um botão de contorno
   secundário "Sou passageiro".
2. **Faixa de 3 benefícios**, baixa, sem foto: Repasse mais rápido / Suporte
   local / Modalidade com motoristas mulheres — ícone em caixa amarela, título
   20px, uma linha de apoio. É o bloco de "atalhos" do ModaShop.
3. **Duas colunas de escolha** (o bloco mais forte, como no ModaShop):
   "Quero dirigir" (foto do motorista do repasse) e "Quero dirigir — modalidade
   motoristas mulheres" (foto da motorista com a ponte). Cada cartão com véu
   **curto**, título 32px e **botão**. Aqui sim cartão com foto.
4. **Seção do formulário**: meia-largura foto (motorista mulher com a
   passageira, clara, sem véu) + meia-largura formulário curto. O compromisso
   público entra aqui, como selo de confiança acima do botão.
5. **Faixa "Suporte local"** em meia-largura: foto 4:5 do atendente com o
   Forte ao fundo (rosto inteiro), texto ao lado. Fundo navy surface.
6. **Passageiro** (como está) → **Quem está por trás** → **Rodapé**.

Seis blocos, seis formas diferentes, botão em quase todos, e a foto aparecendo
com a luz que o dono deu a ela.

### Critérios medíveis para a próxima entrega (para o teste, não para opinião)

- Em 1440×900 **e** 1366×768: H1 com `bottom` < altura da viewport, e o botão
  primário também.
- H1 ≥ 2× o tamanho de qualquer H2 de cartão; no mobile H1 ≥ 40px.
- Faixa do meio de cada foto renderizada ≥ 85% da luminância da fonte.
- Nenhum `<input>` com `font-family` diferente do `<body>`.
- Nenhum bloco consecutivo com o mesmo componente.
- Distância vertical entre botões de ação ≤ 1,5 viewport.
