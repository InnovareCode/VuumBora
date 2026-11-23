# Fichas de tela do VuumBora: índice, inventário e ordem de tratamento

Autor: Apolo · 22/11/2026 · régua: `docs/padrao-premium-telas.md` · template: `_template.md`

Uma ficha por tela. A ficha é o contrato entre a direção de arte (Apolo), a implementação (Lyra) e a verificação (Íris): a
Lyra constrói o que está nela, a Íris reprova o que diverge dela. Mudou a tela, muda a ficha **antes** do código.

**Estado das fichas:** completas, as de P01 a P11, P13, P14, M01 a M10 e M12 a M14 (as das ondas 3 a 5 entraram em
22/11/2026, à noite). M03 e M04 descrevem telas **bloqueadas** por decisão (não construir o conteúdo antes). Sem ficha, só
P12 (carteira) e M11 (ganhos), bloqueadas pelas decisões 3 a 7 e 12.

| Ficha | Tela | Onda |
|---|---|---|
| `P01-boas-vindas.md` | Boas-vindas | 1 |
| `P02-entrar-e-criar-conta.md` | Entrar, criar conta, código, esqueci e redefinir a senha | 1 |
| `P03-inicio.md` | Início | 2 |
| `P04-origem-e-destino.md` | Origem e destino | 2 |
| `P05-categoria-e-orcamento.md` | Categoria e orçamento | 3 |
| `P06-confirmacao.md` | Confirmação | 3 |
| `P07-buscando-motorista.md` | Buscando motorista | 3 |
| `P08-motorista-atribuido.md` | Motorista atribuído (encontrado, a caminho, chegou) | 4 |
| `P09-corrida-em-andamento.md` | Corrida em andamento | 4 |
| `P10-viagem-concluida.md` | Viagem concluída (valor e avaliação) | 4 |
| `P11-historico.md` | Histórico de viagens e comprovante | 5 |
| `P13-perfil-e-configuracoes.md` | Meu Perfil, Configurações, Meus dados, Privacidade e termos | 5 |
| `P14-ajuda-e-seguranca.md` | Ajuda e segurança | 5 |
| `M01-entrar.md` | Entrar (motorista) | 1 |
| `M02-criar-conta.md` | Criar conta (motorista) | 1 |
| `M03-veiculo-e-documentos.md` | Veículo e documentos (bloqueada) | — |
| `M04-analise-cadastral.md` | Análise cadastral (bloqueada) | — |
| `M05-painel-do-motorista.md` | Painel do motorista | 2 |
| `M06-nova-corrida.md` | Nova corrida (oferta em tela cheia) | 4 |
| `M07-a-caminho-do-embarque.md` | A caminho do embarque | 4 |
| `M08-embarque.md` | Embarque (cheguei, aguardando, iniciar) | 4 |
| `M09-corrida-em-andamento.md` | Corrida em andamento (motorista) | 4 |
| `M10-corrida-finalizada.md` | Corrida finalizada (resumo) | 4 |
| `M12-historico-de-corridas.md` | Histórico de corridas e detalhe | 5 |
| `M13-perfil-e-documentos.md` | Meu Perfil (substitui a M13 provisória) | 5 |
| `M14-suporte-e-seguranca.md` | Suporte e segurança | 5 |

**Tipografia:** Plus Jakarta Sans nos dois apps (PP-1, decidida pelo dono em 22/11/2026). As fichas falam por papel
(`textStyle(peso, papel)`), nunca por família; todo número que muda leva `tabularNums`.

**Duas numerações "D-xx" convivem nas fichas.** Sem prefixo, **D-xx** é a linha da tabela de divergências do padrão
(`docs/padrao-premium-telas.md` §18.2, D-01 a D-30, mais D-31 a D-38 abaixo). **"plano D-xx"** é a decisão em aberto de
`docs/plano-sistema.md` §14 (D-01 a D-15: por exemplo, plano D-12 é o código de embarque e plano D-06 é o preço fechado na
cotação). "Decisão N" (1 a 17) é a de `docs/decisoes-do-dono.md`. Ambiguidade antiga: a ficha da P05 cita "D-08 e D-09"
para as categorias desligadas (linhas 11 e 153); ali é o **plano** D-08 e D-09, não as linhas da §18.2 (a P03, linha 127, usa
o D-08 da §18.2, o do carro fotorrealista).

