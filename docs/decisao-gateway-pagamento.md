# D-03: qual gateway de pagamento usar

Preparado pela Nova (arquitetura) em 22/11/2026, porque o dono pediu na mesma data
(`docs/decisoes-do-dono.md`, seção "Decisões do dono em 22/11/2026 (noite)", item "7 e D-03").
Ele entra no caminho crítico do `docs/plano-mestre.md` §6.1: sem gateway, o motorista não pode
ser cadastrado como recebedor no M3, e o M6 não começa.

**Todas as fontes foram consultadas em 22/11/2026** e são páginas oficiais de preço ou de
documentação de cada empresa (a lista com os links está na seção 10). Não abri conta, não fiz
cadastro e não falei com nenhum comercial. Os preços usados são os **de tabela pública, sem
negociação**. Quando algo não estava na fonte, o texto diz **(não confirmado)** em vez de trazer
um número.

---

## Resumo para decidir

1. **No Pix, a forma de cobrar pesa mais que o percentual.** Uma taxa fixa por Pix é cara numa
   corrida de R$ 15 a 30. O Asaas cobra **R$ 2,15 por Pix** no preço cheio. Numa corrida de R$ 22
   com taxa da plataforma de 20%, isso leva **49% da comissão** da VuumBora. Com cobrança
   percentual, Mercado Pago e Pagar.me cobram 0,99% e levam **5%**.
2. **No cartão, nenhum é barato:** o gateway fica com 20% a 33% da comissão, conforme a rapidez
   com que o dinheiro cai. Receber em 14 ou 30 dias custa menos que receber na hora.
3. **O "percentual diferente por corrida" não elimina ninguém.** Todos os candidatos aceitam
   que o valor do motorista seja informado **em cada cobrança**. A recomendação é a VuumBora
   calcular esse valor em centavos e enviá-lo pronto. Assim a faixa de 20 a 25% fica
   inteiramente na mão da VuumBora (detalhes na seção 2).
4. **O que de fato separa os candidatos:** o custo do Pix, o que o motorista precisa fazer
   para virar recebedor (abrir conta no gateway ou só informar o banco dele) e se o cartão pode
   ser cobrado sem o número passar pelo servidor da VuumBora, que é um critério de aceite do M6.
5. **Recomendação:** **Mercado Pago como padrão**, condicionado a quatro confirmações por escrito
   (seção 6), e **pedir agora uma proposta à Pagar.me (plano Flex)** para comparar.
   **Efí** fica como reserva. **Asaas, Stripe e Woovi não servem** para o perfil da VuumBora,
   pelos motivos da seção 7.

**O que o dono precisa fazer:** escolher entre os dois finalistas depois de receber as propostas,
decidir quem paga a taxa do gateway (seção 8, P2) e se haverá corrida em dinheiro no lançamento
(P3). O contador precisa validar o modelo fiscal (P4).

---

## 1. Requisitos (fixados pelo dono e pelo plano)

| # | Requisito | Elimina quem não tem? |
|---|---|---|
| R1 | Split que aceite percentual diferente em cada corrida (a taxa varia com a faixa do motorista, de 20 a 25%) | Sim |
| R2 | Pix e cartão. Dinheiro talvez, mas dinheiro não passa pelo gateway (seção 9) | Sim, para Pix e cartão |
| R3 | Custo aceitável numa corrida de R$ 15 a R$ 30, empresa brasileira, Natal-RN | Na prática, sim (seção 3) |
| R4 | Motorista como recebedor, com cadastro e KYC (verificação de identidade) próprios | Sim |
| R5 | Estorno e ajuste | Sim |
| R6 | Conciliação e webhooks (o ledger tem de bater com o relatório do provedor ao centavo, critério do M6) | Sim |
| R7 | Dados no Brasil | Não deu para verificar em nenhum (seção 7) |
| R8 | Nenhum dado de cartão no servidor da VuumBora (critério do M6 no `docs/plano-mestre.md`) | Pesa muito: sem isso, o servidor entra no escopo do PCI-DSS |

---

## 2. Antes dos números: como o percentual variável é resolvido

