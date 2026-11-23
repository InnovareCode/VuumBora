# Veredito da Íris — Portão de qualidade, onda 2 do padrão premium (telas "casa")

**VEREDITO: APROVADO, COM RESSALVAS.**

**Candidata:** `main` (`b046474`) + merge (octopus, `git merge --no-edit`) de `fatia/f09-onda2-passageiro`
(`1cf7bf3`) + `fatia/f09-onda2-motorista` (`07ed974`). Montada em clone limpo fora do repositório real
(`git clone --no-local` + `npm install`, Node 26.12.1), **sem nenhum conflito** — as duas fatias tocam arquivos
disjuntos (passageiro: `apps/passenger/**`, `packages/api-client/src/passenger/**`; motorista:
`apps/driver/**`), com uma única interseção esperada e sem conflito real: as duas acrescentam entradas
diferentes em `tools/qualidade-tela/screens.config.mjs` (P03/P04 e M05), que o merge combinou de forma limpa.

Telas no escopo: **P03** (início, com o menu), **P04** (origem e destino, com a busca), **M05** (painel do
motorista — offline, online, sem aprovação) e o **perfil provisório do motorista** (`/perfil`, sair da conta).

## Como medi

- `tools/qualidade-tela` com o Metro ao vivo (`dev-server.mjs`/`auth-bootstrap.mjs`, já corrigidos pelo
  Vulcano em `b046474` para entrar sozinho nas telas atrás da guarda `(app)`). Portas 9901 (passageiro) e 9902
  (motorista), acima de 9900 como pedido. Tudo rodou em cópias no meu scratchpad, nada no repositório real;
  apaguei as cópias e os scripts ad hoc ao final.
- Acrescentei uma entrada temporária `M-perfil` (`/perfil`) ao `screens.config.mjs` **só na cópia descartável**
  — a tela não tem ficha própria ainda (é a M13 provisória) e por isso não está no arquivo real.
- `capturar` + `sondas` (estilo, geometria, texto, contraste, foco) nas 4 larguras-alvo para as 4 telas; 24
  capturas, 0 erro, abertas a olho (não só o resumo numérico — lição
  [[feedback-ferramenta-qualidade-tela-export-quebrado]]).
- `lado-a-lado` (G-07b) para P03, P04 e M05 contra `alvo_passageiro_2026-11-22.png`/`alvo_motorista_2026-11-22.png`.
- **Linha de base "antes"**: clone separado de `main` pura (`b046474`, sem as duas fatias), com as mesmas rotas
  (`/`, `/destino` nos dois apps) acrescentadas ao `screens.config.mjs` só dessa cópia. Capturei as 3 telas nas
  4 larguras para comparar com o que a auditoria de 18/11 já tinha registrado nas fichas.
- **Funcional, não só visual**: dois roteiros Playwright reaproveitando `dev-server.mjs`/`auth-bootstrap.mjs`
  (login mock real via `window.__vuumboraIdentity`):
  1. Passageiro: escolhe "Shopping Midway Mall" como destino na P04, confere a categoria/preço mostrados na
     Home e segue até `/confirmacao`.
  2. Motorista: entra na P/erfil pela aba, abre "Sair da conta", testa cancelar, Esc, foco inicial, Tab ×6, e
     por fim confirma a saída — e tenta voltar para `/` sem sessão depois.
- Nada ficou na `.baseline`/`.saida` compartilhada da ferramenta nem no repositório real.

## Nota por tela (antes = nota da auditoria de 18/11 registrada nas fichas; depois = esta rodada)