---

## Inventário de todas as telas

Lido no código em 22/11/2026, **sem rodar os apps**. "Nota" é a da auditoria de 18/11 (Expo Web), quando houve. "Recorte" é a
tela correspondente na prancha de 22/11 (coordenadas em `docs/padrao-premium-telas.md` §18.1).

As linhas de P07 a P14 e de M06 a M14 foram relidas no código em 22/11/2026, à noite, ao escrever as fichas (já com as ondas
0 a 2 na `main`). As de P01 a P06 e M01 a M05 **não** foram relidas depois das ondas 1 e 2: o estado delas está nas fichas e
nos vereditos da Íris (`docs/veredito-iris-portao-onda{1,2}.md`), não aqui.

Estado: **—** não existe · **UI** só interface, com mock · **parcial** parte real · **real** fala com a API.

### Passageiro

| ID | Tela | Arquivo | Estado | Nota | Recorte | Lacunas principais contra a spec e a prancha | Onda |
|---|---|---|---|---|---|---|---|
| P01 | Boas-vindas | `(auth)/boas-vindas.tsx` | UI | 7 | Bem-vindo | Secundário 52 × CTA 56; lockup sem limite de largura (`BrandLogo.tsx:36`); título sem papel de cabeçalho (`:55`) | 1 |
| P02 | Entrar / criar conta (+ código, esqueci, redefinir, termos, privacidade) | `(auth)/login.tsx`, `cadastro.tsx`, `codigo.tsx`, `esqueci-senha.tsx`, `redefinir-senha.tsx`, `termos.tsx`, `privacidade.tsx` | **real** | 6 / 5 | Criar conta | Sem brilho de topo (`login.tsx:111`, `cadastro.tsx:190`); CTA abaixo da dobra em 568 (L2); "Mostrar" amarelo (`PasswordInput.tsx:70`); `server_busy` sem texto próprio | 1 |
| P03 | Início | `(app)/index.tsx` | UI | 8 | Home | Categorias e preço antes da rota (`:79-118`, PP-2); banner com promessas proibidas (`SafetyPromoBanner.tsx:34-45`); selo sobre o localizar (`HomeMapPreview.tsx:92`); abas com "Mensagens" sem ação (`index.tsx:57-63`); nome fixo (`:74`) | 2 |
| P04 | Origem e destino | `(app)/destino.tsx` | UI | 7,5 | — (herda) | Sem confirmação no mapa nem localização atual; selo na linha do título (`:91-93`); origem amarela (`:74`); título trunca em 320 (`ScreenHeader.tsx:30`) | 2 |
| P05 | Categoria e orçamento | dentro de `(app)/index.tsx` | parcial | — | Escolha de categoria | Não é tela; sem mapa, rota e painel; 5 categorias onde 3 nascem desligadas | 3 |
| P06 | Confirmação | `(app)/confirmacao.tsx` | UI | 7 | Escolha de categoria (pé) | Cards chapados (`:118-128`); selos na linha do título (`:61-63,80-82`); carro amarelo (`:67`); preço com peso de dado comum (`:137`) | 3 |
| P07 | Buscando motorista | `(app)/buscando.tsx` | UI (simulador) | 3 | — (herda P05) | Cancela sem confirmar (`:51-54`); sem os estados "nenhum motorista" e "o motorista cancelou" (`:46-48`); destino laranja (`:77`); preço sem "estimado" (`:90-92`); sem mapa por trás (`:61`). S1 e S3 tratados | 3 |
| P08 | Motorista atribuído | `(app)/a-caminho.tsx` | UI (simulador) | 4 | Corrida em andamento | Sem mapa (A5); Ligar/Mensagem/SOS com `onPress` vazio (`SafetyActionsRow.tsx:29,38,47`); cancela sem confirmar (`:54-57`); ETA sem destaque (`:129`); contrato sem modelo e cor do veículo (PP-12) | 4 (D1) |
| P09 | Corrida em andamento | `(app)/em-andamento.tsx` | UI (simulador) | 3 | Corrida em andamento | Metade da tela vazia, sem mapa (E1); barra de progresso chapada (E3); ETA sem destaque (E5); segurança sem ação | 4 (D1) |
| P10 | Viagem concluída | `(app)/concluida.tsx` | UI | 4,5 | — (herda P11) | Dois `PrimaryButton` (`:146,165`); "Preciso de ajuda" sem ação (`:157-163`); comprovante repetido com linhas de tarifa fabricadas (D-38); selos na linha do título (`:105-108,115-118`); avaliação só local | 4 |
| P11 | Histórico | `(app)/historico.tsx`, `historico-detalhe.tsx` | UI | não auditada | Histórico | Filtros em chip que rola (`historico.tsx:59-74`; C-16 já existe); sem carregando nem erro de carga; carro amarelo (`TripHistoryCard.tsx:48`); detalhe com cartões chapados (`historico-detalhe.tsx:114-134`) | 5 |
| P12 | Pagamento / carteira | — | — | — | Carteira | Não existe. Construir só "Formas de pagamento" (D-13); saldo, transferir e cupons dependem das decisões 3, 4, 5 e 12 | bloqueada (3) |
| P13 | Perfil e configurações | `(app)/perfil.tsx`, `configuracoes.tsx` | parcial | não auditada | Meu Perfil, Configurações | Dados de exemplo (`perfil.tsx:64-73`); ícones de linha amarelos (D-30, decidida); 6 linhas só com aviso (PP-15); chaves de enfeite e "Limpar cache" fingido (`configuracoes.tsx:12-32`); sem exclusão de conta; "Sair" sem confirmação | 5 |
| P14 | Ajuda e segurança | — | — | — | — (herda o Suporte do motorista) | Não existe; "Ajuda e suporte" do perfil só abre aviso; canal decidido (WhatsApp, `docs/plano-apps-execucao.md:253-254`); número para o app a confirmar | 5 (número do dono) |
| dev | Catálogo, teste do Mapbox | `(dev)/catalogo.tsx`, `(dev)/mapbox-check(.web).tsx` | dev | — | — | Fora do build de loja (A1, `0fe8883`). Não tratar | — |

