# Conteúdo do site — www.vuumbora.com.br

Escrito em 18/11/2026 por Apolo. Substitui todo o texto atual de `apps/site/src`.

## Como ler este documento

- O texto entre aspas ou em bloco de citação é o **texto final**, pronto para colar.
  Tudo o que estiver fora disso é nota para quem implementa.
- **[confirmar]** marca uma frase que descreve algo **já desenhado no protótipo**, mas
  que o dono ainda pode mudar (ex.: o motorista ver o destino antes de aceitar). Se o
  dono disser "não", a frase sai e entra a versão indicada ao lado.
- **[compromisso]** marca uma frase em que a empresa se compromete com uma
  **forma de comunicar** (ex.: "a taxa vai estar publicada antes do cadastro"). Não
  promete valor nem prazo, mas é uma promessa. Precisa de um "sim" do dono antes de ir
  ao ar. Sem o "sim", use a versão alternativa indicada.
- Nada aqui afirma taxa, prazo de repasse, preço, suporte, verificação de motorista,
  cidade ou data. Onde o assunto aparece, aparece como "ainda não decidido", porque é
  o que ele é.

### O princípio que amarra o site inteiro

Sem usuários, números ou depoimentos, o VuumBora não pode competir em prova social.
Pode competir em **franqueza**. O público, principalmente o motorista, está cansado de
app que promete e depois muda a regra. Um site que diz com todas as letras "isto está
pronto, isto estamos construindo, isto ainda não decidimos" se destaca exatamente por
isso. A franqueza é o argumento, não uma desculpa.

A consequência prática: **toda frase de "ainda não" vem acompanhada do que a pessoa vai
ganhar quando deixar de ser "ainda não"**, ou de algo útil que já existe. "Ainda não
definimos" sozinho soa a abandono; "ainda não definimos, e quando definirmos vai estar
aqui, por escrito" soa a respeito.

---

## 0. Metadados e navegação

**Title (aba do navegador e Google):**
> VuumBora — app de corrida para passageiros e motoristas (em construção)

**Description (Google e compartilhamento):**
> O VuumBora é um novo app de mobilidade urbana, em construção. Veja o que já está
> pronto, o que estamos construindo e o que ainda vamos decidir, para quem pede corrida
> e para quem dirige.

Nota: `SITE_DESCRIPTION` em `apps/site/src/lib/site.ts` recebe este texto. O Google
corta por volta de 155 caracteres; o trecho essencial está no começo.

**Menu (topo e rodapé), nesta ordem:**
- Para passageiros → `#passageiro`
- Para motoristas → `#motorista`
- O que vamos oferecer → `#servicos`
- Onde estamos → `#transparencia`
- Perguntas → `#perguntas`

---

## 1. Topo (hero)

### Avaliação da frase atual

"Sua próxima corrida vai ter a cara da sua cidade" **não serve** como frase principal:

1. **Não diz o que é.** Pode ser app de corrida, de turismo, de entrega. Quem chega pelo
   link tem três segundos e sai sem saber.
2. **Fala só com o passageiro.** O público que o dono mais precisa atrair, o motorista,
   não se reconhece nela.
3. **Promete algo que não dá para sustentar.** "A cara da sua cidade" pede um vínculo
   local, e a cidade de lançamento ainda não foi decidida (item 16 de
   `decisoes-do-dono.md`).

A ideia de identidade local é boa e deve voltar **quando houver cidade definida**, numa
campanha de lançamento ("O VuumBora chegou em Natal"). Para a vitrine geral, não.

### Texto proposto

**Selo acima do título:**
> App de mobilidade urbana · em construção

**Título (H1):**
> Antes de confirmar, você já sabe. Antes de aceitar, também.

**Subtítulo:**
> O VuumBora é um novo app de corrida para quem pede e para quem dirige. Quem pede vê o
> preço estimado e o tempo de espera antes de confirmar, e o nome do motorista, o carro
> e a placa antes de embarcar. Quem dirige vê o destino, a distância e o valor estimado
> antes de aceitar. **[confirmar]**

**Linha de honestidade (texto menor, logo abaixo):**
> Ainda não estamos nas lojas. Este site mostra o que já está pronto, o que estamos
> construindo e o que ainda vamos decidir.

