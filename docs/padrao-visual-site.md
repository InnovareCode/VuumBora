# Padrão visual do site — medido, não descrito

Escrito em 19/11/2026, depois de o dono reprovar a versão anterior:

> "está parecendo um site que só fez jogar as imagens e pronto"

Ele estava certo. As artes viraram retângulos isolados, empilhados, cada um
com o mesmo peso visual e nenhuma composição entre eles. O que faltava não era
qualidade de imagem — era **composição**.

A referência que ele deu foi o outro projeto dele, `www.modashop.net.br`. O que
segue abaixo **não é opinião sobre aquele site**: foi medido no navegador, lendo
o CSS computado. Use estes números, não a memória de como "parecia".

---

## 1. Foto com transparência — a receita

É o pedido literal do dono ("quero que use transparência nas fotos"). No
ModaShop, a foto nunca é um bloco com texto embaixo: o texto fica **dentro** da
foto, sobre **duas** camadas de gradiente, não uma.

```
container  → border-radius: 28px; overflow: hidden; position: relative
  ├── img  → position: absolute; inset: 0; object-fit: cover
  ├── véu de baixo (onde o texto vai ficar):
  │     linear-gradient(to top,
  │       rgba(6, 11, 18, 0.95),
  │       rgba(6, 11, 18, 0.8) 55%,
  │       rgba(0, 0, 0, 0))
  ├── véu de cima (profundidade, impede a foto de "flutuar"):
  │     linear-gradient(rgba(6, 11, 18, 0.5), rgba(0, 0, 0, 0))
  └── conteúdo (pílula → título → apoio → botão)
```

A cor dos véus é `rgb(6, 11, 18)`. A nossa base é `#070D18` = `rgb(7, 13, 24)`,
praticamente a mesma — use **o nosso token**, não o número deles.

Quando o texto for à esquerda e a foto à direita (hero), o véu vira horizontal:

```
linear-gradient(to right,
  rgba(7, 13, 24, 0.95),
  rgba(7, 13, 24, 0.85) 45%,
  rgba(7, 13, 24, 0.4))
```

**De onde sai a foto:** `foto900` / `foto560` em `src/content/artes.ts` — recorte
da arte a partir de 48% da largura, onde os dizeres desenhados já terminaram.
Nunca use `completa` sob texto HTML: os dizeres apareceriam duas vezes.

## 2. Tipografia — o que dá o ar de acabado

| Elemento | Peso | Tamanho | Tracking |
|---|---|---|---|
| Título de seção | 700–800 | 24px+ | **negativo**, ~−0,025em |
| Pílula / olho | 800 | 12px | **+0,05em**, maiúsculas |
| Botão | 700 | 14px | normal |
| Texto de apoio | 500 | 14–16px | normal |

O **tracking negativo no título** é o detalhe que mais separa "amador" de
"acabado": títulos grandes com espaçamento padrão parecem frouxos. A pílula faz
o oposto — pequena, apertada de peso e **aberta** de espaçamento.

Nossa fonte é Poppins (o dono informou em 19/11/2026); os pesos já estão em
`globals.css` como `--peso-titulo` (800), `--peso-apoio` (500) e `--peso-olho`
(600).

## 3. Formas

- Cartão com foto: raio **28px**, `overflow: hidden`
- Botão: raio **16px**, padding **10px 20px**, altura ~40px
- Pílula: raio **10px**, padding **4px 10px**, altura ~24px

## 4. Organização — o que faltava de verdade

O ModaShop não alterna imagem-texto-imagem. Ele **varia o tipo de bloco**, e é
isso que cria ritmo:

1. Hero com foto ao fundo, dois botões (um sólido, um de contorno) e selos de
   confiança em linha
2. Faixa de atalhos/categorias — blocos pequenos, muitos, baixos
3. **Duas colunas de escolha** ("Como você quer comprar hoje?") — cada uma é
   foto + véu + pílula + título + apoio + botão. É o bloco mais forte da página
4. Faixa de três benefícios com ícone em caixa colorida
5. Grade de produtos com selos e título de seção + "Ver todos →"

Repare que **nenhum bloco se repete em seguida**. Página que repete o mesmo
bloco cinco vezes lê como lista, não como página.

## 5. O que NÃO copiar

- A fonte deles (Montserrat Alternates) — a nossa é Poppins, e Montserrat
  Alternates já foi reprovada aqui por deformar maiúsculas (`docs/tipografia.md`)
- As cores (laranja/ciano) — a nossa paleta é navy + `#FFCC00`
- Barra de cookies, busca, carrinho: o VuumBora é uma página de pré-lançamento,
  não uma loja. Copiar a estrutura de um marketplace numa página de captação
  seria encher de elemento sem função.

O que se copia é o **método**: foto com véu em vez de foto solta, blocos que
variam de forma, tracking negativo no título, e um botão claro por bloco.