### Motorista

| ID | Tela | Arquivo | Estado | Nota | Recorte | Lacunas principais | Onda |
|---|---|---|---|---|---|---|---|
| M01 | Entrar | `(auth)/entrar.tsx` (+ `codigo`, `esqueci-senha`, `redefinir-senha`, `termos`, `privacidade`) | **real** | — | Login | Sem brilho de topo (`:118`); "Esqueci" acima do CTA (`:189`, a prancha põe embaixo); "Mostrar" amarelo | 1 |
| M02 | Criar conta | `(auth)/criar-conta.tsx` | **real** | — | Cadastro | Sem brilho (`:194`); lockup no lugar do selo; o aviso "conta ≠ cadastro" fica (D-04) | 1 |
| M03 | Veículo e documentos | — | — | — | Documentos | Bloqueada: decisão 9, lista da STTU, gate público | bloqueada |
| M04 | Análise cadastral | — | — | — | — (herda) | Bloqueada; hoje o painel finge aprovação (`index.tsx:54`) | bloqueada |
| M05 | Painel | `(app)/index.tsx` | UI | 4 | Dashboard Inicial | Começa online e aprovado (`:48,54`); oferta, mapa, banner amarelo, atalhos e "Sair" na mesma tela (`:90-124`); abas sem ação (`:73-84`); "Taxa de aceitação" (`:100`); São Paulo (`:97`) | 2 |
| M06 | Nova corrida | componente órfão `src/components/home/NewRideOfferCard.tsx` (saiu da M05 na onda 2; nenhuma tela o usa) | só componente | (4) | Solicitação de Corrida | Não é tela; "Dinâmica +20%"; selo "Nova corrida" amarelo cheio; Recusar 52 × Aceitar 56; contador local. Já mostra só bairros (decisão de 22/11) | 4 |
| M07 | A caminho do embarque | — | — | — | Navegação (GPS) | Não existe. Sem passo a passo (decisão 10, D-21): mapa, endereço exato e botão para o app externo | 4 (D1 + decisão 10) |
| M08 | Embarque | — | — | — | Corrida em Andamento (topo) | Não existe; código de embarque depende do plano D-12; "passageiro não apareceu" depende da decisão 15 | 4 |
| M09 | Corrida em andamento | — | — | — | Corrida em Andamento | Não existe; sem mapa, como na prancha (D-35); sem nota nem foto do passageiro (D-19, D-27); contato depende da decisão 11 | 4 |
| M10 | Corrida finalizada | — | — | — | — (herda M06 e M12) | Não existe; o que o valor é depende da decisão 7 (D-23, D-38); volta online sozinho? (PP-13) | 4 |
| M11 | Ganhos | — | — | — | Ganhos | Não existe; saque e saldo dependem das decisões 6 e 7 (D-22). **Sem ficha**; a aba "Ganhos" não faz nada (`index.tsx:67`) | bloqueada em parte |
| M12 | Histórico | — | — | — | Histórico de Corridas | Não existe; aba sem ação (`index.tsx:68-73`); **não há rota de histórico do motorista no contrato**; só bairros (PP-14) | 5 |
| M13 | Perfil e documentos | `(app)/perfil.tsx` (**provisória**, a descartar) | parcial | — | Perfil, Documentos | Provisória com nome e e-mail fixos e "Sair" em linha de lista (`perfil.tsx:20-29,74-80`); sem estado do cadastro; Veículo e Documentos dependem da decisão 9 | 5 |
| M14 | Suporte e segurança | — | — | — | Suporte | Não existe; WhatsApp decidido; "Solicitar reavaliação" fora (D-26) | 5 |