**Ações:**
- Primária (link de âncora, funciona hoje): **"Sou passageiro"** → `#passageiro`
- Secundária (link de âncora, funciona hoje): **"Quero dirigir"** → `#motorista`
- Abaixo, os selos desabilitados das lojas, como já existem: "Em breve na Google Play" /
  "Em breve na App Store".

Por que âncoras como ação principal: hoje não existe nada para baixar nem lista para
entrar. Botão desabilitado como ação principal é um beco sem saída. Duas âncoras que
separam o público dão à pessoa algo útil para fazer **agora**, e já dizem, só pelo
rótulo, que o app é para os dois lados.

**Se o dono não confirmar** que o motorista vê o destino antes de aceitar, o subtítulo
termina em: "Quem dirige vê a distância e o valor estimado antes de aceitar."

### Alternativas de título (caso o dono prefira outra direção)

| Título | Quando usar | Cuidado |
|---|---|---|
| "O app de corrida que joga limpo com quem pede e com quem dirige." | Se o dono assumir o compromisso de publicar as regras (ver seção 8) | "Joga limpo" é promessa de conduta. Sem regra publicada, soa vazio |
| "Corrida de app, com as regras na mesa." | Mesma condição acima | Idem |
| "Um app de corrida feito para os dois lados do carro." | Versão mais neutra, sem promessa nenhuma | Diz para quem é, mas não diz o benefício |

Recomendo o título principal proposto: é o único que afirma um benefício concreto e
**verdadeiro hoje** (as telas existem e mostram essas informações).

---

## 2. Para o passageiro — `#passageiro`

**Selo:** Para quem pede corrida

**Título (H2):**
> Você não devia entrar num carro com dúvida.

**Texto de apoio:**
> Pedir corrida hoje ainda tem muita incerteza: quanto tempo falta, quanto vai custar,
> se aquele é mesmo o seu carro. Desenhamos o VuumBora para responder essas perguntas
> antes que você precise fazê-las.

### As quatro dores, e o que o VuumBora faz

Formato sugerido: cartão com a dor em cima (texto menor, tom de reconhecimento) e a
resposta embaixo (título e descrição).

**Cartão 1**
- Dor: "Cinco minutos que viram quinze."
- Título: **Tempo de espera antes de confirmar**
- Texto: "Você vê a estimativa de chegada de cada opção antes de pedir. Depois de
  confirmar, acompanha o motorista pelo mapa até o ponto de embarque."

**Cartão 2**
- Dor: "Um preço na tela, outro no fim."
- Título: **Preço estimado antes de você decidir**
- Texto: "Cada opção mostra o valor estimado antes de você confirmar. Como a tarifa vai
  ser calculada ainda está sendo definida. Quando estiver, a regra vai estar escrita
  aqui, em português claro. **[compromisso]**"
- Sem o "sim" do dono, o texto termina em "...antes de você confirmar. Ao fim da
  corrida, o recibo mostra o detalhamento do valor."

**Cartão 3**
- Dor: "Aquele carro prata é o meu?"
- Título: **Motorista, carro e placa na tela**
- Texto: "Assim que um motorista aceita, o app mostra o nome dele, o modelo do carro e a
  placa. Você confere antes de abrir a porta."

**Cartão 4**
- Dor: "Cancelaram. De novo."
- Título: **Regras de cancelamento que você conhece antes**
- Texto: "Ainda estamos definindo as regras de cancelamento, para os dois lados. O que
  já decidimos: elas vão estar visíveis no app antes de você confirmar a corrida, e não
  escondidas nos termos. **[compromisso]**"
- Sem o "sim" do dono, use: "As regras de cancelamento ainda estão sendo definidas,
  para o passageiro e para o motorista. Esta página vai ser atualizada assim que
  estiverem prontas."

Nota para quem implementa: o cartão 4 é o único que **não tem nada pronto** para
mostrar. Não esconda; ele mostra que conhecemos a dor. Mas é melhor colocá-lo por último.

### Como funciona a corrida (passo a passo, logo abaixo dos cartões)

**Subtítulo:** Do pedido ao destino