O jeito mais seguro de atender o R1 vale para qualquer gateway: **a VuumBora calcula no
servidor, em centavos inteiros, quanto vai para o motorista e quanto fica com a plataforma, e
envia ao gateway um valor fixo para aquela cobrança.** Cada gateway chama esse campo de um jeito:
`fixedValue` no Asaas, `application_fee` no Mercado Pago, `flat` na Pagar.me e `fixo` na Efí.
Ninguém depende de o gateway aplicar percentual.

Por que fazer assim:

- A faixa do motorista (20 a 25%) e as regras de arredondamento ficam no domínio da VuumBora,
  versionadas junto com a tarifa, e não presas a uma configuração do gateway.
- O ledger e o pedido ao gateway usam o mesmo número, e a conciliação compara centavo com
  centavo.
- Trocar de gateway não muda a regra de negócio, só o adaptador (a "porta de pagamento" que o
  plano já prevê).

Um cuidado: em alguns gateways, o percentual incide sobre o **valor líquido** (depois da taxa do
gateway), e não sobre o valor da corrida. No Asaas, por exemplo, o `percentualValue` é aplicado
sobre o `netValue`. Enviar valor fixo elimina essa ambiguidade.

---

## 3. Quanto custa cada corrida

Hipóteses: preço de tabela pública, crédito à vista, sem negociação e sem impostos. A conta foi
arredondada ao centavo; o gateway pode arredondar diferente e a diferença chega a 1 centavo.

### 3.1 Pix

| Gateway | Regra pública | R$ 15 | R$ 22 | R$ 30 | Quando o dinheiro cai |
|---|---|---|---|---|---|
| Mercado Pago | 0,99% | R$ 0,15 | R$ 0,22 | R$ 0,30 | Na hora |
| Pagar.me (plano Essencial, **sem split**) | 0,99% | R$ 0,15 | R$ 0,22 | R$ 0,30 | 1 dia (pode ficar retido até 30 dias para vendedor novo) |
| Efí | 1,19% (Pix por API) | R$ 0,18 | R$ 0,26 | R$ 0,36 | (não confirmado) |
| Stripe | 1,19% | R$ 0,18 | R$ 0,26 | R$ 0,36 | Até 2 dias úteis |
| Woovi | 0,80%, **mínimo de R$ 0,50** | R$ 0,50 | R$ 0,50 | R$ 0,50 | (não confirmado) |
| Asaas, preço cheio | R$ 2,15 por Pix | **R$ 2,15** (14,3%) | **R$ 2,15** (9,8%) | **R$ 2,15** (7,2%) | Na hora |
| Asaas, promoção dos 3 primeiros meses | R$ 1,08 por Pix | R$ 1,08 | R$ 1,08 | R$ 1,08 | Na hora |

O plano Essencial da Pagar.me **não tem split**. O split só existe no plano Flex, com preço
negociado. A linha está na tabela como referência do preço público da casa.

A página do Asaas mostra "R$ 2,15" e "R$ 1,08" lado a lado. Pelo padrão da página e pela
resposta sobre a promoção de 3 meses, o primeiro é o preço cheio e o segundo é o promocional.
Isso precisa ser confirmado com o Asaas.

### 3.2 Cartão de crédito à vista

| Gateway | Regra pública | R$ 15 | R$ 22 | R$ 30 | Quando o dinheiro cai |
|---|---|---|---|---|---|
| Efí | 3,49% | R$ 0,52 | R$ 0,77 | R$ 1,05 | Até 31 dias |
| Efí, antecipando | 3,49% + 1,29% por parcela antecipada | R$ 0,72 | R$ 1,05 | R$ 1,43 | Antecipado |
| Mercado Pago, 30 dias | 3,98% | R$ 0,60 | R$ 0,88 | R$ 1,19 | 30 dias |
| Mercado Pago, 14 dias | 4,49% | R$ 0,67 | R$ 0,99 | R$ 1,35 | 14 dias |
| Mercado Pago, na hora | 4,98% | R$ 0,75 | R$ 1,10 | R$ 1,49 | Na hora, **só depois de o MP analisar o histórico de vendas** |
| Pagar.me (Essencial, **sem split**) | 4,19% | R$ 0,63 | R$ 0,92 | R$ 1,26 | 1 dia (mesma ressalva de retenção) |
| Asaas, preço cheio | 2,99% + R$ 0,49 | R$ 0,94 | R$ 1,15 | R$ 1,39 | 32 dias; antecipação a 1,25% ao mês, sujeita a análise |
| Asaas, promoção de 3 meses | 1,99% + R$ 0,49 | R$ 0,79 | R$ 0,93 | R$ 1,09 | Idem |
| Stripe | 3,99% + R$ 0,39 | R$ 0,99 | R$ 1,27 | R$ 1,59 | (não confirmado para o Brasil) |

