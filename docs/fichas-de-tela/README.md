# Fichas de tela do VuumBora: índice, inventário e ordem de tratamento

Autor: Apolo · 22/11/2026 · régua: `docs/padrao-premium-telas.md` · template: `_template.md`

Uma ficha por tela. A ficha é o contrato entre a direção de arte (Apolo), a implementação (Lyra) e a verificação (Íris): a
Lyra constrói o que está nela, a Íris reprova o que diverge dela. Mudou a tela, muda a ficha **antes** do código.

**Estado das fichas:** completas, as de P01 a P06 e M01 a M05. M03 e M04 descrevem telas **bloqueadas** por decisão (não
construir o conteúdo antes). As demais telas têm só a linha do inventário abaixo; a ficha delas nasce na onda em que entram.

| Ficha | Tela |
|---|---|
| `P01-boas-vindas.md` | Boas-vindas |
| `P02-entrar-e-criar-conta.md` | Entrar, criar conta, código, esqueci e redefinir a senha |
| `P03-inicio.md` | Início |
| `P04-origem-e-destino.md` | Origem e destino |
| `P05-categoria-e-orcamento.md` | Categoria e orçamento |
| `P06-confirmacao.md` | Confirmação |
| `M01-entrar.md` | Entrar (motorista) |
| `M02-criar-conta.md` | Criar conta (motorista) |
| `M03-veiculo-e-documentos.md` | Veículo e documentos (bloqueada) |
| `M04-analise-cadastral.md` | Análise cadastral (bloqueada) |
| `M05-painel-do-motorista.md` | Painel do motorista |

---

## Inventário de todas as telas

Lido no código em 22/11/2026, **sem rodar os apps**. "Nota" é a da auditoria de 18/11 (Expo Web), quando houve. "Recorte" é a
tela correspondente na prancha de 22/11 (coordenadas em `docs/padrao-premium-telas.md` §18.1).

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
| P07 | Buscando motorista | `(app)/buscando.tsx` | UI (simulador) | 3 | — (herda P05) | Cancela sem confirmar (`:50-53`); sem estado "nenhum motorista" (critério 2 da spec); destino laranja (`:76`); sem mapa por trás | 3 |
| P08 | Motorista atribuído | `(app)/a-caminho.tsx` | UI (simulador) | 4 | Corrida em andamento | Sem mapa (A5); Ligar/Mensagem/SOS sem ação; título trunca (`ScreenHeader`); foto e contato dependem da decisão 11 | 4 (depende do D1) |
| P09 | Corrida em andamento | `(app)/em-andamento.tsx` | UI (simulador) | 3 | Corrida em andamento | Metade da tela vazia, sem mapa (E1); barra de progresso chapada (E3); ETA sem destaque (E5) | 4 (D1) |
| P10 | Viagem concluída | `(app)/concluida.tsx` | UI | 4,5 | — (herda P11) | F1 aparentemente tratado (os estilos usam `edgeBottom`, `:188,203,212`), **não medido**; avaliação só local; recibo fabricado | 4 |
| P11 | Histórico | `(app)/historico.tsx`, `historico-detalhe.tsx` | UI | não auditada | Histórico | Filtros em chip local (C-16); dados fabricados; sem esqueleto nem erro de carga (só vazio, `historico.tsx:77`) | 5 |
| P12 | Pagamento / carteira | — | — | — | Carteira | Não existe. Construir só "Formas de pagamento" (D-13); saldo, transferir e cupons dependem das decisões 3, 4, 5 e 12 | bloqueada (3) |
| P13 | Perfil e configurações | `(app)/perfil.tsx`, `configuracoes.tsx` | parcial | não auditada | Meu Perfil, Configurações | Dados de exemplo (`perfil.tsx:73`); ícones de linha amarelos (`:78…`, D-30); linhas sem ação com aviso; tema e idioma com opção única (D-15) | 5 |
| P14 | Ajuda e segurança | — | — | — | — (herda o Suporte do motorista) | Não existe; "Ajuda e suporte" do perfil sem destino; canal = WhatsApp (decidido para o site) | 5 (canal do dono) |
| dev | Catálogo, teste do Mapbox | `(dev)/catalogo.tsx`, `(dev)/mapbox-check(.web).tsx` | dev | — | — | Fora do build de loja (A1, `0fe8883`). Não tratar | — |

