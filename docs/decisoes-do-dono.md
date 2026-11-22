# Decisões que dependem de você

Levantado em 18/11/2026. Nenhuma destas é dificuldade técnica — são escolhas de
produto, de dinheiro ou de responsabilidade legal. Eu posso recomendar; a
decisão é sua, porque é você quem assume a consequência.

**Como ler:** 🔴 trava trabalho agora · 🟡 trava quando chegarmos na tela ·
🟢 dá para decidir perto do lançamento.

---

## Resumo

| # | Decisão | Urgência | O que trava |
|---|---|---|---|
| 1 | SDK de mapa | 🔴 | Todas as telas com mapa (7 das 20) |
| 2 | Backend: onde roda e quem constrói | 🔴 | Tudo que não for tela |
| 3 | Provedor de pagamento | 🟡 | Cobrar o passageiro |
| 4 | Carteira com saldo | 🟡 | Tela de carteira |
| 5 | Transferir saldo entre usuários | 🟡 | Botão "Transferir" da carteira |
| 6 | Saque do motorista | 🟡 | Tela de ganhos |
| 7 | Tarifa, taxa da plataforma e repasse | 🔴 | Qualquer preço real |
| 8 | Login com Google e Apple | 🟡 | Telas de login e cadastro |
| 9 | Verificação de documentos do motorista | 🟡 | Tela de documentos e o "ficar online" |
| 10 | Navegação passo a passo | 🟡 | Tela de navegação do motorista |
| 11 | Canal de suporte | 🟡 | Tela de suporte e os botões de contato |
| 12 | Indique e ganhe | 🟢 | Bloco da home |
| 13 | Categorias: nomes e preços | 🟡 | Já implementado com valores fabricados |
| 14 | Agendamento de corrida | 🟢 | Atalho "Agendar" |
| 15 | Regras de cancelamento | 🟡 | Botões de cancelar que já existem |
| 16 | Cidade de lançamento | 🟡 | Mapa, tarifa e exigências municipais |
| 17 | Contas de desenvolvedor | 🟢 | Publicar nas lojas |

---

## 🔴 1. SDK de mapa

**O que é:** qual serviço desenha o mapa, calcula rota e converte endereço em
coordenada. Hoje o mapa das nossas telas é um desenho estático.

**Opções principais:** Google Maps (mais completo e mais caro, cobrança por
chamada com cota mensal de cortesia) e Mapbox (mais barato em escala, mais
customizável visualmente, cobertura de ruas um pouco inferior no Brasil).

**O que pesa aqui além do preço:** o visual da referência premium pede um mapa
escuro estilizado. O Mapbox permite controlar o estilo com muito mais liberdade;
o Google é mais engessado. Ou seja, essa decisão **também é estética**.

**Recomendação:** Mapbox para o protótipo, pelo controle visual e pelo custo
previsível; reavaliar na véspera do lançamento, quando houver volume estimado.

**Atenção:** os dois exigem conta com cartão cadastrado no seu nome. **Não vou
criar conta nem cadastrar meio de pagamento por você** — isso é seu, sempre.

## 🔴 2. Backend: onde roda e quem constrói

**O que é:** hoje não existe servidor nenhum. Toda a inteligência está no
celular, simulada. Sem backend não há conta de usuário, corrida de verdade,
pagamento, histórico nem comunicação entre passageiro e motorista.

**O que precisa ser decidido:** se construímos aqui (a equipe tem Vega e Cronos
para isso) ou se você já tem fornecedor; e onde hospeda.

**Recomendação:** começar pelo contrato de API — a Nova já deixou as interfaces
desenhadas. Com o contrato definido, as telas trocam dado falso por dado real
sem reescrita, e o backend pode ser construído em paralelo.

## 🟡 3. Provedor de pagamento

**O que é:** quem processa Pix e cartão. No Brasil, os caminhos usuais são
Mercado Pago, Pagar.me, Asaas e Stripe, entre outros.

**O que pesa:** taxa por transação, prazo de repasse, suporte a Pix,
possibilidade de **split** (dividir automaticamente entre plataforma e
motorista) e exigências de cadastro da sua empresa.

**O split é o ponto central.** Sem ele, o dinheiro entra todo na sua conta e
você precisa repassar manualmente a cada motorista — o que vira operação
financeira pesada e levanta a questão regulatória do item 6.

**Recomendação:** escolher um provedor **com split nativo** desde o começo, e
validar as regras com um contador antes de operar.

## 🟡 4. Carteira com saldo

**O que é:** a tela da referência mostra "Saldo VuumBora R$ 35,00" e "Adicionar
saldo". Isso significa o usuário deixar dinheiro guardado com você.

**O que isso implica:** dinheiro de cliente parado na sua empresa tem tratamento
contábil próprio, não é receita; precisa de regra para devolução, expiração e o
que acontece se o app encerrar. Dependendo do desenho, atrai regulação do Banco
Central.

**Alternativa mais leve:** nada de saldo — cada corrida é cobrada na hora, no
Pix ou no cartão. Simplifica muito e atende todos os casos da referência,
exceto a tela da carteira em si.

**Recomendação:** começar **sem saldo** e revisitar depois, com contador. A tela
pode ser desenhada e ficar engavetada.

## 🟡 5. Transferir saldo entre usuários

**O que é:** o botão "Transferir saldo" da tela de carteira.

**Por que é a mais pesada da lista:** permitir que uma pessoa mande dinheiro a
outra dentro do seu app é, na prática, oferecer serviço de pagamento, com
obrigações de prevenção a fraude e lavagem. É um salto de responsabilidade
muito maior que todo o resto.

**Recomendação:** **não fazer**, a menos que seja central ao seu negócio. O
ganho para o usuário é pequeno perto do custo.