1. **Diga para onde vai.** "Digite o destino ou escolha um lugar salvo."
2. **Compare e confirme.** "Veja as opções com tempo de espera e preço estimado, escolha
   a forma de pagamento e confirme."
3. **Confira quem vem.** "Nome do motorista, carro e placa aparecem assim que alguém
   aceita."
4. **Acompanhe e chegue.** "Siga o trajeto pelo mapa. No fim, você recebe o recibo e
   avalia a corrida."

**Legenda sob as telas do app (obrigatória se houver print):**
> Telas do app em construção. Nomes, valores, endereços e veículos são de exemplo.

---

## 3. Para o motorista — `#motorista`

Nota de tom: o motorista já ouviu promessa de todo app. A estratégia aqui é inverter:
**começar pelo que ele quer saber e assumir que ainda não temos a resposta**, em vez de
fingir que temos. Ele trabalha nisso; tratamos como profissional, não como "parceiro"
em tom de folheto. Evitar "seja seu próprio chefe", "renda extra", "liberdade" e
qualquer frase que ele já viu em outro app.

**Selo:** Para quem dirige

**Título (H2):**
> Você devia saber as regras antes de ligar o carro.

**Texto de apoio:**
> Quanto fica com você, quando o dinheiro cai, como o valor da corrida é calculado. Isso
> não devia ser descoberto depois do cadastro. Ainda estamos definindo essas regras, e
> vamos publicá-las aqui, por escrito, antes de abrir o cadastro de motoristas.
> **[compromisso]**

Sem o "sim" do dono, a última frase vira: "Ainda estamos definindo essas regras. Assim
que estiverem prontas, elas aparecem aqui."

### O que quem dirige reclama, e onde estamos em cada ponto

Formato sugerido: quatro cartões lado a lado. Cada um com a pergunta em cima, a
resposta honesta e um rótulo de situação ("Em definição"). O rótulo é texto + ícone,
não só cor.

**Cartão 1 — "Quanto a plataforma fica?"**
- Situação: Em definição
- Texto: "A taxa do VuumBora ainda não foi definida. Quando for, vai estar nesta página
  com o número, sem asterisco e sem 'a partir de'. **[compromisso]**"

**Cartão 2 — "Quando eu recebo?"**
- Situação: Em definição
- Texto: "Prazo e frequência do repasse dependem do parceiro de pagamento, que estamos
  escolhendo agora. Sabemos que isso pesa no seu mês, e vamos tratar como prioridade, não
  como detalhe."

**Cartão 3 — "Se der problema, alguém responde?"**
- Situação: Em definição
- Texto: "Ainda não temos canal de atendimento. E não vamos colocar botão de suporte no
  app sem ter gente do outro lado para responder."
- Nota: esta frase é a mais forte do site para o motorista, porque nomeia exatamente o
  que ele já viveu. É também um compromisso negativo (não fazer algo), fácil de cumprir.
  Mesmo assim, confirmar com o dono.

**Cartão 4 — "Como chegaram nesse valor?"**
- Situação: Em definição
- Texto: "O cálculo da tarifa ainda está sendo desenhado. O princípio que estamos
  seguindo: você deve conseguir entender de onde veio o valor de cada corrida.
  **[compromisso]**"

### O que já está desenhado no app do motorista

**Subtítulo:** O que você já pode ver nas telas

- **Você decide quando trabalhar.** "Um botão liga e desliga o recebimento de corridas.
  Ficou offline, não chega pedido."
- **Informação antes de aceitar.** "Cada pedido mostra o ponto de embarque, o destino, a
  distância e o valor estimado. **[confirmar]** Você tem alguns segundos para aceitar ou
  recusar."
- **Avaliação dos dois lados.** "Ao final da corrida, o passageiro avalia você, e você
  avalia o passageiro." **[confirmar]**
- Nota: só a avaliação **do passageiro** existe no protótipo (`apps/passenger/app/(app)/concluida.tsx`).
  O motorista avaliar o passageiro é padrão do setor, mas não foi desenhado. Sem o "sim"
  do dono, este item sai inteiro.

Sem confirmação do destino visível, o segundo item vira: "Cada pedido mostra o ponto de
embarque, a distância e o valor estimado."

Nota: **não escrever** que recusar não tem consequência. Isso ainda não foi decidido.