O Stripe ainda cobra pelo Connect (o produto de split) quando a plataforma define o próprio
preço: **R$ 6 por conta ativa por mês + 0,25% + R$ 0,67 por repasse** ao motorista. Um exemplo
com hipótese declarada: 100 motoristas ativos, repasse diário e 1.000 corridas de R$ 22 por dia
custariam **cerca de R$ 3,9 mil por mês só de Connect**, além das taxas acima.

Débito: o Asaas publica R$ 0,35 + 1,89%, e o Mercado Pago, 3,99% para o "Cartão de débito
virtual Caixa". Não confirmei se dá para cobrar débito online num app de corrida em cada
gateway **(não confirmado)**.

### 3.3 Quanto da comissão da VuumBora o gateway leva

É o número que mais ajuda a decidir. Na faixa de 20% (o pior caso), a comissão da plataforma é
R$ 3,00 numa corrida de R$ 15, R$ 4,40 numa de R$ 22 e R$ 6,00 numa de R$ 30.

| Meio | Gateway | R$ 15 | R$ 22 | R$ 30 |
|---|---|---|---|---|
| Pix | Mercado Pago / Pagar.me | 5% | 5% | 5% |
| Pix | Efí / Stripe | 6% | 6% | 6% |
| Pix | Woovi | 17% | 11% | 8% |
| Pix | **Asaas, preço cheio** | **72%** | **49%** | **36%** |
| Cartão | Efí, 31 dias | 17% | 17% | 17% |
| Cartão | Mercado Pago, 14 dias | 22% | 22% | 22% |
| Cartão | Mercado Pago, na hora | 25% | 25% | 25% |
| Cartão | Asaas, preço cheio | 31% | 26% | 23% |
| Cartão | Stripe (sem o Connect) | 33% | 29% | 27% |

Na faixa de 25%, multiplique cada número por 0,8.

### 3.4 Em volume

Hipótese do `docs/plano-sistema.md`: ~1.000 corridas por dia. Com ticket médio de R$ 22:

| | Por 1.000 corridas | Por mês (30 mil corridas) |
|---|---|---|
| Pix, Mercado Pago | R$ 217,80 | R$ 6.534 |
| Pix, Efí ou Stripe | R$ 261,80 | R$ 7.854 |
| Pix, Woovi | R$ 500,00 | R$ 15.000 |
| Pix, Asaas (preço cheio) | R$ 2.150,00 | **R$ 64.500** |
| Cartão, Efí (31 dias) | R$ 767,80 | R$ 23.034 |
| Cartão, Mercado Pago (14 dias) | R$ 987,80 | R$ 29.634 |
| Cartão, Asaas (preço cheio) | R$ 1.147,80 | R$ 34.434 |
| Cartão, Stripe (sem o Connect) | R$ 1.267,80 | R$ 38.034 |

A proporção entre Pix e cartão é o que mais move a conta. Em todos os candidatos, cada corrida
que passa do cartão para o Pix reduz o custo de 4 a 5 vezes.

---

## 4. Comparação: o que cada um faz

### 4.1 Split, recebedor e prazos