| Tela | Antes | Depois | O que mudou (evidência) | Regressão? |
|---|---|---|---|---|
| P03 início | 7 (perfil "Passageira VuumBora"), rebaixada por ter saído de 8 pontos de UI legada — ver nota | **9** | ☰ + `HomeMenuSheet` no lugar da barra de 4 abas com "Mensagens" morta (D-06/PP-9); banner de indicação/10% OFF removido, espaço vazio até haver fato real (D-07/PP-6); mapa passou do topo (caixa fixa) para sangramento no pé da tela (ficha §2); avatar circular com "Passageira VuumBora" saiu, saudação virou N2 de verdade (`GreetingRow`); logo grande do cabeçalho virou logo horizontal 28pt (D-29); atalho "Agendar" (mock) saiu, ficaram os 3 da prancha | Não. G-09 real = 0 (o único achado "ultrapassaViewport" é falso positivo, ver triagem abaixo). G-10 = 0. 0 blocos amarelo (G-04). `lado-a-lado` bate em ordem/proporção/ícones/ausência de abas com a prancha — ver `.saida/lado-a-lado/P03-lado-a-lado.png` |
| P04 origem e destino | 7,5 | **8** | Título "Para onde vamos?" agora quebra em 2 linhas no lugar de truncar em 320 (corrige D1 da ficha, `ScreenHeader align="center"`); seta vira `ChevronLeft` lucide (corrige D2); origem muda de ponto amarelo para círculo verde `map.pickup`, destino para pino `map.destination` (corrige a inconsistência do §4 do padrão); `RouteInputCard`/`PlaceRow`→`ListRow`(C-08)/`SectionHeader`(C-07, selo embaixo do título, corrige a lacuna 2)/`FooterActions`(C-04) entraram, como a ficha pedia | **Sim, uma: endereço trunca em 1 linha, não 2** (ver triagem abaixo — defeito real, não falso positivo) |
| M05 painel do motorista | 4 (a pior tela do produto na auditoria) | **9** | Começa **offline** (`useState(false)`, corrige metade da lacuna 1/PP-5); barra caiu de 5 para 4 abas (Início/Ganhos/Histórico/Perfil, corrige a lacuna 6); avatar com iniciais "CS" no lugar da foto demo (corrige D-27); banner "Alta demanda" amarelo, oferta embutida com nome+"Dinâmica +20%" e atalhos (Navegar/Histórico/Suporte) saíram inteiros (corrige lacunas 2/3/4); grade de métricas fixa em 2×2 nas 4 larguras, sem truncar `R$ 247,90` em 430 (corrige a lacuna 9, medido); 1 único bloco amarelo (CTA/chave), confirmado pela sonda (`contagemAmarelo:1`); "Sair da conta" saiu do painel para o perfil (corrige a lacuna 8) | Não, no que foi tocado. **Duas pendências pré-existentes continuam** (ver ressalvas): `registrationApproved` ainda fixo em `true` (metade da lacuna 1), e "Taxa de aceitação" não virou "Tempo online" (lacuna 7/D-17) |
| M-perfil (provisório, sem ficha) | — (não existia) | **8** | Tela nova, assumidamente provisória (comentário no próprio código: "quando a M13 existir, esta tela é descartada"). Avatar+nome+e-mail, `MockBadge`, `ListRow` "Sair da conta" com `DangerButton`/`ConfirmDialog`, 4 abas iguais à M05 | N/a (tela nova). Funciona de ponta a ponta, ver seção própria |

**Todas as 4 telas ficam com nota ≥ 7 — meta batida.** P03 e M05 saltaram para perto do teto; P04 fica abaixo
das outras só por causa do defeito de truncamento abaixo.

## Triagem dos achados do Vulcano

### `ultrapassaViewport: 2` em P03 (todas as 4 larguras) — **FALSO POSITIVO**

Medido com um script à parte (fora da sonda, para inspecionar os ancestrais): os dois elementos flagrados são a
`<Image>` do `MapPreviewBackground` (e seu wrapper) dentro do mapa "sangrando" (`HomeMapPreview bleed`). A
`<Image resizeMode="cover" style={StyleSheet.absoluteFill}>` do React Native Web, sem `width`/`height` CSS
explícitos, não estica para o tamanho do container quando o pai não tem dimensão própria fixa — ela assume o
tamanho **intrínseco do arquivo**, que é **exatamente 1170×1560px** (conferido: `mapa-escuro-natal.jpg` tem
1170×1560 de verdade). Isso faz a `<Image>` (e a `<div>` que a React Native Web gera ao redor) medir 1170×1560
via `getBoundingClientRect()` **independente da largura do viewport** (320 a 430 davam sempre 1170×1560) — dados
que a sonda de geometria lê corretamente.