### Motorista

| ID | Tela | Arquivo | Estado | Nota | Recorte | Lacunas principais | Onda |
|---|---|---|---|---|---|---|---|
| M01 | Entrar | `(auth)/entrar.tsx` (+ `codigo`, `esqueci-senha`, `redefinir-senha`, `termos`, `privacidade`) | **real** | — | Login | Sem brilho de topo (`:118`); "Esqueci" acima do CTA (`:189`, a prancha põe embaixo); "Mostrar" amarelo | 1 |
| M02 | Criar conta | `(auth)/criar-conta.tsx` | **real** | — | Cadastro | Sem brilho (`:194`); lockup no lugar do selo; o aviso "conta ≠ cadastro" fica (D-04) | 1 |
| M03 | Veículo e documentos | — | — | — | Documentos | Bloqueada: decisão 9, lista da STTU, gate público | bloqueada |
| M04 | Análise cadastral | — | — | — | — (herda) | Bloqueada; hoje o painel finge aprovação (`index.tsx:54`) | bloqueada |
| M05 | Painel | `(app)/index.tsx` | UI | 4 | Dashboard Inicial | Começa online e aprovado (`:48,54`); oferta, mapa, banner amarelo, atalhos e "Sair" na mesma tela (`:90-124`); abas sem ação (`:73-84`); "Taxa de aceitação" (`:100`); São Paulo (`:97`) | 2 |
| M06 | Nova corrida | dentro de `(app)/index.tsx` (`NewRideOfferCard`) | UI | (4) | Solicitação de Corrida | Não é tela cheia; nome do passageiro antes do aceite; "Dinâmica +20%"; selo "Nova corrida" amarelo cheio (`NewRideOfferCard.tsx:147`); Recusar 52 × Aceitar 56 | 4 |
| M07 | A caminho do embarque | — | — | — | Navegação (GPS) | Não existe. Navegação passo a passo depende da decisão 10 (recomendado: app externo, D-21) | 4 (D1 + decisão 10) |
| M08 | Embarque confirmado | — | — | — | Corrida em Andamento (topo) | Não existe | 4 |
| M09 | Corrida em andamento | — | — | — | Corrida em Andamento | Não existe; sem nota do passageiro (D-19); contato depende da decisão 11 | 4 |
| M10 | Finalizar corrida | — | — | — | — (herda M09) | Não existe; repasse depende da decisão 7 | 4 |
| M11 | Ganhos | — | — | — | Ganhos | Não existe; saque e saldo dependem das decisões 6 e 7 (D-22) | bloqueada em parte |
| M12 | Histórico | — | — | — | Histórico de Corridas | Não existe; rótulo do valor depende da decisão 7 (D-23) | 5 |
| M13 | Perfil e documentos | — | — | — | Perfil, Documentos | Não existe; "Sair" mora hoje no painel (`index.tsx:116-124`); "Forma de recebimento" depende das decisões 3 e 6 | 5 |
| M14 | Suporte e segurança | — | — | — | Suporte | Não existe; WhatsApp decidido; "Solicitar reavaliação" depende de processo inexistente (D-26) | 5 |

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
| **3. Pedido** | P05 + P06 (PP-3), P07 | Antes do mapa real, com `MapPreviewBackground` e selo; o layout já nasce no formato mapa + painel (C-02) | Lyra |
| **4. Corrida** | P08, P09, P10, M06 a M10 | Depende do D1 (Mapbox nativo, C-12) e, para dados reais, do S4 | Lyra + Vega |
| **5. Contas e histórico** | P11, P13, P14, M12, M13, M14 | Só interface sobre `me()`; P14 e M14 dependem do canal oficial | Lyra |
| **6. Painel** | A01 a A07 pelo portão (desktop, tablet e celular) | Já tem os estados; falta prova visual e consistência de tokens | Lyra + Íris |
| **Bloqueadas** | P12 (exceto formas de pagamento), M03, M04, M11 (saque), contato na corrida | Decisões 3, 4, 5, 6, 7, 9, 11 e 12 | Dono |

**Primeiro passo concreto:** a onda 0(a). Sem as sondas e as capturas, todo "pronto" volta a ser opinião.