### Painel administrativo (web)

Lido só no nível de rotas, navegação e nomes de componentes (`apps/admin/src/App.tsx:44-73`, `nav/adminNav.ts`). Sem prancha
(o painel segue a anatomia do ModaShop: decisões 6 e 8 de 20/11).

| ID | Tela | Arquivo | Estado | Lacunas e observações | Onda |
|---|---|---|---|---|---|
| A01 | Entrar (com 2FA: cadastro do fator, código, códigos de recuperação) | `pages/LoginPage.tsx`, `components/auth/*` | real (contra a API do S1; não publicado) | Tem `DemoModeBanner` no modo mock (`LoginPage.tsx:194`). Passar pelo portão em 1280 e 390 | 6 |
| A02 | Pré-cadastro: lista de candidaturas | `pages/DriverApplicationsListPage.tsx` | real | Já tem carregando, vazio e erro (`RequestState`, `:7`); abas de estado com `aria-pressed` e `aria-selected` juntos (`:54-55`): conferir qual papel vale | 6 |
| A03 | Pré-cadastro: detalhe e decisão | `pages/DriverApplicationDetailPage.tsx`, `ApproveDialog`, `RejectDialog` | real | Aprovar e recusar sem veredito da Íris (`docs/plano-mestre.md:36`) | 6 |
| A04 | Configurações de e-mail | `pages/EmailSettingsPage.tsx` | real | Carregando e erro presentes (`:31-32`) | 6 |
| A05 | Segurança (2FA) | `pages/SecuritySettingsPage.tsx` | real | Idem (`:33-34`) | 6 |
| A06 | Sem acesso | `pages/NoAccessPage.tsx` | real | — | 6 |
| A07 | Não encontrada | `pages/NotFoundPage.tsx` | real | — | 6 |

---

## Ordem de tratamento recomendada

A lógica: primeiro o que corrige muitas telas de uma vez (design system), depois o que o usuário vê primeiro e o que já fala com
a API de verdade, e por último o que depende de mapa ou de decisão. Dentro de cada onda, **uma instância da Lyra por zona de
arquivo** (regra R1 do plano mestre): `packages/ui` é de uma instância por vez.