A prova de que é inofensivo: o ancestral imediato (o card do `HomeMapPreview`, `overflow:'hidden'`) mede
**390×260** (ou o equivalente por largura), exatamente o esperado — e é ele quem corta visualmente a imagem
oversized. Abri as 24 capturas a olho: o mapa aparece limpo, sem nada vazando da tela, nas 4 larguras. A sonda
de geometria (`G-09`) lê o retângulo "cru" de cada elemento e não considera `overflow:hidden` de um ancestral —
por isso acusa um elemento que está, na prática, 100% contido. **Não é defeito do produto; é limitação conhecida
da sonda**, registrada agora em `docs/qualidade-tela.md`-style na minha memória (ver handoff) para a próxima
rodada não repetir a investigação. O mesmo padrão existe em `DriverMapPreview` (M05 online) — mesma causa,
mesmo veredicto, não testado ao vivo porque a sonda só capturou o estado offline.

### `textoTruncado: 3` em P04 (todas as 4 larguras) — **DEFEITO REAL**

Os 3 elementos são os endereços de "Casa", "Trabalho" e "Shopping Midway Mall" em `PlaceRow` → `ListRow`
(`value={place.address}`). `packages/ui/src/ListRow.tsx:69` tem `numberOfLines={1}` fixo no texto `value` — mas
a ficha P04 §5 ("Texto longo") pede explicitamente **2 linhas** para o endereço no resultado, não 1. Exemplo
medido: "Av. Engenheiro Roberto Freire, 3000 — Capim Macio, Natal - RN" (`scrollWidth` 417 contra `clientWidth`
250) corta para "Av. Engenheiro Roberto Freire, 300…" nas 4 larguras e nos 2 estados.

Não é crítico (G-10 geral permite reticências em endereço, e o rótulo "Casa"/"Trabalho" continua claro), mas
diverge de um requisito explícito desta ficha, nesta rodada, no componente que a própria ficha pediu para usar
(C-08). **PARA O PRÓXIMO (Lyra):** `ListRow` precisa de uma prop (`valueLines`?) para o `PlaceRow` pedir 2
linhas no `value`, sem mudar o padrão de 1 linha nos outros usos do componente (perfil, configurações).

## Preço igual da Home ao recibo (F08b) — confirmado ao vivo

Roteiro real (não leitura de código): login mock → P04 → escolhe "Shopping Midway Mall" → cotação chega na Home
(`quoteCategories` real da store, nada tocado por esta onda: `git diff` contra a base confirma zero mudança em
`useRideRequestStore.ts`/`confirmacao.tsx`) → seleciona "VuumBora" (**R$ 18,90**) → "Solicitar corrida" →
`/confirmacao` mostra **"VuumBora · Chegada estimada em 3 min · R$ 18,90"**. Mesmo valor nos dois lugares,
provado na tela renderizada, não deduzido do código. As categorias continuam vindo só da cotação (nenhuma lista
fixa local): confirmado tanto pelo comentário do `index.tsx` quanto pela tela mostrando só "VuumBora" e
"Conforto" (as 3 categorias desligadas por padrão — Motorista mulher/Entrega/Pet — não aparecem, como esperado).

## Motorista consegue sair da conta pelo perfil — confirmado ao vivo, nos dois sentidos

Roteiro real: aba Perfil → "Sair da conta" abre `ConfirmDialog` → **Cancelar**: fecha, continua em `/perfil`,
sessão intacta. Reabri o diálogo → **Esc**: fecha sem deslogar (mesmo resultado do Cancelar) → reabri de novo →
**Sair**: desloga de verdade, cai em `/entrar`; tentando voltar para `/` manualmente depois, a guarda de rota
barra e manda de volta para `/entrar` (sem sessão residual). Foco: abre já em "Cancelar" (nunca no botão
destrutivo), e 6 toques de Tab alternam só entre "Sair"/"Cancelar" (armadilha de foco funcionando) — testei só
Tab para frente, não Shift+Tab (ver pendências).