| Gateway | Split por corrida com valor variável (R1) | O que o motorista precisa ter | KYC do motorista | Antecipação |
|---|---|---|---|---|
| **Mercado Pago** | **Sim.** No modelo 1:1 (documentação pública), `application_fee` vai em cada pagamento. No 1:N, fixo ou percentual por participante, mas **só com contato comercial** | Conta Mercado Pago **e** autorizar a VuumBora por OAuth | Feito pelo Mercado Pago; a conta do integrador precisa de KYC nível 6 | Embutida no prazo escolhido (na hora, 14 ou 30 dias) |
| **Pagar.me** | **Sim**, `flat` ou `percentage` por pedido, informado na autorização. **Só no plano Flex** e "apenas para clientes PSP" | **Só a conta bancária dele, em qualquer banco** (o recebedor é cadastrado com `default_bank_account`) | Link de "Prova de Vida (KYC)" gerado por API | Configurável por recebedor (`automatic_anticipation_settings`) |
| **Efí** | **Sim.** No cartão e no boleto, por cobrança. No Pix, cria-se uma configuração de split e vincula-se à cobrança | **Conta Efí** (split só entre contas Efí; no Pix, até 20 contas por configuração) | Feito pela Efí, na abertura da conta dele (não confirmado em detalhe) | 1,29% por parcela antecipada |
| **Asaas** | **Sim**, `fixedValue` ou `percentualValue` em cada cobrança | **Conta Asaas** (subconta criada pela VuumBora) | Documento e selfie pelo Asaas | 1,25% ao mês no cartão à vista, sujeita a análise de crédito |
| **Stripe** | Por cobrança, pelo Connect (não reconferi a documentação nesta pesquisa) | Conta conectada Stripe, com cadastro hospedado pela Stripe | Feito pela Stripe | (não confirmado para o Brasil) |
| Iugu | Sim, por fatura via API, no "Plano Marketplace" | Subconta Iugu (split só entre contas Iugu) | Pela Iugu (não confirmado) | (não confirmado) |
| PagBank | Sim, fixo ou percentual na criação do pedido (API Order) | Conta PagBank | Pelo PagBank (não confirmado) | (não confirmado) |
| Woovi | Só Pix | Subconta Woovi | (não confirmado) | Não se aplica |

### 4.2 Estorno, webhooks, cartão e exigências do CNPJ

| Gateway | Estorno com split (R5) | Webhook: como prova que veio do gateway | Cartão sem passar pelo servidor (R8) | SDK | O que exige do CNPJ da VuumBora |
|---|---|---|---|---|---|
| **Mercado Pago** | Proporcional entre motorista e plataforma. No 1:1, **se o motorista não tiver saldo, a plataforma devolve a parte dela e decide o que fazer com o resto**. No 1:N, estorno por participante | **Assinatura HMAC** no header `x-signature` | Sim, com token do cartão gerado no app (`card_token` na API) | SDKs oficiais (o SDK valida a assinatura do webhook) | Conta de vendedor com KYC nível 6; aplicação no painel de desenvolvedor; 1:N só via comercial |
| **Pagar.me** | Documentação comercial promete "estornos automáticos por regra". Quem responde pelo chargeback é definido por recebedor (`liable`) | (não confirmado na documentação v5; o reenvio é configurável) | Provável, com token público (não reconferido) | (não confirmado) | Plano Flex com o comercial; conta PJ Stone |
| **Efí** | Devolução de Pix com split tem configuração própria (`devolucoes`) | **mTLS obrigatório** no webhook Pix ("por norma do Banco Central"), além de IP fixo e HMAC opcional na URL | Provável, com `payment_token` gerado no cliente (não reconferido) | SDKs no GitHub da Efí (não reconferidos) | Conta Efí Empresas |
| **Asaas** | Estornar a cobrança estorna os splits; estorno parcial é suportado (`refundedSplits`) | **Token fixo** no header `asaas-access-token`, além de lista de IPs. Não é assinatura do corpo da mensagem | **Não.** O Asaas não tem tokenização no cliente: pela API, os dados do cartão passam pelo servidor ("sua infraestrutura continua no escopo"). Só a página hospedada e o link de pagamento tiram o servidor do escopo | Só Java oficial; o restante é REST | Conta-pai **PJ** para criar subcontas; **período de avaliação regulatória** (seção 7) |
| **Stripe** | Estorno de Pix em até 90 dias, parcial ou total | Assinatura (não reconferida nesta pesquisa) | Sim, com SDK no app (não reconferido nesta pesquisa) | Oficiais (não reconferidos) | Conta Stripe com CNPJ e plataforma Connect |

