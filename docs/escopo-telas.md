# Escopo de telas — o que as referências premium pedem

Levantado em 18/11/2026 a partir de `referencias/passageiro_telas_premium.webp` e
`referencias/motorista_telas_premium.webp`, aprovadas pelo dono como alvo visual.

Este documento separa **duas coisas que costumam ser confundidas**: o trabalho de
construir a tela, e a decisão de negócio que precisa existir antes de a tela
significar alguma coisa. Uma tela de saque desenhada sem decisão de repasse é
desenho; com a decisão, é produto.

---

## 1. Passageiro — 9 telas na referência

| Tela | Estado hoje | Observação |
|---|---|---|
| Boas-vindas | ❌ não existe | Exige a imagem de fundo (noturno urbano) |
| Criar conta | ❌ não existe | Depende da decisão de login social |
| Home / destino | ✅ **pronta** | Falta o acabamento premium e o bloco "Indique e ganhe" |
| Categoria e confirmação | ✅ **pronta** | Nomes e preços divergem entre as referências — ver §4 |
| Corrida em andamento | 🔄 **em construção** | Lyra está nela agora (P08–P10) |
| Histórico de viagens | ❌ não existe | Só interface; os dados virão da API |
| Carteira | ❌ não existe | ⚠️ depende de decisão de negócio |
| Perfil | ❌ não existe | Só interface |
| Configurações | ❌ não existe | Só interface |

## 2. Motorista — 11 telas na referência

| Tela | Estado hoje | Observação |
|---|---|---|
| Login | ❌ não existe | Depende da decisão de login social |
| Cadastro | ❌ não existe | Só interface |
| Dashboard | ✅ **pronta** | Falta o acabamento premium |
| Solicitação de corrida | ✅ **pronta** (dentro do dashboard) | Na referência é tela cheia |
| Corrida em andamento | ❌ não existe | Espelha o lado do passageiro |
| Navegação (GPS) | ❌ não existe | ⚠️ depende do SDK de mapa e de navegação |
| Ganhos | ❌ não existe | ⚠️ "Solicitar saque" é decisão de negócio |
| Histórico de corridas | ❌ não existe | Só interface |
| Documentos | ❌ não existe | ⚠️ exige processo real de verificação |
| Perfil | ❌ não existe | Só interface |
| Suporte | ❌ não existe | ⚠️ "falar via chat" exige canal real |

**Resumo:** 20 telas no alvo, **4 prontas**, 1 em construção, 15 a fazer.
Dessas 15, **9 são só interface** e saem rápido sobre o design system; **6 esbarram
em decisão de negócio** e não deveriam ser construídas antes dela.

---

## 3. O que depende de decisão do dono

Nenhuma destas é dificuldade técnica. São compromissos com o usuário, com a lei
ou com o bolso — e por isso não são minhas para decidir.

1. **Carteira com saldo (passageiro) e saque (motorista).** Guardar dinheiro de
   cliente e repassar a motorista tem regra contábil e, dependendo do desenho,
   exige parceiro financeiro habilitado. O design system já alertava: "saldo
   apenas se o modelo financeiro permitir".
2. **"Indique e ganhe créditos".** Crédito é promessa de valor: precisa de regra
   de concessão, validade, limite e o que acontece se o indicado cancelar.
3. **Login com Google e Apple.** Técnico tranquilo, mas exige conta de
   desenvolvedor nos dois — e a Apple **obriga** oferecer o login dela se o app
   oferecer o do Google.
4. **Navegação GPS integrada.** Mapa e rota têm custo por uso, e navegação
   passo a passo costuma ser licença à parte.
5. **Verificação de documentos (CNH, CRLV, seguro, vistoria).** Os selos
   "Aprovado" da referência implicam alguém aprovando: processo, prazo, critério
   de recusa e guarda de documento sensível (LGPD).
6. **Chat de suporte.** "Falar com o suporte" exige gente atendendo, ou vira
   botão que ninguém responde.

## 4. Divergências entre as referências

A referência nova do passageiro chama as categorias de **VuumBora / Comfort /
Premium** (R$ 14,90 / 19,90 / 29,90). A referência anterior, já implementada,
usa **Vuum Econômico / Comfort / Plus** (R$ 23,90 / 29,90 / 37,90).

Nome de categoria e preço são decisão comercial. Enquanto não houver definição,
o app segue com os nomes implementados e **todos os valores marcados como
estimativa fabricada** — nenhum preço de mockup virou regra de negócio.

## 5. Ordem que eu recomendo

1. **Acabamento premium** sobre o que já existe — é o que muda a percepção de
   todas as telas de uma vez, e barateia as 15 seguintes.
2. **Telas que são só interface** (perfil, configurações, histórico, cadastro).
3. **Telas com decisão de negócio**, uma a uma, conforme você decidir cada uma.
4. **Backend, mapa e pagamento** — a Fase 2 do roadmap, onde o protótipo vira app.
