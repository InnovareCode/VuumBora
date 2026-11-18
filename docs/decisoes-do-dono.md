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