---

## 5. Ficha de cada candidato

### Mercado Pago

- **Preço:** Pix 0,99% na hora. Cartão 4,98% na hora (depois de análise do histórico), 4,49% em
  14 dias ou 3,98% em 30 dias.
- **Split:** no modelo 1:1, **o pagamento é criado na conta do motorista**, com o token OAuth
  dele, e a VuumBora recebe a `application_fee`. A taxa do Mercado Pago é descontada primeiro e a
  comissão da plataforma sai do que sobra. Para o motorista receber exatamente o valor combinado,
  a VuumBora calcula `application_fee = preço − taxa do MP − valor do motorista`.
- **Pontos fortes:** o Pix mais barato entre os que têm split publicado; webhook assinado
  (atende o critério do M6 de recusar assinatura inválida); muito motorista já tem conta Mercado
  Pago; entidade brasileira (Mercado Pago Instituição de Pagamento Ltda.).
- **Pontos a confirmar antes de assinar:** ver a seção 6.

### Pagar.me (Stone)

- **Preço público (Essencial, sem split):** Pix 0,99% e crédito à vista 4,19%, com recebimento
  em 1 dia. O **Flex**, único com split, tem "taxas customizadas" e se contrata com o comercial.
- **Split:** a VuumBora é a vendedora principal, e o motorista é um "recebedor" com a conta
  bancária dele, em qualquer banco. Por recebedor, dá para definir quem paga a taxa
  (`charge_processing_fee`), quem responde pelo chargeback (`liable`), a frequência do repasse
  (`transfer_settings`) e a antecipação.
- **Ponto forte:** a melhor experiência para o motorista, que não precisa abrir conta em lugar
  nenhum. A VuumBora controla quem paga o quê.
- **Ponto fraco:** sem proposta comercial, **não existe número para comparar**. É a primeira
  proposta a pedir.

### Efí (antiga Gerencianet)

- **Preço:** Pix 1,19% por API. Crédito à vista 3,49%, com o dinheiro em até 31 dias. Antecipar
  custa 1,29% por parcela.
- **Split:** só entre contas Efí. No Pix, a configuração de split é criada à parte e vinculada à
  cobrança.
- **Ponto forte:** o cartão mais barato da tabela, se a VuumBora aceitar esperar 31 dias.
- **Pontos fracos:** o motorista precisa abrir conta Efí. O webhook do Pix exige **mTLS**, o que
  obriga o proxy do servidor (Easypanel) a validar o certificado do cliente numa rota específica.
  É trabalho de infraestrutura que os outros não pedem.

### Asaas

- **Preço:** Pix **R$ 2,15 fixo** (R$ 1,08 por 3 meses). Cartão 2,99% + R$ 0,49, com o dinheiro
  em 32 dias. A página diz que as taxas mostradas são as padrão e que o contrato pode ter outras.
- **Split:** completo e bem documentado (`fixedValue` ou `percentualValue` por cobrança, webhook
  por split liquidado, bloqueio por divergência com 2 dias úteis para corrigir).
- **Por que não serve hoje:** (1) a taxa fixa do Pix (tabela 3.3); (2) cartão pela API passa pelo
  servidor da VuumBora, o que bate de frente com o critério do M6; (3) o **período de avaliação
  regulatória**: na produção, até 10 subcontas, até R$ 2.000 em cobranças por subconta e até 60
  dias. Na prática, isso trava o beta com mais de 10 motoristas até a homologação. O modelo de
  subconta sob as Resoluções Conjuntas 16 e 17 do Banco Central também obriga a mostrar a marca e
  os textos do Asaas em todo ponto de contato com o cliente.
- **Quando reabrir:** se o Asaas propuser Pix **percentual** e houver um caminho de cartão sem
  passar pelo servidor que funcione dentro do app.

### Stripe

- **Preço:** cartão 3,99% + R$ 0,39; Pix 1,19%, liquidado em até 2 dias úteis; contestação
  R$ 55,00; Connect R$ 6 por conta ativa por mês + 0,25% + R$ 0,67 por repasse.