### Chamada para o motorista (ver seção 7)

---

## 4. O que vamos oferecer — `#servicos`

**Selo:** Serviços

**Título (H2):**
> Começar pelo essencial, e fazer bem feito.

**Texto de apoio:**
> O VuumBora começa com uma coisa: levar você de um ponto a outro da cidade, com
> informação clara do pedido ao destino. O resto vem depois, quando estiver pronto.

### Bloco "No lançamento" (benefício, não recurso)

| Título | Texto |
|---|---|
| **Corrida na hora, para onde você precisar** | "Peça pelo app e acompanhe do pedido até o destino." |
| **Opções para cada momento** | "Escolha entre categorias, da mais em conta à mais confortável. Nomes e preços ainda estão sendo definidos." |
| **Você sabe quem vem te buscar** | "Nome do motorista, carro e placa na tela antes do embarque." |
| **Recibo de cada corrida** | "Ao final, o app mostra o detalhamento do valor e guarda suas viagens no histórico." |
| **Avaliação depois de cada viagem** | "Ao fim de cada corrida, você avalia a viagem. É assim que a experiência melhora." |

Formas de pagamento **ficam fora** desta lista até o provedor ser escolhido (item 3 de
`decisoes-do-dono.md`). O protótipo mostra Pix, cartão e dinheiro, mas isso é tela, não
contrato.

### Bloco "Estamos construindo" (opcional, em tom menor)

> Ainda em desenho, sem data: compartilhar a viagem em tempo real com alguém de
> confiança e ligar ou mandar mensagem para o motorista sem trocar número pessoal.

Recomendação: **só publicar este bloco se o dono aprovar.** Compartilhar viagem e
mascaramento de número aparecem no protótipo, mas nenhum dos dois funciona e o
mascaramento tem custo por chamada (item 11). Se houver dúvida, deixe de fora: um site
mais curto e verdadeiro vale mais do que uma lista longa.

**O que não entra de jeito nenhum:** carteira com saldo, transferência entre usuários,
indique e ganhe, agendamento, saque. Todos dependem de decisões que o próprio documento
de decisões recomenda adiar.

---

## 5. Credibilidade — `#transparencia`

A seção que substitui a prova social. Sem números, depoimentos ou logos de imprensa, a
credibilidade vem de três coisas: **mostrar o produto, mostrar o estado real e dizer
quem está por trás.**

**Selo:** Onde estamos

**Título (H2):**
> Sem número inventado, sem depoimento de mentira.

**Texto de apoio:**
> O VuumBora ainda não fez nenhuma corrida. Por isso você não vai encontrar aqui "mil
> motoristas" ou "nota 4,9". Quando tivermos números, eles vão aparecer. Até lá,
> preferimos mostrar exatamente em que ponto estamos.

### Três colunas de estado

Formato: três colunas com rótulo em texto e ícone, nunca só por cor.

**Já existe**
- "O app do passageiro: pedir corrida, escolher a categoria e confirmar."
- "O app do motorista: ficar online e receber pedidos de corrida."
- "A identidade visual e o sistema de design dos dois apps."

**Estamos construindo**
- "O acompanhamento da corrida, do embarque ao destino."
- "Cadastro, perfil e histórico de viagens."
- "O servidor que conecta passageiro e motorista de verdade."

**Ainda vamos decidir**
- "Tarifa, taxa da plataforma e prazo de repasse."
- "Cidade e data de lançamento."
- "Canal de atendimento e regras de cancelamento."

Nota para quem implementa: as colunas "Já existe" e "Estamos construindo" precisam ser
revisadas a cada marco. O conteúdo acima corresponde a `docs/escopo-telas.md` em
18/11/2026. **Se este bloco ficar desatualizado, ele deixa de ser credibilidade e vira o
contrário.** Recomendo que o Atlas inclua "atualizar `#transparencia`" no fechamento de
cada marco.

### Mostrar o produto

Uma faixa com 3 ou 4 telas reais do app (prints de `docs/prints`, com o acabamento
premium), sempre com a legenda:
> Telas reais do app em construção. Nomes, valores, endereços e veículos são de exemplo.

A legenda não enfraquece a imagem; ela prova que a imagem é real. Um mockup sem legenda
parece propaganda; com legenda, parece prestação de contas.