## 🟡 6. Saque do motorista

**O que é:** "Saldo disponível R$ 236,70 · Solicitar saque" na tela de ganhos.

**O que precisa ser decidido:** com que frequência o motorista pode sacar
(diário, semanal), se há taxa, qual o valor mínimo, e em quanto tempo o dinheiro
cai. Isso afeta diretamente a atratividade do app para motoristas — saque rápido
é um dos principais argumentos de concorrentes.

**Depende de:** item 3, porque é o provedor que executa o repasse.

## 🔴 7. Tarifa, taxa da plataforma e repasse

**O que é:** como o preço é calculado (bandeira, por km, por minuto, dinâmica),
quanto a plataforma retém e quanto vai para o motorista.

**Por que é urgente mesmo sem backend:** é o coração do negócio e define a
estrutura de dados. Todo valor hoje no app é fabricado e está marcado como tal.

**Precisa cobrir:** preço mínimo, tarifa por km e por minuto, taxa de
cancelamento, dinâmica em horário de pico, e o percentual da plataforma.

## 🟡 8. Login com Google e Apple

**O que é:** os botões "Continuar com Google / Apple" da tela de cadastro.

**O que implica:** conta de desenvolvedor nos dois. E uma regra importante: **a
Apple obriga oferecer o login dela se o app oferecer o do Google** — não dá para
ter só o do Google num app iOS.

**Recomendação:** ter também o cadastro por celular e senha, que é o que a maior
parte do público brasileiro usa.

## 🟡 9. Verificação de documentos do motorista

**O que é:** a tela mostra CNH, CRLV, seguro e vistoria com selo "Aprovado".
Alguém precisa aprovar.

**O que decidir:** quem analisa (você, uma equipe, um serviço automatizado),
prazo de resposta, critério de recusa, e **como esses documentos são guardados**
— são dados pessoais sensíveis, com obrigações de LGPD quanto a acesso,
retenção e descarte.

**Também é aqui** que entram as exigências municipais para transporte
remunerado, que variam por cidade (item 16).

## 🟡 10. Navegação passo a passo

**O que é:** a tela "Navegação (GPS)" do motorista, com a instrução "300 m —
vire à direita".

**As duas saídas:** navegação dentro do app (licença à parte, mais cara, mas
experiência integrada) ou abrir o Waze/Google Maps instalado no celular do
motorista (gratuito, mas joga o motorista para fora do app).

**Recomendação:** abrir o app externo no começo. É o que a maioria dos
concorrentes fez nos primeiros anos, e economiza bastante.

## 🟡 11. Canal de suporte

**O que é:** "Falar com o Suporte · Atendimento via chat", e os botões de ligar
e conversar com o motorista durante a corrida.

**O que decidir:** se existe atendimento humano, em que horário, e por onde
(chat no app, WhatsApp, e-mail). Hoje a referência promete "suporte 24h" — isso
é compromisso com o usuário, não enfeite de tela.

**Sobre ligar para o motorista:** o padrão do setor é **mascarar o número** dos
dois lados, para ninguém ficar com o telefone pessoal do outro depois da
corrida. Isso é um serviço à parte, com custo por chamada.

## 🟢 12. Indique e ganhe

**O que é:** o bloco colorido da home, "Convide amigos e ganhe créditos".

**O que decidir:** quanto ganha quem indica e quem é indicado, quando o crédito
é liberado, validade, limite por pessoa, e o que acontece se a corrida do
indicado for cancelada. Programa de indicação sem regra clara é porta de fraude.

**Depende de:** item 4, porque "crédito" pressupõe carteira.

## 🟡 13. Categorias: nomes e preços

**O que é:** já apareceram **três** nomes diferentes nas referências —
"Vuum Econômico / Comfort / Plus", "VuumBora / Comfort / Premium" e
"VuumBora Econômico / Comfort / Premium" — com preços diferentes em cada.

**O que decidir:** o nome definitivo de cada categoria, quantas existem, e o que
diferencia uma da outra (idade do carro, ar-condicionado, número de lugares,
avaliação mínima do motorista).

**Hoje:** o app usa os nomes da primeira referência, com todos os valores
marcados como fabricados.

## 🟢 14. Agendamento de corrida

**O que é:** o atalho "Agendar" da home.

**O que implica:** garantir que haverá motorista disponível na hora marcada é
difícil — é preciso decidir o que acontece quando ninguém aceita a corrida
agendada, e com quanta antecedência o passageiro pode marcar.

**Recomendação:** deixar para depois do lançamento.

## 🟡 15. Regras de cancelamento

**O que é:** os botões "Cancelar corrida" que já existem nas telas.

**O que decidir:** até quando o passageiro pode cancelar sem custo, se há multa
depois que o motorista já está a caminho, quanto dessa multa vai para o
motorista, e o que acontece quando é o **motorista** que cancela.

**Por que importa:** é a regra que mais gera reclamação em apps de corrida, dos
dois lados.

## 🟡 16. Cidade de lançamento

**O que é:** onde o app começa a operar. As referências citam Natal e São Paulo.

**O que isso define:** a cobertura de mapa a contratar, a tarifa (que varia
muito por cidade), e **as exigências municipais** para transporte remunerado
privado — algumas cidades exigem cadastro do motorista na prefeitura, alvará ou
documentação específica.

## 🟢 17. Contas de desenvolvedor

- **Google Play:** taxa única de cerca de US$ 25.
- **Apple Developer:** cerca de US$ 99 por ano, obrigatória até para instalar no
  seu próprio iPhone fora do simulador.
- **Identificadores de app:** hoje `com.vuumbora.passenger` e
  `com.vuumbora.driver`, provisórios. Depois de publicado, **não dá para mudar**
  sem criar um app novo na loja.

---

## O que eu faria, na ordem