- **Ponto forte:** a melhor ferramenta para desenvolvedor e para cobrar cartão salvo.
- **Por que não serve:** o mais caro no cartão, mais o custo do Connect; o Pix demora 2 dias;
  empresa global, sem confirmação de que os dados ficam no Brasil.

### Iugu, PagBank e Woovi (avaliação curta)

- **Iugu:** tem split por fatura via API no "Plano Marketplace", só entre contas Iugu. O preço é
  dado pelo comercial (a página de planos redireciona para a home). **Sem número público.**
- **PagBank:** split por pedido, fixo ou percentual; todos os recebedores precisam de conta
  PagBank. As taxas são "de acordo com o que você negociar". **Sem número público.**
- **Woovi:** só Pix, 0,80% com **mínimo de R$ 0,50**. No ticket da VuumBora, o mínimo sempre se
  aplica. Exigiria um segundo gateway para cartão.

---

## 6. Recomendação

**Mercado Pago como padrão, e pedir agora uma proposta à Pagar.me (Flex) para comparar.**

Por que o Mercado Pago:

1. É o Pix mais barato com split documentado publicamente (0,99%, na hora). Pela seção 3.4, o
   Pix é o que define o custo da VuumBora.
2. Atende o R1 com `application_fee` por pagamento.
3. Atende o R8 com token do cartão gerado no app.
4. O webhook é assinado com HMAC, que é o que o M6 pede.
5. A barreira para o motorista é baixa onde ele já tem conta Mercado Pago.

**Quatro confirmações por escrito com o Mercado Pago antes de assinar.** Sem elas, a
recomendação não vale:

| # | Pergunta | Por que importa |
|---|---|---|
| C1 | O Pix funciona no Split 1:1? Só encontrei Pix explícito na documentação do 1:N, e a do 1:1 diz que o modelo "permite pagamentos com saldo disponível entre contas Mercado Pago. Não são permitidas transferências de instituições financeiras externas". | Se o Pix não funcionar no 1:1, é preciso contratar o 1:N pelo comercial. |
| C2 | No 1:1, a taxa e o prazo do cartão são os da conta da VuumBora ou os da conta de cada motorista? | O pagamento nasce na conta do motorista. Se valer a configuração dele, o custo e o prazo mudam de motorista para motorista. |
| C3 | Estorno quando o motorista não tem saldo. | A documentação diz que a plataforma devolve a parte dela e decide o resto. A VuumBora precisa de uma regra para cobrar isso do motorista depois. |
| C4 | Onde ficam os dados, e se há contrato de tratamento (LGPD). | R7, que não está confirmado em nenhum candidato. |

**Pagar.me como alternativa real.** Se a proposta do Flex vier com Pix perto de 1% e cartão
perto de 4%, ela pode ser melhor que o Mercado Pago: o motorista recebe na conta de qualquer
banco, sem abrir conta nova, e a VuumBora controla quem paga a taxa e quem responde pelo
chargeback.

**Efí como reserva**, se os dois falharem: preço público razoável, com o custo de exigir conta
Efí do motorista e mTLS no servidor.

A decisão final é do dono, com as propostas na mão. A arquitetura não fica presa à escolha: a
porta de pagamento isola o gateway (seção 9).

---

## 7. Riscos de cada um