| Onda | O quê | Por quê | Quem |
|---|---|---|---|
| **0. Fundação** | (a) Ferramenta do portão: sondas e capturas em `tools/qualidade-tela/` (padrão §14.2 e §14.3). (b) Tokens que faltam (PP-7). (c) Mudanças no DS: `ScreenHeader` (C-17, caixa da direita, seta lucide, 2 linhas), `ButtonCore` (rótulo em 2 linhas, secundário proeminente), `PasswordInput`, `AppShell` (margem compacta e largura máxima), `BrandLogo`, `StarRating`, `EmptyState`/`ErrorState` com ícone (C-09). (d) Componentes base: C-01, C-03, C-04, C-05, C-07, C-08, C-10, C-13, C-16 | Sem (a), nenhum portão é medível. (b) a (d) corrigem defeitos em 10+ telas de uma vez | Íris + Vulcano (a); Lyra (b a d); Atlas decide PP-7 e PP-8 antes |
| **1. Entrada** | P01, P02, M01, M02 | Primeira impressão, e são as únicas telas **reais** (identidade B1/B2) | Lyra (uma por app) |
| **2. Casa** | P03, P04, M05 | A tela mais vista de cada app. Depende de PP-2, PP-5, PP-6 e PP-9 | Lyra |
| **3. Pedido** | P05 + P06 (PP-3), P07 | Antes do mapa real, com `MapPreviewBackground` e selo; o layout já nasce no formato mapa + painel (C-02). A P07 é o primeiro uso do `RideMapLayout` fora da P05: construí-lo para servir também à P08 e à P09 | Lyra |
| **4. Corrida** | P08, P09, P10, M06 a M10 | Depende do D1 (Mapbox nativo, C-12) e, para dados reais, do S4. **Antes de começar:** PP-10 (rota única), PP-11 (190) e PP-12 (contrato). Ordem sugerida: passageiro P08 → P09 → P10; motorista M06 → M07 → M08 → M09 → M10, uma instância da Lyra por app | Lyra + Vega |
| **5. Contas e histórico** | P11, P13, P14, M12, M13, M14 | Só interface sobre `me()`; P14 e M14 dependem do número do WhatsApp confirmado para o app. **Antes de começar:** PP-14, PP-15, navegação por abas de verdade no motorista (M12) e a rota de exclusão de conta (Vega) | Lyra |
| **6. Painel** | A01 a A07 pelo portão (desktop, tablet e celular) | Já tem os estados; falta prova visual e consistência de tokens | Lyra + Íris |
| **Bloqueadas** | P12 (exceto formas de pagamento), M03, M04, M11 (saque), contato na corrida | Decisões 3, 4, 5, 6, 7, 9, 11 e 12 | Dono |

**Primeiro passo concreto:** a onda 0(a). Sem as sondas e as capturas, todo "pronto" volta a ser opinião.

---

## Decisões e divergências levantadas pelas fichas das ondas 3 a 5 (22/11/2026, noite)

Continuam a numeração do padrão. **Pertencem ao `docs/padrao-premium-telas.md`** (§0 para as PP, §18.2 para as D): estão aqui
porque esta tarefa só podia escrever em `docs/fichas-de-tela/`. O Atlas move para lá ao aceitar.

### Decisões em aberto

| # | Assunto | Recomendação | Fichas | Quem decide |
|---|---|---|---|---|
| **PP-10** | Corrida numa rota só, com estados: passageiro P07 + P08 + P09 em `/corrida` (P10 à parte); motorista M07 + M08 + M09 em `/corrida` (M10 à parte) | Sim. O mapa nativo não é montado de novo a cada fase (custo e piscada), a passagem "buscando → encontrado" acontece sem troca de tela, e a ressincronização com o servidor mora num lugar só. Hoje são 4 rotas que se redirecionam umas às outras (`buscando.tsx:29-49`, `a-caminho.tsx:32-48`, `em-andamento.tsx:23-38`, `concluida.tsx:47-62`) | P07, P08, P09, M07, M08, M09 | Atlas |
| **PP-11** | "Ligar 190" como recurso de emergência **antes** da central do S4 (`POST /v1/trips/:id/sos`) | Sim. Hoje o "SOS" é um botão que não faz nada (`SafetyActionsRow.tsx:44-50`), o que é pior que não ter. O 190 é real, não depende de backend, e o texto não pode sugerir que a VuumBora é avisada | P08, P09, P14, M09, M14 | **Dono** (segurança e responsabilidade) |
| **PP-12** | Contrato: `TripDriverSummary` (`packages/api-client/src/passenger/types.ts:58-62`) só tem primeiro nome e placa; falta **modelo e cor do veículo** (o plano prevê, `plano-sistema-arquitetura.md:615`) e a nota. `RideOffer` (`packages/domain/src/driver/index.ts:33-46`) não tem **distância e duração da viagem** | Acrescentar os três, arredondando os da oferta como os do embarque. Sem modelo e cor, o passageiro não reconhece o carro: é segurança, não estética | P08, P09, M06 | Nova (confere) + Vega |
| **PP-13** | Depois de finalizar a corrida, o motorista continua online? | Sim (o servidor mantém `online`; para parar, a chave da M05). O `DriverPhase` tem `completed` e não diz o que vem depois (`packages/domain/src/driver/index.ts:8-16`) | M10 | Atlas + Nova |
| **PP-14** | Histórico do motorista só com bairros (sem rua e número) | Sim: minimização (LGPD). O endereço exato serviu durante a corrida; guardado por meses, é o endereço de casa de outra pessoa | M12, M14 | Atlas, com o Órion |
| **PP-15** | Linha de lista sem destino real **não aparece** (nem com aviso de "ainda não disponível") | Sim. O perfil do passageiro tem 6 de 7 linhas que só avisam (`perfil.tsx:77-118`): parece protótipo. O aviso de indisponível fica só para o que existe e está fora por um motivo passageiro (sem rede, manutenção) | P13, P14, M13 | Atlas |

