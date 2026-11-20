# Direção: apresentar a marca e elevar a parte de baixo do site

Escrito em 20/11/2026, por Apolo (direção de arte), com duas decisões do
dono tomadas no mesmo dia e registradas no fim.

**Por que existe.** O dono disse duas coisas, na mesma sessão:

1. *"O site está ficando maravilhoso, porém aparenta ser dividido em partes:
   uma extremamente profissional e outra amadora."* A parte boa é o hero. A
   fraca começa nos 4 cartões de motivos.
2. *"Nesta etapa de pré-lançamento, ninguém ainda nos conhece. Precisamos
   passar o conhecimento de quem somos, para quando as pessoas acessarem o
   site, saber do que se trata."*

Hoje a página responde *"por que me candidatar"* antes de responder *"o que
é isso"*. Em nenhum lugar acima da metade da página aparece que a VuumBora é
um aplicativo de corridas, de quem é, ou por que confiar. O CNPJ só aparece
no rodapé.

---

## 1. Por que o hero parece profissional e o resto não

Não é falta de enfeite. São mecanismos que existem em cima e somem embaixo:

| Mecanismo | No hero | Abaixo dele |
|---|---|---|
| **Fonte de luz** | foto com luz âmbar e partículas | `#111B25` sobre `#0A1119`, sem luz |
| **Contraste de tamanho** | H1 64px / texto 18px = 3,5× | título 22px / texto 15px = 1,47× |
| **Movimento com motivo** | cada faixa entra de um jeito | um `.reveal` para a seção inteira |
| **Ponto de partida** | texto à esquerda, cartão à direita | 4 cartões idênticos, sem hierarquia |
| **Cor como sinal** | amarelo em 2 lugares | 8 marcas amarelas iguais, sem sentido |
| **Avanço** | manhã → dia → fim do dia | "taxa menor" repetida 3 vezes |

Defeitos de acabamento encontrados:

- O `<em>` do carrossel sai em **itálico falso**: o `index.html` carrega só
  `Poppins:wght@500;800`, sem itálico. Mesma armadilha do peso 700 que já
  reprovou o formulário.
- `carrossel-repasse-rapido.jpg` tem um pedaço de texto da arte original
  cortado na borda esquerda.
- "PRÉ-LANÇAMENTO" se repete 5 vezes na página.

---

## 2. Estrutura nova, na ordem das perguntas do visitante

| # | Bloco | Responde |
|---|---|---|
| 0 | Hero *(só o texto muda)* | o que é isso? |
| 1 | **QUEM SOMOS** *(novo)* | de quem é, por que existe, é real? |
| 2 | **ONDE ESTAMOS** *(novo)* | por que confiar num app que não lançou? |
| 3 | Motivos (4 cartões) | o que eu ganho? |
| 4 | Carrossel | quem são as pessoas? |
| 5 | Perguntas, simulador, rodapé | sem mudança |

A seção `commitment-section` **sai**, e o texto dela vira a 4ª estação da
linha do tempo do ONDE ESTAMOS.

---

## 3. Texto literal

O que estiver entre `**` fica amarelo. Sem travessão e sem palavra de
enchimento.

### 0. Hero (só o texto de apoio e o olho)

- Olho: `APLICATIVO DE CORRIDAS · NATAL E GRANDE NATAL`
- H1: **sem mudança**
- Apoio: A VuumBora é um aplicativo de corridas feito em Natal, para Natal e
  a Grande Natal. O cadastro de motorista abre antes do aplicativo.

### 1. QUEM SOMOS

- Olho: `QUEM SOMOS`
- H2: Um aplicativo de corridas **nascido em Natal.**
- Parágrafo 1: A VuumBora é o aplicativo de mobilidade urbana da Innovare
  Code, empresa de tecnologia de Natal. Estamos montando a rede de motoristas
  antes de abrir o aplicativo, para que a primeira corrida já encontre gente
  pronta na rua.
- Parágrafo 2: Quem dirige por aplicativo merece saber, antes de começar,
  quanto fica com a plataforma e quando o dinheiro cai. Por isso as regras
  vêm antes do lançamento.