### Quem está por trás (aguarda o dono)

> O VuumBora é desenvolvido por **[nome da empresa]**, de **[cidade]**.
> **[CNPJ]**

Este é o maior ganho de credibilidade disponível hoje, e não depende de nenhuma decisão
de produto. Não publicar com espaço em branco: até o dono fornecer os dados, o bloco
fica fora do site.

---

## 6. Perguntas frequentes — `#perguntas`

Critério de escolha: **as perguntas que travam a decisão**, não as que deixam o site
bonito. Divididas por público para cada um achar a sua sem ler as do outro.

**Título (H2):**
> As perguntas que você faria antes de confiar num app novo.

### Para quem pede corrida

**Já posso usar o VuumBora?**
> Ainda não. O app está em construção e não foi publicado nas lojas. Quando for, os
> botões do topo desta página passam a levar direto para a Google Play e a App Store.

**Em que cidade vai funcionar, e quando?**
> Ainda não decidimos a cidade de lançamento nem a data. Não vamos anunciar uma data que
> não temos certeza de cumprir. Quando as duas estiverem definidas, é aqui que você vai
> ver primeiro.

**Quanto vai custar uma corrida?**
> Ainda não definimos a tarifa. O que já está desenhado: antes de confirmar, você vê o
> preço estimado de cada opção, e no fim recebe o recibo com o detalhamento.

**Como vou saber que o motorista é de confiança?**
> Ainda não abrimos o cadastro de motoristas, justamente porque o processo de análise de
> documentos ainda está sendo definido. Quando abrirmos, vamos explicar aqui quais
> documentos pedimos e como eles são analisados. Durante a corrida, você vê nome,
> carro e placa antes de embarcar, e pode avaliar o motorista no fim.

**E se acontecer um problema durante a corrida?**
> Ainda estamos definindo o canal de atendimento: por onde, em que horário e com quem.
> Não vamos anunciar suporte antes de ter alguém para atender. Isso vai estar claro
> antes do lançamento.

**O que vocês fazem com os meus dados?**
> A Política de Privacidade está sendo escrita e vai ser publicada antes do app. Ela vai
> dizer quais dados coletamos, para que usamos e por quanto tempo guardamos. Hoje este
> site não coleta nenhum dado seu.

Nota: "hoje este site não coleta nenhum dado seu" precisa ser **verificado** antes de
publicar (analytics, fontes de terceiros, logs do servidor no Easypanel). Se houver
qualquer coleta, a frase sai.

### Para quem dirige

**Quanto o VuumBora vai cobrar de taxa?**
> Ainda não está definido. Vamos publicar o valor nesta página antes de abrir o
> cadastro, para que você decida com o número na mão. **[compromisso]**

**Em quanto tempo eu recebo pelas corridas?**
> Depende do parceiro de pagamento, que ainda estamos escolhendo. Prazo, frequência e se
> haverá taxa para sacar vão estar escritos aqui antes de você se cadastrar.
> **[compromisso]**

**Que carro eu preciso ter?**
> Os requisitos de veículo, como ano e tipo, ainda estão sendo definidos junto com as
> categorias de corrida. Eles também dependem das regras da cidade onde vamos começar,
> já que algumas prefeituras têm exigências próprias.

**Quando abre o cadastro de motoristas?**
> Ainda não tem data. O cadastro só vai abrir quando taxa, repasse e análise de
> documentos estiverem definidos. Não queremos que você se cadastre sem saber em que
> está entrando.

**Por que confiar num app que ainda nem existe?**
> Você não precisa confiar agora. Precisa só acompanhar. Estamos mostrando o que já está
> pronto, o que falta e o que ainda vamos decidir. Quando o cadastro abrir, as regras
> vão estar aqui para você comparar com o app que usa hoje.

### Perguntas que **deixei de fora**, e por quê

- "Posso dirigir no VuumBora e em outro app ao mesmo tempo?": a resposta honesta hoje
  seria "não decidimos", e uma não-resposta numa dúvida tão direta irrita mais do que
  ajuda. Entra quando o dono decidir (seção 8).