| Gateway | Risco | Tamanho |
|---|---|---|
| Mercado Pago | C1 a C4 acima | Alto até confirmar |
| Mercado Pago | O token OAuth de cada motorista vence e precisa ser renovado (a documentação tem a etapa "Renovar Access Token"). Token vencido significa motorista que não recebe | Médio: dá para monitorar |
| Mercado Pago | O pagamento sai em nome do motorista, que passa a ser o vendedor. Isso afeta a fatura do passageiro, as disputas e o tratamento fiscal | Médio: pergunta para o contador e o advogado (P4) |
| Mercado Pago | Cartão "na hora" só depois de análise do histórico. Conta nova recebe em 14 ou 30 dias | Baixo: só muda o prazo |
| Pagar.me | Preço do split desconhecido até a proposta. "Apenas clientes PSP" | Alto até a proposta chegar |
| Pagar.me | Vendedor novo pode ter o recebimento retido até 30 dias "por questões de análise" | Médio |
| Efí | Motorista precisa abrir conta Efí, o que reduz a conversão do cadastro | Médio |
| Efí | mTLS no webhook do Pix: configurar o proxy no Easypanel | Médio: trabalho do Vulcano |
| Asaas | Taxa fixa do Pix; cartão passando pelo servidor (PCI); período de avaliação com 10 subcontas, R$ 2.000 por subconta e 60 dias; taxa de criação de subconta não publicada | Alto |
| Asaas | Webhook autenticado só por token fixo no header, não por assinatura do corpo | Médio |
| Stripe | Custo do cartão e do Connect; Pix em 2 dias; dados provavelmente fora do Brasil (não confirmado) | Alto |
| Iugu e PagBank | Sem preço público. A comparação depende de proposta | Médio |
| Todos | **Dados no Brasil (R7) não confirmado em nenhum.** As entidades brasileiras confirmadas nas próprias páginas são Asaas (instituição de pagamento autorizada pelo Banco Central, código 461), Mercado Pago Instituição de Pagamento Ltda. e PagSeguro Internet Instituição de Pagamento S/A. Ser empresa brasileira não prova onde o dado fica guardado | Médio: perguntar no comercial e exigir no contrato |
| Todos | Preço de tabela muda, e promoções vencem (a do Asaas dura 3 meses) | Baixo: a porta de pagamento permite trocar |

---

## 8. Decisões que ficam com o dono

| # | Decisão | Recomendação da Nova |
|---|---|---|
| P1 | Gateway | Mercado Pago, condicionado a C1 a C4; antes, receber a proposta da Pagar.me Flex e comparar |
| P2 | **Quem paga a taxa do gateway**: a plataforma, o motorista ou os dois, proporcionalmente | **A plataforma absorve.** Assim dá para publicar a regra mais simples ("você recebe X% do valor da corrida"), e as regras de taxa e repasse precisam sair **antes** de o cadastro abrir (compromisso público de 18/11) |
| P3 | **Corrida em dinheiro no lançamento** | **Não no lançamento.** Em dinheiro, a comissão vira dívida do motorista com a plataforma e precisa de controle próprio (seção 9). Entra depois de o ledger estar provado no M6 |
| P4 | Validação do contador | Perguntar: (a) com split, a VuumBora fatura a corrida inteira ou só a comissão? (b) nota fiscal e ISS da comissão em Natal; (c) o motorista recebendo como pessoa física por conta de pagamento; (d) quem é o vendedor no modelo 1:1 do Mercado Pago |
| P5 | Prazo do cartão | Receber em 14 dias no Mercado Pago (4,49%), se o caixa permitir; na hora custa 0,5 ponto a mais |

---

## 9. O que a escolha muda na arquitetura

Nada do que está construído precisa ser refeito. O que entra no M6, seja qual for o gateway:

- **Porta de pagamento** com um adaptador por gateway: cadastrar recebedor e consultar a
  situação dele; criar cobrança (Pix ou cartão) com o valor do motorista em centavos; estornar
  (inclusive parcialmente); validar e interpretar o webhook; listar a liquidação para conciliar.
- **Ledger como fonte da verdade.** O valor do split é calculado pela VuumBora e gravado antes de
  ir ao gateway. O webhook só confirma. Webhook repetido não gera lançamento novo (critério do M6:
  o mesmo webhook 10 vezes gera 1 lançamento).
- **Ajuste depois da liquidação.** Split já liquidado não se edita. O Asaas, por exemplo, também
  não aceita marcar o repasse para uma data futura: ele sai junto com o recebimento. Por isso,
  ajuste é sempre um lançamento novo no ledger e, se mexer em dinheiro, uma transferência ou o
  abatimento no split de uma próxima corrida.
- **Dinheiro (quando o dono liberar).** A comissão da corrida em dinheiro vira saldo devedor do
  motorista no ledger. Ele é abatido do valor do motorista nas próximas corridas pagas por Pix ou
  cartão, e é para isso que serve o split variável por corrida. É preciso um teto: acima de um
  valor devido, o motorista deixa de receber corridas em dinheiro. O teto é decisão do dono.