## Ressalvas (não bloqueiam o veredito, mas precisam de dono)

1. **P04: endereço trunca em 1 linha** (defeito real acima) — Lyra.
2. **M05: "Taxa de aceitação" continua** em vez de "Tempo online" (ficha §11 lacuna 7, D-17) — já era uma
   pendência conhecida e disclosed na própria ficha, não uma regressão desta rodada; decisão do Atlas se entra
   nesta onda ou na próxima.
3. **M05: estado "sem aprovação" não é alcançável na UI hoje.** `registrationApproved` continua fixo em `true`
   no código (comentário explícito: "DEMO... nunca usar como estado de produção"), sem parâmetro para forçar
   `false`. O componente que renderiza esse estado (`OnlineToggle`) já está pronto e correto (confirmado lendo o
   código: mostra o cartão "Cadastro em análise" quando `approved=false`), mas não dá para fotografar/provar
   isso ao vivo sem editar o código manualmente — não fiz isso na candidata real, só confirmei a lógica lendo.
   Registrar como pendência de teste, não como defeito de produto (é esperado até a decisão PP-5 entrar).
4. **Atalhos Casa/Trabalho/Favoritos na P03 continuam sem `onPress`** (toque não faz nada, sem aviso de
   indisponível) — **confirmei que já era assim ANTES da onda 2** (`git show dfb0391` do `index.tsx` antigo:
   mesmos 3 itens sem `onPress`, só "Agendar" tinha `mock:true`). Não é regressão desta fatia, mas é G-19 e
   deveria entrar no próximo passe — ninguém escreveu uma ficha dizendo "está aberto", então registro aqui.
5. **Foco do `ConfirmDialog` do perfil**: testei só Tab para frente (6 toques, alternou certo entre os 2
   botões); não testei Shift+Tab nesta rodada — meu padrão de sempre testar os dois sentidos
   ([[feedback-focus-trap-testar-os-dois-sentidos]]) não foi seguido à risca aqui por tempo. Dado que o
   componente usa o `ModalFocusTrap` nativo do React Native Web (mesmo mecanismo do `ConfirmDialog` já usado em
   "cancelar corrida", pré-existente e não tocado por esta fatia), o risco é baixo, mas fica como pendência.
6. **`semIndicadorDeFoco`** apareceu em todas as combinações (1 a 4 por tela) — não investiguei elemento a
   elemento nesta rodada; fica para a próxima passada de acessibilidade dedicada.

## O que não testei (fora do escopo desta rodada)

- Fonte 200%, teclado físico em aparelho, TalkBack/VoiceOver, emulador Android — fora do alcance da ferramenta
  (navegador apenas).
- Estados "carregando", "erro de carga" e "permissão negada" das 4 fichas — a ferramenta desta rodada só cobre
  "padrão" e "sem-rede" (P03/P04) e só "padrão" (M05, porque "online"/"sem aprovação" dependem de interação ou
  de um valor hardcoded, não de parâmetro de URL).
- M05 "online" (com `DriverMapPreview`) não foi fotografado pela sonda automática (exige tocar "Ficar online" e
  esperar a confirmação simulada de 600ms) — mas o código e o padrão visual são idênticos ao `HomeMapPreview` já
  triado como falso positivo, então não há sinal de risco novo ali.

## Para o próximo

- **Lyra:** `ListRow` ganhar uma forma de pedir 2 linhas no `value` (ou um componente próprio para endereço),
  para fechar a P04 §5 sem quebrar os outros usos do componente.
- **Atlas/dono:** decidir se "Taxa de aceitação"→"Tempo online" (D-17) e o `onPress` dos atalhos da Home
  (G-19, pré-existente) entram nesta onda ou ficam para a próxima — nenhum dos dois bloqueia este portão.