- "Tem tarifa dinâmica?": o protótipo do motorista tem um selo de alta demanda. Responder
  "não" seria falso; responder "sim" seria decidir pelo dono. Entra com o item 7.
- "Quais formas de pagamento?": entra com o item 3.

---

## 7. Chamadas de ação

Restrição real: o site é estático, o app não está nas lojas, o cadastro está fechado e
**não existe nenhum canal para receber contato** (nem lista de espera, nem e-mail, nem
WhatsApp). Toda chamada abaixo respeita isso.

### Versão A: hoje, sem canal de contato

| Lugar | Texto do botão | Leva para | Tipo |
|---|---|---|---|
| Topo, primária | **Sou passageiro** | `#passageiro` | âncora |
| Topo, secundária | **Quero dirigir** | `#motorista` | âncora |
| Topo, selos | "Em breve na" / **Google Play** e **App Store** | nada | desabilitado (já existe) |
| Fim da seção passageiro | **Ver o que vamos oferecer** | `#servicos` | âncora |
| Fim da seção motorista | **Ler as perguntas de quem dirige** | `#perguntas` (bloco do motorista) | âncora |
| Fim da seção motorista | "Cadastro de motoristas" / **Ainda fechado** | nada | desabilitado |
| Fim da página | **Voltar ao topo** | `#topo` | âncora |

Texto sob o botão desabilitado do motorista:
> O cadastro abre depois que taxa, repasse e análise de documentos estiverem definidos.
> Antes disso, as regras aparecem aqui.

Mudança em relação ao atual: o botão "Em breve" do motorista vira "Ainda fechado". "Em
breve" sugere dias; "ainda fechado" é exato, e a frase abaixo explica o motivo, o que
transforma uma negativa em argumento.

**Faixa final (antes do rodapé), versão A:**
- Título: "Estamos construindo o VuumBora à vista."
- Texto: "Volte aqui de vez em quando. Cada coisa que sair de 'em definição' para
  'pronto' aparece nesta página primeiro."
- Botões: **Sou passageiro** / **Quero dirigir** (âncoras)

### Versão B: se o dono abrir um canal de lista de espera

Recomendo fortemente: sem canal, cada visita interessada se perde. Para o motorista,
principalmente, a lista de espera é o ativo mais valioso que o site pode gerar antes do
lançamento.

| Público | Botão | Texto de apoio |
|---|---|---|
| Passageiro | **Quero saber quando lançar** | "Avisamos uma vez, quando o app estiver nas lojas da sua cidade. Nada além disso." |
| Motorista | **Quero ser avisado quando abrir o cadastro** | "Você recebe as regras de taxa e repasse assim que forem publicadas, antes de qualquer cadastro." |

As frases "avisamos uma vez" e "nada além disso" são compromissos: só usar se a
operação for cumprir. O formulário precisa de política de privacidade publicada e de
consentimento explícito (LGPD) antes de ir ao ar.

### O que nunca usar

"Baixe agora", "Cadastre-se", "Comece a dirigir", "Ganhe dinheiro hoje", "Peça sua
corrida": todas pressupõem algo que não existe.

---

## 8. O que o dono precisa decidir para o site afirmar mais

Esta é a lista de argumentos que o site **não pode usar hoje**. Cada linha diz o que
destrava e a frase que passaria a ser possível. Os números entre parênteses são os itens
de `docs/decisoes-do-dono.md`; os marcados "novo" não estão lá.

### Os que mais mudam a vitrine para o motorista

| Decisão | Argumento que destrava | Peso |
|---|---|---|
| Taxa da plataforma (7) | "O VuumBora fica com X% de cada corrida. O resto é seu." | **Decisivo.** É a primeira coisa que o motorista procura |
| Prazo e frequência de repasse (3, 6) | "Seu dinheiro cai em X, sem taxa de saque." | **Decisivo.** O documento de decisões já aponta que saque rápido é o argumento dos concorrentes |
| Canal de suporte e horário (11) | "Fale com uma pessoa, das X às Y, por [canal]." | Alto. É a dor mais citada por quem dirige |
| Regra de recusa de corrida (novo) | "Recusar não derruba sua conta." | Alto. Hoje o site evita o assunto |
| Exclusividade (novo) | "Pode dirigir no VuumBora e em outros apps." | Médio. Reduz o risco percebido de experimentar |
| Requisitos de veículo e categorias (13, 16) | "Carro a partir de [ano], [requisitos]." | Médio. Sem isso o motorista não sabe se pode participar |