### Divergências novas entre a prancha (ou o protótipo) e o decidido

| # | Tela | Prancha ou protótipo | Recomendação | Dono? |
|---|---|---|---|---|
| D-31 | P08, P09 | ETA "5 min" em amarelo; mensagem e ligar como botões amarelos cheios | ETA em `textPrimary` (amarelo não é cor de dado, igual ao preço na P05); contato oculto até a decisão 11 e, quando existir, em botões neutros | Não |
| D-32 | P07, P08, P09, M09 | Seta "←" no cabeçalho durante a corrida | Sem seta: em corrida ativa não se volta (`buscando.tsx:11-17`); o voltar do Android minimiza o app | Não |
| D-33 | P09 | "Cancelar corrida" na tela da corrida em andamento | Cancelar só até `driver_arrived` (`trip-lifecycle.ts:65`); na P09 o pé é Segurança | Não (regra do domínio) |
| D-34 | M06 | "×" no topo; embarque com rua e número; "Valor da corrida"; nenhum contador | Sem "×" (repete o Recusar); só bairro (decidido em 22/11); "Ganho estimado" (o campo do contrato é `estimatedPayout`); contador obrigatório (spec: expiração) | Rótulo do valor: **sim**, decisão 7 |
| D-35 | M08, M09 | Sem mapa; foto, nota e "127 viagens" da passageira | Seguir a prancha **sem mapa** (a navegação é externa, decisão 10; o princípio 6 do padrão cede aqui); sem foto, nota nem contagem (D-19, D-27) | Só se a decisão 10 for navegação dentro do app |
| D-36 | M12, M13 | Seta "‹" em telas que são abas; o primeiro valor do histórico em amarelo; o Perfil sem barra de abas | Aba não tem seta; valor em `textPrimary`; o Perfil mostra a barra (é a 4ª aba da M05) | Não |
| D-37 | M13 | Sem "Sair da conta"; câmera no avatar | "Sair da conta" no pé (decidido: mora na M13); sem câmera (a foto do motorista é a verificada, e trocá-la pede nova verificação) | Não |
| D-38 | P10, P11, M10 | O protótipo detalha o comprovante com "Tarifa por distância", "Tarifa por tempo" e "Taxa de serviço" (`mockTripHistory.ts:55-58`) | Só total e forma de pagamento até a decisão 7 dizer o que cada lado vê; "Taxa de serviço" sugere uma cobrança do passageiro que ninguém decidiu | **Sim**, decisão 7 |

### Pendências que as fichas não resolvem

- **Aba "Ganhos" do motorista** sem destino (`apps/driver/app/(app)/index.tsx:67`; `perfil.tsx:45`), e a M11 está bloqueada
  em parte. Opções: M11 parcial (total do dia e corridas, sem saldo nem saque, D-22) ou esconder a aba até a M11 existir
  (a barra fica com 3 abas e diverge da prancha). Decisão do Atlas, antes da onda 5.
- **Rota de histórico do motorista** não existe no plano (`plano-sistema-arquitetura.md:625-640`): pedido de contrato (M12).
- **Número do WhatsApp para os apps:** o do site é decidido; o dono confirma se o mesmo atende passageiro e motorista (P14, M14).
- **Prazos de produto sem dono:** busca demorada (P07, proposto 2 min), proximidade do embarque (M07, 200 m), distância do
  destino ao finalizar (M09, 500 m), espera mínima antes do "passageiro não apareceu" (M08, decisão 15).