- **Cadastro do motorista como recebedor (M3).** O formato depende do gateway: autorização OAuth
  no Mercado Pago, conta bancária e link de KYC na Pagar.me, abertura de conta na Efí. A tela do
  M3 só pode ser desenhada depois da P1.

**Sequência depois da decisão:**

1. O dono pede propostas ao Mercado Pago (1:N e respostas C1 a C4) e à Pagar.me (Flex). Isso
   depende só dele.
2. O contador valida a P4. Depende de 1, porque o modelo fiscal muda conforme o gateway.
3. O dono cria a conta de sandbox. A equipe não cria contas nem digita senhas (decisão 17).
4. M3: o motorista vira recebedor. Depende de 1 a 3 e da tela de cadastro.
5. M6: cobrança, webhooks, ledger e conciliação das 200 corridas em sandbox. Depende de 4 e do M5.

---

## 10. Fontes (todas acessadas em 22/11/2026)

**Asaas**
- Preços e taxas: https://www.asaas.com/precos-e-taxas
- Split, introdução: https://docs.asaas.com/docs/split-de-pagamentos
- Perguntas frequentes do split: https://docs.asaas.com/docs/faq-do-split.md
- Criação de subcontas e período de avaliação: https://docs.asaas.com/docs/criacao-de-subcontas.md
- Fluxo de aprovação de subcontas: https://docs.asaas.com/docs/detalhamento-do-fluxo-de-aprovação-de-subcontas.md
- Estornos: https://docs.asaas.com/docs/estornos.md
- Cobrança por cartão: https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito.md
- PCI-DSS: https://docs.asaas.com/docs/pci-dss.md
- Webhooks: https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook.md

**Mercado Pago**
- Custo do Checkout (tabela de Pix e cartão por prazo): https://www.mercadopago.com.br/ajuda/33399
- Split 1:1, visão geral: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/overview
- Split 1:1, pré-requisitos: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites
- Split 1:1, integração e estorno: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- Split 1:N (Orders API): https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/split-payments-1-n
- Webhooks e assinatura `x-signature`: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/resources/notifications/webhooks

**Pagar.me**
- Ofertas (Essencial e Flex): https://www.pagar.me/ofertas
- Pedidos com split: https://docs.pagar.me/docs/pedidos-com-split
- Referência do split: https://docs.pagar.me/reference/split-1
- Criar recebedor (KYC e conta bancária): https://docs.pagar.me/reference/criar-recebedor-1
- Webhooks: https://docs.pagar.me/docs/webhooks

**Efí**
- Tarifas: https://sejaefi.com.br/tarifas
- Split no Pix: https://dev.efipay.com.br/docs/api-pix/split-de-pagamento-pix/
- Split em cobranças (cartão e boleto): https://dev.efipay.com.br/docs/api-cobrancas/split-de-pagamento/
- Webhooks do Pix (mTLS): https://dev.efipay.com.br/docs/api-pix/webhooks/

**Stripe**
- Preços: https://stripe.com/br/pricing
- Preços do Connect: https://stripe.com/br/connect/pricing
- Pix: https://docs.stripe.com/payments/pix

**Outros**
- Iugu, split: https://dev.iugu.com/docs/split-de-pagamentos (preços: https://www.iugu.com/planos redireciona para a home)
- PagBank, split (comercial e perguntas frequentes): https://pagbank.com.br/para-seu-negocio/online-integracao/split-de-pagamento
- PagBank, split (desenvolvedor): https://developer.pagbank.com.br/v1/docs/split-de-pagamento
- Woovi, planos e preços: https://woovi.com/planos-e-precos/

**O que ficou sem confirmação na fonte, reunido:** onde ficam os dados de todos os candidatos;
Pix no Split 1:1 do Mercado Pago; prazo do Pix na Efí e na Woovi; prazo do cartão do Stripe no
Brasil; preço do split na Pagar.me (Flex), na Iugu e no PagBank; assinatura de webhook na
Pagar.me; SDKs da Pagar.me e da Efí; tokenização no cliente na Pagar.me e na Efí; débito online;
taxa de criação de subconta no Asaas. Os itens do Stripe Connect sobre split e assinatura foram
marcados como não reconferidos porque não li essa documentação nesta pesquisa.