### Os que mais mudam a vitrine para o passageiro

| Decisão | Argumento que destrava | Peso |
|---|---|---|
| Modelo de tarifa e dinâmica (7) | "Preço fechado antes de você confirmar." (só se for fechado de verdade) | Alto |
| Regras de cancelamento (15) | "Cancele sem custo até X minutos depois de pedir." | Alto |
| Verificação de motoristas (9) | "Todo motorista passa por análise de CNH, documento do veículo e [o que for]." | Alto. Hoje a FAQ precisa dizer que o processo não existe |
| Formas de pagamento (3) | "Pague com Pix, cartão ou dinheiro." | Médio |
| Compartilhar viagem / botão de emergência (novo) | "Compartilhe sua viagem em tempo real com quem você quiser." | Alto em segurança. O protótipo tem o botão "Compartilhar viagem / SOS", mas o SOS exige definir quem atende o chamado. **Não pode ficar só na tela** |
| Mascaramento de número (11) | "Ligue para o motorista sem trocar número pessoal." | Médio |

### Os que mudam a credibilidade do site inteiro

| Decisão | O que destrava | Peso |
|---|---|---|
| Identificação da empresa (novo) | Razão social, CNPJ, cidade e, se o dono quiser, quem são os fundadores. | **O maior ganho disponível hoje.** Não depende de nenhuma decisão de produto |
| Canal de lista de espera (novo) | As chamadas de ação da versão B (seção 7) | Alto. Sem isso o site não captura ninguém |
| Compromisso de publicar as regras antes do cadastro (novo) | Todas as frases marcadas **[compromisso]** neste documento, e o título alternativo "O app de corrida que joga limpo com quem pede e com quem dirige." | Alto. É a espinha da estratégia: transforma "ainda não decidimos" em argumento |
| Manter o destino visível ao motorista antes de aceitar (novo) | Frases marcadas **[confirmar]** no topo e na seção do motorista | Médio. Já está no protótipo; só precisa de um "sim" |
| Cidade e data de lançamento (16) | "Chegando em [cidade] em [mês]." e a volta da ideia "a cara da sua cidade" | Alto, mas só quando a data for firme. Data anunciada e perdida custa mais do que nenhuma data |
| Termos de Uso e Política de Privacidade publicados (novo) | Links reais no rodapé; formulário de lista de espera | Obrigatório antes de qualquer coleta de dado |

**Os três que eu decidiria primeiro, só pelo site:** identificação da empresa, canal de
lista de espera e o compromisso de publicar as regras antes do cadastro. Nenhum dos três
depende de backend, provedor de pagamento ou contador, e juntos mudam o site de "projeto
em construção" para "empresa séria construindo algo".

---

## 9. Rodapé

**Frase da marca (substitui a atual):**
> App de mobilidade urbana em construção. Tudo o que ainda não está decidido está
> marcado como tal nesta página.

**Legal:** manter como está ("Em elaboração — ainda não publicados"), já está correto.

**Contato, versão A:**
> Ainda não temos canal de atendimento. Quando tivermos, ele aparece aqui, e não antes.

**Linha final:**
> © [ano] VuumBora. Projeto em construção.

---

## 10. Glossário de tom (para quem for escrever o próximo texto)

| Use | Evite | Por quê |
|---|---|---|
| "em construção", "ainda vamos decidir", "em definição" | "em breve" sem contexto | "Em breve" sugere dias e, repetido, vira desculpa |
| "quem dirige", "motorista" | "parceiro", "colaborador" | O motorista sabe que não é sócio. Chamá-lo assim soa a folheto |
| "preço estimado" | "preço justo", "preço fechado", "o melhor preço" | Os três são promessas que a tarifa não definida não sustenta |
| "você vê", "você confere" | "garantimos", "100% seguro" | Descrever o que a tela mostra é verificável; garantia não é |
| frases curtas, verbo no início | "revolucionar", "experiência única", "a mobilidade do futuro" | Jargão vazio é exatamente o que este site existe para não ser |