1. **Decida 1 (mapa) e 7 (tarifa) nesta semana.** São os dois que travam
   trabalho agora e que mais mudam o que a equipe constrói.
2. **Decida 2 (backend)** em seguida, pelo contrato de API — isso destrava tudo.
3. **Diga "não" ao 5 (transferir saldo)** e **adie 4, 12 e 14** (carteira,
   indicação, agendamento). São os que mais custam e menos somam no começo.
4. O resto pode ser decidido conforme chegarmos em cada tela.

**Enquanto você decide, não ficamos parados:** há 9 telas na lista que são só
interface e não dependem de nenhuma dessas decisões — perfil, configurações,
histórico, cadastro, login, entre outras. Mais o acabamento premium, que melhora
tudo que já existe.

⚠️ Nada aqui substitui a opinião de um contador e de um advogado nos itens de
dinheiro (3, 4, 5, 6) e de dados pessoais (9). Eu aponto o que costuma ser
exigido; quem valida o seu caso são eles.

---

## Decisões tomadas em 18/11/2026 (tarde)

| # | Decisão | O que foi decidido |
|---|---|---|
| 1 | **SDK de mapa** | ✅ **Mapbox**. Conta criada pelo dono, token público no `.env` local |
| — | Tipografia | ✅ Plus Jakarta Sans confirmada |
| — | Repositório | ✅ `github.com/InnovareCode/VuumBora`, branch `main` |
| — | Domínio | ✅ **www.vuumbora.com.br** |
| — | Site | ✅ Next.js com exportação estática, em `apps/site` |

### Pendências que nasceram destas decisões

1. **Restringir o token do Mapbox** no painel, por URL e por identificador de
   app. Token público é visível por desenho; sem restrição, terceiros podem
   consumir a cota do dono.
2. **Onde hospedar o site.** O domínio existe, mas falta escolher o serviço e
   apontar o DNS no Registro.br. Opções usuais: Vercel (natural para Next.js),
   Cloudflare Pages ou Netlify. Todas atendem site estático, com plano gratuito
   suficiente para começar.
3. **Certificado HTTPS** — os três serviços acima emitem automaticamente, mas
   só depois do DNS apontado.

### Hospedagem: Easypanel no servidor do dono (18/11/2026)

O dono vai hospedar no **Easypanel**, painel que roda no servidor dele e
publica aplicações em contêiner, com certificado HTTPS automático.

**O que isso muda, comparado a uma hospedagem gerenciada:**

| | Easypanel no servidor próprio | Nuvem gerenciada |
|---|---|---|
| Custo | o do servidor, fixo | plano gratuito costuma bastar para site estático |
| Controle | total: site, API e banco no mesmo lugar | limitado ao que o serviço oferece |
| Responsabilidade | atualização, backup e segurança do servidor são do dono | do fornecedor |
| Vantagem real aqui | **o backend da Fase 5 vai precisar de servidor de qualquer jeito** | exigiria um segundo fornecedor |

A escolha faz sentido: o VuumBora vai precisar de API, banco e tempo real, e
ter tudo num lugar só simplifica. O preço é que manutenção do servidor passa
a ser responsabilidade do dono.

**O que o Vulcano precisa preparar:** empacotamento da aplicação em contêiner,
a configuração de build, as variáveis de ambiente (incluindo o token do
Mapbox, que entra pelo painel do Easypanel e **não** pelo repositório), e o
apontamento de domínio.

**O que depende do dono:** o endereço do servidor, o acesso ao painel, e
apontar `www.vuumbora.com.br` no Registro.br para o IP do servidor. O
certificado HTTPS é emitido sozinho depois que o DNS propagar.

---

## Compromisso público assumido em 18/11/2026

O dono se comprometeu, para publicação no site:

> **As regras de taxa da plataforma e de repasse ao motorista serão
> publicadas ANTES de o cadastro de motoristas ser aberto.**

O que isso significa na prática, e por que vira obrigação da equipe:

1. A frase vai ao ar no site, na seção do motorista. A partir do momento em
   que estiver publicada, ela é uma promessa feita a quem lê.
2. **O cadastro de motoristas não pode ser aberto antes disso.** Se a
   funcionalidade ficar pronta e as regras não estiverem publicadas, a
   funcionalidade espera — não o contrário.
3. A decisão 7 de `docs/decisoes-do-dono.md` (tarifa, taxa da plataforma e
   repasse) passa a ter uma consequência externa, não só interna: ela
   destrava o cadastro de motoristas.

Esse compromisso é o que sustenta a estratégia do site inteiro, que troca
prova social inventada por franqueza verificável. Quebrá-lo custaria mais
credibilidade do que nunca tê-lo feito.

**Ainda pendentes do mesmo conjunto:** as duas frases marcadas `[confirmar]`
(se o motorista vê o destino antes de aceitar e se o motorista avalia o
passageiro), os dados da empresa para o bloco institucional, e a decisão
sobre abrir lista de espera.

## Decisão de produto: o motorista vê o destino antes de aceitar (18/11/2026)

Confirmado pelo dono. O app já mostra o destino no cartão de oferta, então a
implementação está coerente com a decisão.

**É um diferencial forte para atrair motorista** — é uma das maiores
reclamações de quem dirige nos aplicativos que escondem o destino. O site
pode afirmar isso.

**E tem o outro lado, que precisa de uma regra depois:** mostrar o destino
permite ao motorista escolher corridas, recusando as que não interessam.
Isso é bom para ele e ruim para o passageiro que vai para um bairro menos
procurado, que pode ficar sem carro.

Todas as plataformas que mostram destino lidam com isso de alguma forma:
taxa de aceitação mínima, prioridade na fila para quem aceita mais, ou
simplesmente aceitar o efeito. **Não é decisão para agora**, mas vira
necessária quando houver distribuição de corridas de verdade (etapa 5.5 do
PLANO.md). Fica registrada para não ser descoberta em operação.