**A ficha ao lado** (rótulo em mono cinza, valor em branco):

| Rótulo | Valor |
|---|---|
| *(topo)* | o logo, `assets/img/logo-vuumbora.png` |
| `PRODUTO` | Aplicativo de corridas |
| `ONDE` | Natal e Grande Natal |
| `QUEM FAZ` | Innovare Code |
| `CNPJ` | 09.813.446/0001-00 *(mono, números de largura fixa)* |
| `FASE` | Pré-lançamento *(com ponto amarelo parado)* |
| `FALE COM A GENTE` | WhatsApp (84) 3113-2584, link `wa.me` |
| `INSTAGRAM` | @vuumbora.oficial, com link |

Visual: desktop em duas colunas desiguais (7/5), texto à esquerda e ficha à
direita; em mobile a ficha vem depois. Ficha com fundo `--panel`, borda 1px
`rgba(255,255,255,.08)`, raio 20, linhas separadas por filete
`rgba(255,255,255,.06)`. Atrás dela, um brilho quente grande
(`radial-gradient` com `rgba(136,103,73,.14)`) — é a luz do amanhecer do
hero continuando, o mecanismo que faltava abaixo dele.

### 2. ONDE ESTAMOS

- Olho: `ONDE ESTAMOS`
- H2: Ainda não lançamos. **Aqui está o que já existe.**

Quatro estações numa linha do tempo, com um marcador **HOJE** depois da
segunda:

| Rótulo | Título | Texto |
|---|---|---|
| `JÁ FUNCIONA` | Candidatura de motorista | O formulário desta página grava sua candidatura de verdade. A resposta vem pelo WhatsApp que você informar. |
| `JÁ FUNCIONA` | Gente do outro lado | WhatsApp (84) 3113-2584 e @vuumbora.oficial, com resposta de uma pessoa daqui. |
| `EM CONSTRUÇÃO` | O aplicativo | Os aplicativos de passageiro e de motorista estão sendo construídos. Ainda não há data de lançamento. |
| `ANTES DE ABRIR O CADASTRO` | As regras, por escrito | As regras de taxa da plataforma e de repasse ao motorista serão publicadas antes de o cadastro de motoristas ser aberto. |

### 3. Motivos

- Olho: `O QUE JÁ ESTÁ DECIDIDO`
- H2: Um aplicativo que começa **por quem dirige.**
- Apoio: Quatro decisões tomadas antes do lançamento. Os números saem por
  escrito antes de o cadastro abrir.

| Rótulo | Título | Texto |
|---|---|---|
| `01 / TAXA` | Taxa menor. **Sobra mais.** | No fim do dia, o que conta é o que ficou no seu bolso. A taxa exata sai publicada antes de o cadastro abrir. |
| `02 / REPASSE` | O dinheiro chega **mais rápido.** | Combustível e parcela do carro não esperam o mês virar. As regras de repasse saem por escrito, junto com a taxa. |
| `03 / NATAL` | Suporte que **conhece a rua.** | Quem atende é daqui e conhece a cidade onde você roda, da Redinha a Ponta Negra. |
| `04 / ESCOLHA` | Uma modalidade **para motoristas mulheres.** | A passageira vai poder escolher ser atendida por uma mulher. Se é você ao volante, a candidatura é esta mesma. |

### 4. Carrossel

O título do carrossel hoje é `visually-hidden` e passa a aparecer.

- Olho: `GENTE DA GRANDE NATAL`
- H2: A cidade é a mesma. **O jeito de rodar muda.**

Os títulos de cada slide vêm das artes do dono e precisam bater com o
Instagram dele, então ficam. Muda o olho e o texto, que passam a falar com o
motorista:

| Olho | Título | Texto |
|---|---|---|
| `MOTORISTA` | Repasse mais **rápido.** | O dinheiro da corrida chega antes na sua mão. A regra exata sai por escrito com a taxa. |
| `MOTORISTA MULHER` | Motorista, vem dirigir **com a gente.** | Se você é motorista mulher, a candidatura é a mesma e a fila começa aqui. |
| `NA CORRIDA` | Prefere uma **motorista mulher?** | Na VuumBora, a passageira vai poder fazer essa escolha. Do outro lado do pedido, está você. |
| `NO APP` | Sua corrida, **sua escolha.** | Escolher com quem viajar faz parte do pedido, não é favor. |
| `SUPORTE` | Suporte **local.** | Gente daqui, que conhece a cidade onde você roda, do outro lado da linha. |

---

## 4. A regra do amarelo

`--accent #FFCC00` **entra em quatro lugares, e só neles:**

1. **A ação** — fundo do botão principal, com texto escuro. Único uso como fundo.
2. **O fecho de cada título** — uma frase por título, sempre a parte final,
   até 4 palavras, Poppins 800, **nunca em itálico**. Vale para H2, cartão e slide.
3. **Um olho por seção**, em mono, como o hero já faz.
4. **Sinais de estado** — pino aceso, barra de progresso do slide ativo, anel
   de foco, borda no hover (`rgba(255,204,0,.28)`), ponto da FASE na ficha,
   trecho percorrido da linha do tempo e pino HOJE.

**Não entra em:** nenhum parágrafo ou texto de apoio; rótulos dos cartões
(`01 / TAXA` vai para `--text-secondary`); olhos dos slides (idem); fundo
atrás de texto branco (contraste ~1,4:1, reprova); degradês ou brilhos acima
de 0,18 de transparência; itálico; valores da ficha; CNPJ.

**Limite por tela:** no máximo 1 frase amarela por bloco, e no máximo 6
frases amarelas de texto na mesma tela.

---

## 5. Animações, com gatilho e tempo

Em todas: o **estado final é o padrão do CSS**; o JS coloca `data-armed` para
apagar antes de animar, no mesmo padrão do `.reveal` que já existe. Sem JS, ou
com `prefers-reduced-motion`, aparece o estado final direto.

### Cartões em desktop (≥1100px): "a rota passa e o motivo acende"

Uma linha de 2px atravessa o topo da grade (trilho `rgba(255,255,255,.08)`),
com um pino de 12px no canto superior esquerdo de cada cartão. Apagado, o pino
tem miolo `--canvas` e borda `--accent-muted`. É o mesmo gesto do pin da marca.

Gatilho: IntersectionObserver na grade, 40% visível, uma vez só.

| Momento | O que acontece |
|---|---|
| 0, 90, 180, 270ms | cada cartão aparece e sobe 24px, 600ms, `cubic-bezier(.16,1,.3,1)` |
| 300 → 1500ms | a linha se desenha, `scaleX` 0→1, linear |
| 300, 700, 1100, 1500ms | o pino acende quando a linha chega nele |

A cada pino aceso: o pino fica `--accent` com uma onda de pulso (escala
1→2,2, transparência .5→0, 500ms); o fecho do título daquele cartão muda de
branco para amarelo em 320ms; um brilho quente aparece no canto
(`radial-gradient(120% 80% at 0 0, rgba(136,103,73,.16), transparent 60%)`,
0→1 em 600ms). Total: ~2,1s.

**Abaixo de 1100px:** sem linha ligando. Cada cartão dispara sozinho com 50%
visível: entra, pino acende 250ms depois, fecho fica amarelo em 320ms.

**Hover** (só com `(hover:hover) and (pointer:fine)`): uma luz `--ember` segue
o cursor (`radial-gradient` de 280px, `rgba(136,103,73,.22)`, posição em
`--mx`/`--my`); o cartão sobe 4px em 240ms; borda vira `rgba(255,204,0,.28)`.
No toque, nada se mexe.

**Tamanhos:** título `clamp(1.5rem, 1.2rem + .6vw, 1.75rem)`; texto 16px;
rótulo 11px mono; `min-height` 280px. H2 de seção
`clamp(2.25rem, 1.4rem + 2.8vw, 3.5rem)`, abaixo dos 64px do H1.

### QUEM SOMOS