- **Quem mexer em `HomeMapPreview`/`DriverMapPreview` de novo:** o padrão `<Image absoluteFill>` sem
  `width`/`height` explícitos no RN Web mede o tamanho intrínseco do arquivo, não do container — inofensivo
  enquanto o pai tiver `overflow:hidden` do tamanho certo (é o caso hoje), mas values quebra se alguém tirar o
  `overflow:hidden` por engano.

Capturas, sondas e `lado-a-lado` ficaram em `C:\Users\...\scratchpad\iris-onda2\tools\qualidade-tela\.saida\`
(cópia descartável, apagada ao final desta tarefa) — se alguém precisar reabrir a investigação, o roteiro acima
é reproduzível em poucos minutos com a ferramenta oficial.

## Ressalvas `ea1ad77` (conferência de 22-23/11/2026)

**VEREDITO: APROVADO.**

Candidata: `fatia/f09-onda2-ressalvas` (`ea1ad77`), um commit sobre a `main` (`ac747e8`) —
`fix(apps,ui): ressalvas do portao da onda 2 (endereco em 2 linhas, atalhos da Home com acao, estado sem
aprovacao alcancavel em desenvolvimento)`. Toca `apps/driver/app/(app)/index.tsx`,
`apps/passenger/app/(app)/index.tsx`, `apps/passenger/src/components/destination/PlaceRow.tsx`,
`packages/ui/src/ListRow.tsx` e `tools/qualidade-tela/screens.config.mjs` (acrescenta a entrada `M05b`).

**Como medi:** `git archive ea1ad77` para uma cópia limpa no meu scratchpad (fora do repositório real),
`npm install` de verdade (symlinks de workspace conferidos com `ls -la node_modules/@vuumbora/*` antes de
confiar — [[feedback-cp-r-quebra-symlink-workspace]]), cache global do Metro limpo antes de começar
([[feedback-cache-global-metro-envenenado]]). `tools/qualidade-tela capturar`+`sondas` nas 4 larguras para
P03/P04/M05/M05b (32 combinações, 0 erro, abertas a olho). Um roteiro Playwright próprio (reaproveitando
`dev-server.mjs`/`auth-bootstrap.mjs`/`browsers.mjs` da própria ferramenta, login mock real) cobrindo os 5
pontos pedidos — 12 asserções, todas passando na versão final do roteiro (duas falharam na 1ª tentativa por
erro do MEU harness, não do produto — corrigidas e revalidadas antes de reportar, ver abaixo). `npm run
typecheck` limpo nos 8 workspaces. Portas 10301/10302 (sondas) e 10321/10322/10331/10332 (roteiro/debug),
todas acima de 10300 como pedido; nada ficou preso (`netstat` conferido no final). Cópia, export de produção
e scripts apagados ao terminar.

1. **P04 — endereço em até 2 linhas, lugares salvos E resultados de busca.** Confirmado visualmente: em 320px,
   "Casa" (menor) cabe inteiro em 2 linhas; "Trabalho" (63 caracteres, `Av. Engenheiro Roberto Freire, 3000 —
   Capim Macio, Natal - RN`) ainda corta na 2ª linha — exatamente o aceito pela ficha. Provado também por
   computed style: o nó de texto real tem `webkit-line-clamp: 2` tanto no `PlaceRow` de "Trabalho" (lugar
   salvo) quanto no resultado de busca por "terminal" (`Terminal Rodoviário de Natal`, mesmo componente
   `PlaceRow`→`ListRow`, usado também pelos recentes) — a correção é no componente compartilhado, não só na
   lista de salvos. Em 360/390/430px nenhum truncamento. **Achei um falso positivo no meu próprio roteiro**
   na 1ª rodada (`webkitLineClamp=none`): meu seletor pegava um `<div>` ancestral, não o nó-folha com o texto
   — troquei por uma busca pelo nó-folha de verdade (script `debug-p04.mjs` à parte confirmou o DOM real antes
   de eu corrigir o roteiro principal), regra [[medir-antes-de-afirmar]].
2. **P03 — Casa/Trabalho definem destino e cotam sem navegar; Favoritos abre a P04.** Provado ao vivo: tocar
   "Casa" mantém a URL em `/`, o endereço de Casa aparece na barra de busca e a cotação carrega; tocar
   "Trabalho" faz o mesmo sem navegar; tocar "Favoritos" leva para `/destino` (lugares salvos). Nenhum toque
   morto — os 3 atalhos têm `onPress` agora (fecha o G-19 registrado como pendência na rodada anterior).
3. **M05b (`/?devAprovado=false`) — estado "sem aprovação".** Capturas confirmam: sem chave/alternador, sem
   CTA "Ficar online", aviso "Cadastro em análise. Você poderá ficar online após a aprovação." no lugar do
   texto "Você está Offline" + chave, e as 4 métricas em "—" em vez de valor. **Em produção o parâmetro não
   muda nada** — confirmado de verdade, não só por leitura de código: gerei um build de produção real
   (`expo export --platform web`, `VUUMBORA_BUILD_PROFILE=production`) e inspecionei o bundle minificado da
   rota `/`: `__DEV__` não aparece em lugar nenhum (eliminado em tempo de build) e a variável que guarda
   `registrationApproved` está **hardcoded `const D=!0` (true)** — o `devAprovado` do `useLocalSearchParams`
   continua sendo lido (variável morta, não removida pelo minificador), mas não influencia mais nada: o
   `__DEV__ && ...` já virou uma constante antes do deploy.
4. **Regressão: categorias só da cotação + preço igual Home→recibo.** Provado ao vivo com o fluxo NOVO desta
   rodada (escolher "Shopping Midway Mall" nos lugares salvos → Home mostra só "VuumBora"/"Conforto", sem as 3
   categorias desligadas por padrão → **R$ 18,90** na Home → mesmo valor em `/confirmacao`). `useRideRequestStore.ts`/`confirmacao.tsx` continuam fora do `git diff` deste commit.
5. **Shift+Tab no `ConfirmDialog` do perfil do motorista** (pendência aberta na rodada anterior). Testei os
   dois cantos que faltavam: Shift+Tab a partir do primeiro elemento (Cancelar, foco inicial) fica preso
   dentro do diálogo e vai para o último (Sair) — não escapa para o conteúdo de fundo; Tab a partir do último
   (Sair) envolve de volta para o primeiro (Cancelar). Diálogo continua aberto depois da navegação por
   teclado inteira. Confirma a expectativa do veredito anterior: é o `ModalFocusTrap` nativo do RNW, mesmo
   mecanismo já usado em "cancelar corrida", funcionando nos dois sentidos aqui também — ver
   [[feedback-focus-trap-testar-os-dois-sentidos]]. **Achei um erro de rótulo no meu próprio roteiro** nesta
   checagem (esperava o foco voltar para "Cancelar" depois de uma sequência Tab→Shift+Tab que, pela lógica,
   só podia voltar para "Sair" — o produto estava certo, a expectativa do teste é que estava mal escrita;
   corrigi o roteiro para testar o canto que realmente faltava — Tab a partir do último elemento — em vez de
   repetir o mesmo canto já provado com uma conta errada).

**Nada regrediu.** `npm run typecheck` limpo nos 8 workspaces (`admin`, `api`, `driver`, `passenger`,
`api-client`, `domain`, `tokens`, `ui`) — nenhuma das 5 mudanças quebrou tipo em quem consome `ListRow`
(perfil, configurações continuam com `valueLines` padrão 1, não especificado, comportamento idêntico ao
anterior).

**Pendências que seguem de pé (fora do escopo desta conferência, já registradas no veredito original):**
"Taxa de aceitação"→"Tempo online" (D-17) e `semIndicadorDeFoco` elemento a elemento — nenhuma delas foi
tocada por este commit.

Ver [[project-portao-onda2-telas-casa-qa]] (rodada anterior) e [[feedback-harness-passada-9]]-style de lição
nova: dois achados do meu PRÓPRIO roteiro (não do produto) nesta rodada — registrado na memória para a
próxima conferência não repetir o mesmo tipo de seletor/expectativa errada.