O app hoje já mostra "Taxa de aceitação" no painel do motorista — o número
existe na tela, mas nenhuma regra usa esse número ainda.

## Decisão de produto: só o passageiro avalia (18/11/2026)

Confirmado pelo dono. O app já implementa assim — a tela de corrida
concluída tem avaliação por estrelas do lado do passageiro, e o motorista
não avalia ninguém. Nenhuma mudança de código é necessária.

**O que isso deixa em aberto, para não ser surpresa depois:** sem avaliação
do passageiro, o motorista não tem registro de quem causou problema — quem
sujou o carro, quem foi agressivo, quem fez o motorista esperar muito. Em
operação, isso costuma aparecer como reclamação de motorista ("por que só
eu sou avaliado?") e como falta de instrumento para decidir se um passageiro
deve continuar usando a plataforma.

Alternativas usuais, quando e se isso virar problema:
- avaliação mútua, como a maioria das plataformas faz;
- só um canal de denúncia, sem nota, que resolve a parte de segurança sem
  criar a assimetria de "nota pública" dos dois lados.

**Não é decisão para agora.** Fica registrado porque, quando houver
operação real, é um dos primeiros atritos a aparecer — e porque o site não
pode sugerir avaliação mútua enquanto ela não existir.

---

## Lista de espera: aprovada em 18/11/2026, com condições

O dono quer abrir lista de espera no site. Isso transforma o site de
vitrine em **coletor de dado pessoal**, e três coisas passam a ser
obrigatórias antes de a primeira pessoa se cadastrar.

### 1. Identificação de quem controla os dados (bloqueia)

A LGPD exige que a pessoa saiba **para quem** está entregando o e-mail. Sem
nome da empresa e CNPJ, o aviso de privacidade fica incompleto — e é
justamente o dado que ainda não temos.

**Isto bloqueia a publicação do formulário**, não o desenvolvimento dele.

**Resolvido em 19/11/2026:** o dono informou a razão social — **Innovare
Code**, CNPJ **09.813.446/0001-00**. Esse é o controlador a citar no aviso
de privacidade do formulário.

### 2. Aviso de privacidade no próprio formulário (mínimo viável)

Não precisa da política completa para começar, mas precisa, ao lado do
campo, de forma curta e legível:
- qual a finalidade (avisar quando o app lançar — e só isso);
- quem é o controlador (item 1 — já resolvido, ver acima);
- que o e-mail não será vendido nem repassado;
- como pedir a exclusão, e para onde escrever.

**Ainda falta (19/11/2026):** não existe, até agora, um endereço de
contato (e-mail ou canal) para quem quiser pedir exclusão. Sem isso, o
aviso de privacidade fica incompleto mesmo com o controlador identificado
— a pessoa precisa de um "para onde escrever" real. Continua bloqueando a
publicação do formulário junto com o restante do item 2. Registrado também
em `docs/lista-de-espera.md`.

### 3. Onde os dados ficam

O site é estático e não tem servidor próprio. Duas saídas:

| Opção | A favor | Contra |
|---|---|---|
| **Servidor do próprio dono** (os serviços `vuumbora-backend` e `vuumbora-banco` já existem no Easypanel) | o dado nunca sai do controle dele; nada de terceiro no meio; aproveita infra já criada | exige construir um endpoint mínimo, que hoje não existe |
| Serviço de formulário de terceiro | pronto em minutos | o e-mail das pessoas passa a ficar na base de outra empresa, e isso precisa constar no aviso |

**Recomendação:** servidor próprio. É pouco trabalho — um endpoint que
recebe e-mail e grava —, aproveita o que já está de pé e evita colocar um
terceiro entre o VuumBora e o dado das pessoas logo no primeiro contato.

É também a primeira peça real da Fase 5, então não é trabalho jogado fora.

### O que NÃO fazer

- Pedir mais do que o necessário. Para avisar do lançamento basta o e-mail
  e, no máximo, se a pessoa é passageiro ou motorista. **Não pedir CPF,
  telefone, endereço nem documento.**
- Prometer prazo de lançamento.

## Identificação da empresa (18/11/2026)

- **Empresa:** Innovare Code
- **CNPJ:** 09.813.446/0001-00 — dígito verificador validado localmente,
  sem consultar nenhum serviço externo
- **Cidade:** a confirmar

Com nome e CNPJ, duas coisas ficam liberadas:

1. **O aviso de privacidade** da lista de espera pode identificar quem
   controla os dados, que é o requisito que bloqueava o formulário.
2. **O bloco institucional do site** pode sair do limbo.

**A confirmar, e nenhuma bloqueia:**
- se "Innovare Code" é o nome completo que deve constar no aviso legal, ou
  se a razão social tem complemento (LTDA, ME, EIRELI). Em documento legal
  o correto é a razão social como está no cartão CNPJ;
- a cidade, para o bloco institucional. Não é exigência de LGPD, mas pesa na
  credibilidade: motorista desconfia de aplicativo que não diz de onde é;
- um endereço de contato para pedidos de exclusão de dados. A LGPD dá esse
  direito, e o aviso precisa dizer para onde escrever. Hoje o projeto não
  tem nenhum canal de contato definido (ver decisão 11).

## Canal de contato definido (19/11/2026)

**contato@vuumbora.com.br**

Com ele, o aviso de privacidade da lista de espera fica completo: controlador
identificado (Innovare Code, CNPJ 09.813.446/0001-00) e endereço para onde a
pessoa escreve ao pedir exclusão dos dados. O formulário fica liberado para ir
ao ar.

**Três cuidados que vêm junto, e não são formalidade:**

1. **A caixa precisa existir e ser lida.** Publicar um endereço que ninguém
   acompanha é pior que não publicar: a LGPD dá prazo de resposta a pedido do
   titular, e o silêncio conta contra quem recebeu.
2. **Esse mesmo endereço vai virar canal de suporte na prática**, mesmo sem
   ninguém ter decidido isso. Quem tem dúvida sobre a corrida escreve no
   contato que achar. Vale prever isso antes de o app lançar (decisão 11).
3. **O endereço aparecerá publicamente no site**, então vai receber spam.
   Filtro e expectativa de volume fazem parte.

**Ainda pendente:** a cidade da empresa, para o bloco institucional. Não
bloqueia o formulário, mas pesa na credibilidade.

## Cidade da empresa: decidido não publicar (19/11/2026)

O dono optou por não exibir a cidade no bloco institucional. **Isso é uma
decisão, não uma pendência** — ninguém deve voltar a cobrar essa informação.

O bloco fica com: Innovare Code, CNPJ 09.813.446/0001-00 e
contato@vuumbora.com.br. É o suficiente para a pessoa saber com quem está
lidando e para o aviso de privacidade.

Registro honesto do que se perde: dizer de onde a empresa é ajuda
principalmente com motorista, que tende a desconfiar de aplicativo sem
origem declarada. Se mais adiante isso aparecer como objeção real, o campo
é fácil de acrescentar.

---

## Virada do site: página de pré-lançamento (19/11/2026)

O dono avaliou o site e foi direto: *"está com cara de site amador feito por
um estagiário"*. O pedido mudou de vitrine explicativa para **página de
pré-lançamento**, e isso muda o alvo, não só o acabamento.

**O que passa a valer:**

1. **Uma página só, clean e minimalista.** O site atual é longo e
   explicativo; o que se pede agora é impacto e uma ação. Menos texto, mais
   peso visual.
2. **Região definida: Natal e região metropolitana, no Rio Grande do Norte.**
   Isso **revoga** a decisão anterior de não publicar a cidade — agora a
   região é argumento central, porque cria expectativa local.
3. **O motorista é o público principal.** A página existe para atrair quem
   quer dirigir, e a ação é o **pré-cadastro**.
4. **Pré-cadastro, não lista de espera simples.** O dono vai **validar** cada
   cadastro e decidir quem entra. Isso muda o texto (é candidatura, não
   inscrição) e provavelmente os campos coletados.
5. **Animação profissional, podendo ser 3D.** A referência citada foi
   qualidade de animação de estúdio.

**Limite técnico encontrado, declarado na hora:** a geração de **vídeo** no
Runway exige plano pago, e a conta é gratuita. Então animação de verdade
precisa ser feita em código — 3D em WebGL ou transformações 3D em CSS —, não
como filme pronto. Isso é viável e tem uma vantagem: anima de forma fluida,
pesa pouco e não precisa carregar um arquivo de vídeo.

**O que NÃO muda:** não prometer o que o produto não faz, o compromisso de
publicar taxa e repasse antes de abrir o cadastro, e o aviso de privacidade
completo no formulário.

⚠️ **Uma implicação do pré-cadastro que precisa de decisão:** se o dono vai
validar candidaturas, a página provavelmente precisa coletar mais do que
e-mail — cidade onde dirige, se já tem veículo, se já dirige por aplicativo.
Cada campo a mais é dado pessoal e aumenta a responsabilidade. O backend hoje
guarda só e-mail e perfil.

## Campos do pré-cadastro de motorista (19/11/2026)

O dono quer coletar mais que e-mail, para poder **validar** a candidatura.
Proposta, guiada pelo princípio de pedir só o que serve à finalidade:

| Campo | Por que | Obrigatório |
|---|---|---|
| Nome | falar com a pessoa pelo nome, e validar | sim |
| E-mail | avisar do resultado e do lançamento | sim |
| Celular (WhatsApp) | é por onde motorista responde de fato | sim |
| Cidade onde dirige | o lançamento é por região; define quem entra primeiro | sim |
| Já dirige por aplicativo | separa quem começa amanhã de quem precisa de apoio | não |
| Tem veículo próprio | critério direto de elegibilidade | não |

**O que NÃO pedir agora, e o motivo:** CPF, CNH, documento do veículo, foto,
comprovante. Isso é a etapa de **cadastro de verdade**, que vem depois da
aprovação, exige guarda segura e processo de verificação (decisão 9). Pedir
documento num formulário de pré-cadastro é assumir obrigação de guardar
documento sensível antes de existir processo para isso.

**O que muda de responsabilidade, com os campos novos:**

1. **Nome e celular tornam os dados identificáveis de verdade.** E-mail
   solto já é dado pessoal; nome e telefone juntos deixam a base mais
   sensível, e um vazamento passa a ser mais grave.
2. **O aviso de privacidade precisa citar os campos**, não só "seu e-mail".
3. **Criou-se uma expectativa de resposta.** Quem se candidata e informa
   telefone espera retorno. Não responder é pior do que não ter coletado.
4. **A exclusão passa a valer para tudo**, não só o e-mail.

**Pendência que isso cria:** quem analisa as candidaturas, em quanto tempo e
com qual critério. Sem isso, o formulário vira uma caixa que enche e não
responde — e aí o pré-cadastro trabalha contra a credibilidade que ele
deveria construir.

### Ampliação pedida: cadastro completo no pré-cadastro (19/11/2026)

O dono pediu os campos de um cadastro de motorista: nome completo, telefone,
e-mail, endereço, bairro, CEP, cidade, UF, "entre outros".

**Isso é viável, e o trade-off precisa estar registrado:**

| | Formulário curto (4 campos) | Cadastro completo (10+ campos) |
|---|---|---|
| Quem termina | muita gente | bem menos, sobretudo no celular |
| Serve para validar? | sim: região, veículo, experiência | sim, e ainda adianta a papelada |
| Dado pessoal guardado | contato e cidade | **endereço residencial completo** |
| Se vazar | lista de contatos | onde cada motorista mora |

**O ponto central:** endereço, bairro e CEP **não ajudam a decidir se a
candidatura é aprovada**. Eles são necessários no cadastro real, para
contrato e documentação — depois da aprovação. Pedi-los antes significa
guardar o endereço residencial de gente que talvez nem seja aprovada.

**Saída recomendada — duas etapas, sem perder nenhum dado:**
1. **Na página:** nome, telefone, e-mail, cidade/UF e as perguntas de
   elegibilidade. Rápido de preencher, e já dá para validar.
2. **Depois da aprovação:** endereço completo, CEP, documentos — quando a
   pessoa já sabe que foi aceita e tem motivo para preencher com calma.

Assim o dono tem os mesmos dados no fim, com mais candidaturas completas e
menos dado sensível guardado de quem não entrou.

**Decisão do dono registrada abaixo quando ele responder.**

**DECISÃO: duas etapas** (19/11/2026)

**Etapa 1 — na página, é o que se constrói agora:**
nome completo, telefone (WhatsApp), e-mail, cidade, UF, e as duas perguntas
de elegibilidade (já dirige por aplicativo, tem veículo próprio).

**Etapa 2 — depois da aprovação, fora do escopo atual:**
endereço, bairro, CEP, documentos (CNH, documento do veículo, seguro). Só
existe quando houver processo de verificação (decisão 9) e guarda segura.

O endereço residencial **não é coletado** de quem ainda não foi aprovado.

---

## Decisões do dono — 20/11/2026 (noite)

Cinco respostas dadas de uma vez, em cima das perguntas do
`docs/plano-sistema.md` §14. Registradas aqui com a leitura que fiz de cada
uma e **o que ainda falta** para virar regra implementável.

### 1. Controle de acesso por setor e competência ✅

**Decidido:** a empresa terá **vários usuários**, com acesso por setor —
suporte, financeiro, operação, revisão de documentos, dono. O papel é o que
limita o que a pessoa vê e faz.

**Consequência:** o Admin v0 nasceu com uma conta de dono e leitura de
candidaturas. Antes de entrar gente da empresa, ele precisa de **gestão de
usuários e papéis** (criar, desativar, trocar papel) e de verificação de
permissão em cada rota. Vira a próxima fatia do painel, não um detalhe
posterior: colocar gente dentro sem isso é dar acesso total a todo mundo.

**Falta definir:** a lista de permissões por setor. Proposta em `§ Proposta de
papéis` abaixo, para o dono cortar ou aprovar.

### 2. Onde o painel roda ✅

**Decidido:** **mesmo servidor** que já roda a API e o site.

**Consequência técnica, e é boa:** `admin.vuumbora.com.br` e
`api.vuumbora.com.br` são, para o navegador, **o mesmo site** (ambos sob
`vuumbora.com.br`). O cookie `SameSite=Lax` implementado continua válido — a
chamada é cross-origin (precisa do CORS com credenciais, já ligado) mas não
é cross-site. Se um dia o painel mudar de domínio, isso vira `SameSite=None`
mais proteção de CSRF.

**Consequência operacional:** um servidor só passa a concentrar site, API,
banco e painel. Isso aumenta o peso de duas pendências que já estavam na
lista: **backup externo testado** e **HTTPS no painel do Easypanel**.

### 3. Taxa da plataforma: 20% a 25%, variável por mérito ✅ (com lacunas)

**Decidido:** a taxa começa entre **20% e 25%**, variando por **tempo de
plataforma**, **quantidade de corridas concluídas** e **nota** do motorista.

**Leitura que fiz, e que precisa de um "sim" antes de virar código:** quanto
melhor o motorista, **menor** a taxa (chega a 20%); motorista novo ou com
nota baixa fica no topo da faixa (25%). É o que "quanto melhor o motorista,
mais ele ganha" significa.

**Consequência:** a taxa deixa de ser número e vira **regra versionada com
faixas**. Cada corrida precisa gravar **qual faixa foi aplicada e por quê** —
sem isso não há como explicar ao motorista por que ele recebeu o que recebeu,
nem auditar depois. Isso muda o modelo de dados: `trip_price_components` passa
a guardar a faixa, e nasce um histórico de faixa por motorista.

**Falta definir — e isto bloqueia publicar as regras, que por sua vez bloqueia
abrir o cadastro de motoristas:**
- os cortes exatos: quantos dias, quantas corridas e qual nota levam a cada
  percentual;
- de quanto em quanto tempo a faixa é recalculada (a cada corrida? semanal?);
- se a faixa pode **piorar** (nota caiu → taxa sobe) e com quanto aviso;
- o que vale para o motorista recém-aprovado.

⚠️ **Consequência de comunicação:** até hoje o site podia dizer "taxa menor"
sem número (ver `docs/revisao-copy-fase-1.md`). No dia em que as regras forem
publicadas, o número vira público e vira compromisso cobrável. Publicar é um
passo deliberado, não um efeito colateral de ter decidido.

### 4. Login dos apps: e-mail/ID + senha ✅

**Decidido:** cada motorista tem **login único e intransferível**, por e-mail
(ou ID) e senha. Isso fecha a decisão em aberto do plano (D-07): **não** será
código por WhatsApp.

**O que vem junto, e precisa existir:** recuperação de senha, política mínima
de senha, proteção contra tentativa em massa, e verificação do e-mail no
cadastro (senão ninguém recupera o acesso).

⚠️ **"Irrevogável" tem limite legal.** Leio como **intransferível e não
reutilizável** — ninguém herda o login de outro, e o identificador não volta a
circular. Não pode significar "não pode ser apagado": a LGPD dá ao titular o
direito de exclusão e as duas lojas **exigem** um caminho de exclusão de conta
para aprovar o app.

**Falta definir:** o **passageiro** também entra por e-mail e senha, ou só o
motorista?

### 5. Pagamento com split ✅ (provedor ainda aberto)

**Decidido:** o provedor **tem** de ter split nativo.

**Ainda aberto: qual provedor** — e continua sendo a decisão de maior impacto
financeiro do projeto, porque a diferença entre Pix percentual e Pix de taxa
fixa muda o custo em cerca de dez vezes no ticket que o VuumBora vai ter.

**A decisão 3 acrescentou um requisito à escolha:** com taxa variável por
motorista, o split precisa aceitar **percentual diferente a cada transação**.
Nem todo provedor faz isso bem — isso passa a ser critério de eliminação na
comparação, não detalhe.

---

## Proposta de papéis (para o dono cortar ou aprovar)

Nasce de `docs/plano-sistema.md` §5 (rotas de admin já desenhadas com o papel
exigido entre colchetes). O princípio é **menor privilégio**: ninguém vê dado
sensível que o trabalho dele não exige.

| Papel | Vê e faz | **Não** vê |
|---|---|---|
| **Dono** | tudo, inclusive tarifas, papéis e auditoria | — |
| **Operação** | candidaturas, corridas ao vivo, cancelar corrida, bloquear usuário, sinais de risco | documento de motorista, dado bancário |
| **Revisor de documentos** | documentos do motorista, aprovar/recusar/pedir correção | financeiro, corridas ao vivo |
| **Financeiro** | ledger, estorno, ajuste com motivo, conciliação, repasses | documento de motorista, suporte |
| **Suporte** | chamados, dados de contato da corrida, histórico | **documento de motorista**, financeiro, tarifas |

Três regras que valem para todos: toda ação de escrita grava em auditoria com
motivo; **toda abertura de documento de motorista é registrada**; e ninguém
cria o próprio usuário — conta nasce por quem tem o papel de dono.

### 6. Layout do painel: padrão ModaShop, paleta VuumBora ✅ (20/11/2026)

**Decidido:** a casca do painel administrativo segue o padrão do painel
master/admin do **ModaShop** (`C:/Projetos/Web/Moda Shop`) — barra lateral
escura com grupos recolhíveis e contadores, gaveta no celular, paleta de
comandos, cabeçalho de página com selo de ícone, título e uma linha de
propósito.

**A paleta e a tipografia continuam as do VuumBora** — confirmado pelo dono
quando perguntei diretamente ("pode manter nossa paleta mesmo"). Copia-se a
**anatomia**, não as cores: o design system do VuumBora segue sendo a fonte
de verdade.

**Decisão técnica que veio junto (minha, não do dono):** adotar Tailwind v4
no `apps/admin`, com os tokens do design system como tema CSS-first. Portar
um padrão escrito em Tailwind para CSS Modules à mão seria lento e cheio de
erro; como só existe uma tela, a troca sai barata agora.

**Endereço do painel: resolvido na seção 7, logo abaixo.**

### 7. Endereço do painel: `admin.vuumbora.com.br` ✅ (20/11/2026)

**Decidido pelo dono**, depois de um erro meu que vale ficar registrado.

**O que aconteceu:** o Órion relatou, na auditoria, que a documentação citava
dois nomes para o painel (`admin.` e `painel.`) e pediu que fosse um só. Eu
tratei como divergência e uniformizei para `painel.vuumbora.com.br` — **sem
ler o que o segundo documento realmente dizia**. Os dois textos estavam
certos: falavam de **coisas diferentes**.

**Os dois nomes coexistem, e não são intercambiáveis:**

| Endereço | O que é |
|---|---|
| **`admin.vuumbora.com.br`** | **o nosso painel administrativo** (serviço `vuumbora-admin`) |
| `painel.vuumbora.com.br` | o painel do **próprio Easypanel**, que controla o servidor inteiro — passo 0 de `docs/deploy-easypanel.md`, ainda pendente |

**O que precisa acontecer por causa disso:** `https://admin.vuumbora.com.br`
tem de entrar em `ALLOWED_ORIGINS` da API em produção. Se o endereço
publicado não estiver na lista, o navegador bloqueia o painel legítimo — e o
sintoma parece "o sistema caiu", não "faltou um nome numa variável".

**A lição, que é mais larga que este caso:** relatório de agente aponta o
sintoma ("há dois nomes"), não necessariamente a causa. Uniformizar dois
textos que discordam, sem abrir os dois, troca uma inconsistência visível por
um erro silencioso — e este teria aparecido só na hora de apontar o DNS.

### 8. Login do painel: padrão premium, em escala só-escura ✅ (20/11/2026)

**Decidido:** a tela de login do painel segue a **anatomia** da tela de login
do ModaShop — duas colunas, lado da marca com título e itens, lado do
formulário com selo, campos rotulados com ícone e revelar senha.

**O conflito, e como foi resolvido:** no ModaShop o lado do formulário é
**branco**. A paleta do VuumBora é **só escura** — não existe tom claro de
uso geral nos tokens, e o único valor claro que existe (`gradient.searchLight`)
é documentado como reservado a **um** elemento por tela. Em vez de inventar
uma cor fora do design system, a hierarquia foi traduzida para dentro da
escala de escuros: **navy** (marca) → **surface** (coluna do formulário) →
**elevated com borda** (o cartão). Mesma leitura de "marca de um lado, ação
do outro", sem cor nova.

**O dono aprovou** quando perguntei diretamente ("pode, está bom"). Portanto:
**não acrescentar um tom claro ao design system** para imitar o ModaShop. Se
um dia isso voltar à mesa, é decisão de design system, não de tela.

**O que NÃO foi copiado da referência, de propósito:** login com Google,
autocadastro e "esqueci minha senha". Conta de administrador nasce por
script (decisão de segurança), e não existe fluxo de recuperação — link que
não leva a lugar nenhum é pior que a ausência dele.

## Identidade dos apps — decisões do dono (21/11/2026)

Respostas às quatro perguntas em aberto do S1 (login dos apps, e-mail + senha).

1. **Contas separadas.** Passageiro e motorista são contas distintas, uma por
   papel. Não existe "conta com dois papéis". Hipótese de implementação, a
   confirmar: o mesmo e-mail pode abrir uma conta de passageiro e outra de
   motorista (unicidade do e-mail **por tipo de conta**), e o app indica o tipo
   no login.
2. **Verificação de e-mail: obrigatória**, "de muita importância para validar
   os dados informados". Conta sem e-mail verificado não abre sessão.
3. **Recuperação de senha: unicamente por e-mail.** Sem WhatsApp, sem SMS.
4. **Cadastro com e-mail repetido: informar que o e-mail já está cadastrado**
   (resposta explícita, aceitando o custo de revelar que o e-mail existe).
   Limitar por IP/identificador o número de consultas.

Consequência de infraestrutura: o envio de e-mail passa a ser dependência do
cadastro. Falta escolher o provedor (SMTP/transacional) e configurar o
domínio de envio (SPF, DKIM, DMARC) — ver pendências do S1 no PROGRESSO.

**Provedor de e-mail (21/11/2026): SMTP do próprio domínio do dono.** A API
envia por SMTP configurado em variáveis de ambiente (host, porta, usuário,
senha, remetente) — a senha vai só no Easypanel, nunca no git nem no chat.
Pendente do dono: fornecer esses dados e conferir SPF/DKIM/DMARC do domínio
de envio.

**Configuração do SMTP dentro do painel (21/11/2026).** O dono quer cadastrar
servidor, porta, usuário, senha e remetente na própria tela do admin, no
padrão do ModaShop: cada campo mostra de onde vem o valor (painel, variável
de ambiente ou padrão), a senha fica salva cifrada e nunca volta para a
tela, e há envio de e-mail de teste. Só o papel `dono` acessa.

**Bloqueio do 2FA do admin (21/11/2026): aceito.** Cinco códigos errados
travam o admin por 15 minutos (inclusive com o código certo durante o
bloqueio). O dono aceitou o risco de quem sabe a senha travar um admin de
propósito, em troca de proteção contra adivinhação, **com procedimento de
emergência (break-glass) documentado** para desbloquear. Resposta ao
achado M-4 de `docs/revisao-seguranca-s1.md`.

**Bloqueio de login: atraso progressivo (21/11/2026).** Em resposta ao achado
I-6 de `docs/revisao-seguranca-s1-rodada2.md`: no login dos apps e no login
do admin, o bloqueio duro por conta (teto global de 20 falhas nos apps; 10 em
15 min no admin) dá lugar a **atraso progressivo** — cada falha seguida
aumenta o tempo de espera, sem travar a conta de quem conhece a senha. Fica
valendo, como já decidido, o bloqueio de 15 min do **código do 2FA**.

**Pendências do I-5 e LGPD, respondidas (21/11/2026).**
- **CAPTCHA no cadastro: não, por enquanto.** O freio contra e-mail em massa
  fica nos limites por e-mail, por IP e no teto global de envios por hora.
- **Idade mínima: 18 anos, para passageiro e para motorista.** Hipótese de
  implementação, a confirmar: data de nascimento no cadastro, validada no
  servidor (recusa menor de 18) e guardada só para esse fim.
- **Ainda em aberto:** textos e versões dos Termos de Uso e da Política de
  Privacidade (o aceite precisa registrar qual versão) e o que fazer com o IP
  em claro em `admin_audit_log` (recomendação: guardar só o IP truncado).

**IP em `admin_audit_log`: mantido em claro (21/11/2026).** O dono decidiu não
truncar. Consequência registrada: o banco não permite apagar essas linhas
(trilha inviolável), então a base legal e o prazo de guarda do IP precisam
constar na Política de Privacidade (finalidade: segurança e auditoria
administrativa). Resposta ao ponto aberto da rodada 2 do Órion.

## Plataforma dos aplicativos — decisão do dono (21/11/2026)

**Quando chegar a fase de desenvolvimento dos aplicativos, eles serão feitos em
React Native, para Android e iOS.** Uma só base de código para as duas lojas.

- **Não muda a arquitetura:** o repositório já parte de React Native via Expo
  (SDK 58, Expo Router, `packages/ui`, `packages/tokens`) e o plano
  (`docs/plano-sistema-arquitetura.md` §4.1) já trata isso como base decidida.
  Esta decisão a confirma e a torna do dono, não só da squad.
- **Escopo, como entendido:** "aplicativo" são os dois apps, passageiro e
  motorista. O painel admin e o site continuam web (SPA React e HTML), fora
  desta decisão. A confirmar se o dono quis dizer outra coisa.
- **Consequência que já pesa nas decisões abertas:** iOS exige conta de
  desenvolvedor da Apple e passagem pela revisão da App Store, além da conta do
  Google Play. É a decisão 17 (contas de loja), que continua em aberto e passa
  a bloquear o teste em iPhone real e a entrega do S8.
- **Consequência de teste:** como o produto roda nas duas plataformas, o
  critério do S4 (corridas de campo com dois Android e um iPhone) e o teste de
  localização em segundo plano passam a ser obrigatórios nas duas, não só no
  Android.