Gatilho: 40% visível, uma vez. O texto sobe 18px em 600ms. As linhas da ficha
entram uma depois da outra, 70ms entre elas, cada uma deslizando 8px para o
lado em 400ms. **Nada de efeito de digitação no CNPJ** — número legal "sendo
digitado" parece truque.

### ONDE ESTAMOS

Gatilho: 40% visível, uma vez.

- O trecho percorrido da linha se desenha em amarelo, da 1ª estação até HOJE, 900ms.
- O pino HOJE desce 8px em 300ms.
- Depois dele, o trecho futuro aparece **tracejado** em `rgba(255,255,255,.2)`,
  400ms, **sem se desenhar**: o futuro ainda não foi percorrido.
- O texto de cada estação aparece quando a linha passa por ela.
- O pino HOJE pulsa suave (anel de 2,4s, transparência até .35). É a única
  animação contínua da página, e significa "estamos aqui agora".
- Em mobile a linha fica vertical, à esquerda.

### Carrossel

Usa o `currentIndex` e o `INTERVAL_MS = 5500` que já existem no `main.js`.

- **Slide ativo:** imagem de `scale(1.06)` a `scale(1)` em 5500ms, linear,
  reiniciando a cada troca. Legenda em sequência: olho, título, texto, cada um
  subindo 10px em 400ms, 70ms entre eles.
- **Inativos** (só quando cabe mais de um na tela): `brightness(.72)
  saturate(.85)` e legenda com transparência .7, transição 500ms.
- **Bolinhas viram barra de tempo:** a ativa vira pílula de 32×4px que se
  enche de amarelo (`scaleX` 0→1 em 5500ms, linear). O botão mantém 44×44 para
  o toque. A barra congela (`animation-play-state: paused`) junto com a pausa
  manual, o hover, o foco e a aba escondida.
- **Movimento reduzido:** sem zoom e sem sequência; a pílula ativa já cheia.
- **Título do slide:** `clamp(1.25rem, 1rem + .8vw, 1.6rem)`, fecho em 800
  amarelo, **sem itálico**.

---

## 6. Confiança sem números inventados

O que **usar**:

1. **Empresa verificável perto da proposta** — CNPJ e Innovare Code na ficha
   do QUEM SOMOS, não só no rodapé. Qualquer pessoa consegue consultar.
2. **Canal humano clicável** — WhatsApp com link direto em dois pontos.
3. **Franqueza sobre o que não existe** — "EM CONSTRUÇÃO" e "ainda não há
   data", ditos antes que o visitante desconfie.
4. **Promessa com prazo verificável** — as regras saem antes de o cadastro
   abrir; é algo que o próprio visitante pode cobrar.
5. **Detalhe local que só quem é daqui escreve** (Redinha, Ponta Negra), em
   vez de "melhor app da região".
6. **Coerência** — cada promessa aparece uma vez só, no bloco certo.
7. **O aviso de que as fotos são geradas por computador fica.** Se o visitante
   achar que são funcionários reais e depois descobrir que não, a confiança cai
   mais do que se soubesse desde o início.

O que **nunca usar**: depoimentos, contadores ("+500 motoristas"), selos de
imprensa, "em breve" com data, qualquer percentual de taxa.

---

## 7. Decisões do dono, 20/11/2026

Perguntadas porque virariam afirmação pública e não dava para inventar:

- **Suporte:** *"Sim, pessoa e daqui."* O site pode afirmar que quem atende o
  WhatsApp é uma pessoa, de Natal. É o argumento de confiança mais forte que
  temos, porque nenhum concorrente grande pode copiar.
- **Taxa e repasse:** *"Mantenha como está."* "Taxa menor" e "repasse mais
  rápido" continuam, **sem número**, sempre apontando que as regras saem por
  escrito antes de o cadastro abrir. Isto resolve a dúvida levantada pela
  memória de 18/11: o que estava proibido era prometer **percentuais**, não o
  comparativo.

## 8. O que ainda não foi conferido

Nada desta direção foi medido no navegador. Os tamanhos vêm da leitura do CSS,
e o defeito do slide 1 foi visto abrindo o JPG. Quem implementar mede.
