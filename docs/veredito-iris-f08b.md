# Veredito da Íris — F08b (corrida do passageiro sobre o contrato) + conferência da P02b

**VEREDITO FINAL: APROVADO** para `c5a88a2` (F08b, branch `fatia/f08b`) e para `ccd4aad` (P02b, branch
`fatia/f09-p02b`). Testado em cópias limpas (`git archive`), no navegador, com o Metro vivo — nunca export
estático. Nenhum achado bloqueante nas duas.

---

## F08b — corrida do passageiro sobre o adaptador mock + oferta do motorista só com bairros

**Commit testado:** `c5a88a2` ("feat(apps): corrida do passageiro sobre o contrato da F08 e oferta do motorista
so com bairros (F08b)"), branch `fatia/f08b`, sobre a `main` em `394a0d6`. Cópia limpa via `git archive c5a88a2`
(não `git clone` — já tinha o commit candidato embutido sozinho). Rodado em 22/11/2026, noite.

**Ambiente:** `expo start --web` (Metro vivo) para os dois apps, portas **8810** (passageiro) e **8811**
(motorista) — acima de 8800, pedido do Atlas; `tools/qualidade-tela/lib/dev-server.mjs` e `lib/browsers.mjs`
reaproveitados tal como estão (nenhuma linha de `lib/` alterada), só chamados por um script próprio
(`iris-f08b.mjs`) dentro da cópia descartável. Chromium resolvido do cache do Playwright já instalado na
máquina. Identidade mock (dev): cadastro → verificação (código fixo do mock, `123456`) → login, via
`window.__vuumboraIdentity` (o mesmo gancho de depuração que já existe no `identityClient.ts` real, nunca uma
criação minha) — único jeito de chegar ao grupo `(app)` sem backend de verdade. Script e cópia inteira
**apagados ao final** (`tools/qualidade-tela/` do repositório real não foi tocado).

### O que foi provado, ao vivo, com cliques reais (39/39 checagens)

**Passageiro — corrida inteira sobre o mock:**
- Home sem destino mostra o estado vazio ("Defina seu destino"); ao escolher um destino salvo (P04) e
  confirmar, a cotação (`port.quote` do mock) chega e preenche a Home com estado de carregando → pronto.
- **D-08/D-09 confirmadas:** Entrega, Pet e Motorista mulher **não existem no DOM** da Home (nem como card
  `data-testid`, nem como texto solto) — a lista vem inteira da cotação, nunca de catálogo fixo.
- Fluxo completo Home → Confirmação → Busca → Motorista a caminho (P08) → Em andamento (P09) → Concluída/recibo
  (P10), na cadência real de ~2,6 s por etapa (sem acelerar nada).
- **Nunca pisca de volta para a Home:** amostrei `window.location.pathname` a cada 20 ms do clique em
  "Solicitar" (na Confirmação) até a tela de busca aparecer — a URL nunca passou por `/`.
- **Cancelamento na busca** (sem motorista ainda) e **cancelamento com motorista atribuído**: nos dois casos a
  tela volta para a Home e, esperando mais que o próximo passo agendado (3,2 s > os 2,6 s do simulador), nada
  reaparece sozinho — a corrida fica de fato parada (`stopRideSimulation`/`generation` provados por
  observação, não só lidos no código).
- **Segundo pedido em seguida** (depois de completar o primeiro até o recibo e voltar pelo "Voltar para o
  início"): novo destino, nova cotação, novo pedido, chega à busca normalmente — sem resíduo do ciclo
  store↔simulador que o próprio commit diz ter fechado.
- **Preço rastreável até a MESMA cotação pedida:** a soma das duas primeiras linhas do recibo ("Tarifa por
  distância" + "Tarifa por tempo", que são `baseFare` fatiado) bateu, centavo a centavo, com o preço mostrado no
  card da Home no momento do pedido (1890¢ = R$ 18,90 nos dois lados).
- **Trocar categoria depois do pedido não muda o preço pedido:** com a corrida já em `searching_driver`, chamei
  `store.setCategory('conforto')` (não existe caminho de UI para isso — usei um gancho de depuração que só
  existe nesta cópia descartável, `window.__irisRideStore`, nos mesmos moldes do `__vuumboraIdentity` real) e
  `requestedCategory` continuou `vuumbora`; o recibo manteve o preço da categoria pedida, não da selecionada
  depois.

**Motorista — cartão de oferta:**
- Com embarque e tempo zerados (caso de borda), o card mostra **"menos de 100 m"** e **"menos de 1 min"** —
  nunca "0 m"/"0 min".
- Mostra só os bairros ("Embarque: Cerqueira César", "Destino: Itaim Bibi"); nenhum endereço (rua/avenida) nem
  nome de passageiro no texto do card, nas duas colunas da rota.
- Nas 4 larguras do portão (320/340/360/430), sem overflow horizontal e com "Aceitar"/"Recusar" sempre
  visíveis.

### Mutação de prova: recibo lendo a categoria selecionada em vez da pedida

Troquei de verdade (no arquivo, não só na cabeça) o `onCompleted` de `useRideRequestStore.ts` para montar o
recibo a partir de `quoteCategories.find(categoryId selecionado)` em vez de `requestedCategory`, **reiniciei o
Metro** (o `dev-server.mjs` sobe com `CI=1`, que desliga fast refresh — uma edição no disco só é servida por um
processo novo) e rodei a MESMA checagem de preço com o mesmo roteiro (pede "vuumbora", troca a seleção para
"conforto" ainda com a corrida em voo, espera o recibo). Sob a mutação o recibo saiu com **2490¢** (preço de
Conforto) contra os **1890¢** da cotação de fato pedida — a prova **pegou** a regressão. Arquivo revertido ao
original logo em seguida (confirmado por `grep` pós-execução: o comentário original "O recibo sai da cotação
REALMENTE pedida" está de volta).

### Armadilhas do harness, registradas para não repetir

1. **`data-testid` duplicado entre telas vizinhas:** `expo-router` (web) mantém a tela anterior montada durante
   a transição — Home e Confirmação têm o MESMO testID `request-ride-button` (mesma ação, telas diferentes, de
   propósito) e um seletor `[data-testid="..."]` sem filtro de visibilidade resolve pra **2** elementos e quebra
   o clique. Corrigido com `:visible` (extensão de CSS do Playwright) + `.first()`.
2. **Dois botões "Solicitar" são DOIS passos, não um:** o da Home navega para a Confirmação; só o da Confirmação
   chama `requestRide()` de verdade. Um teste que pula a Confirmação (clica Home → espera chegar na busca)
   trava — corrigi o roteiro, não o produto.

**Pendências que valem depois (não bloqueiam):** o `[data-testid="receipt-card"]` lido via regex de texto pode
colidir com outro valor em R$ se o layout do recibo mudar (hoje funciona porque as linhas aparecem na ordem
certa); uma rodada futura pode trocar por leitura estruturada por `testID` de cada `ReceiptBreakdownRow`.

---

## P02b — botão de criar conta sempre visível no cadastro (rodapé fixo)

Pedido extra do Atlas, conferência curta. **Commit testado:** `ccd4aad`, branch `fatia/f09-p02b`, sobre a
`main` em `394a0d6`. Cópia limpa via `git archive ccd4aad`, Metro vivo na porta **8820**. Único arquivo tocado
pelo commit: `apps/passenger/app/(auth)/cadastro.tsx` (CTA, alerta de erro, resumo "Revise os campos" e "Já tem
uma conta? Entrar" saem do conteúdo rolável e vão para o `FooterActions`, mesmo padrão do M02 do motorista).

### O que foi provado (16/16 checagens), nas 4 larguras do portão (320×568, 360×800, 390×844, 430×932)

- **CTA "Criar conta" visível sem rolar**, logo na primeira renderização, nas 4 larguras.
- **Nada fica atrás do rodapé** depois de rolar o formulário até o fim — verificado pela posição do ÚLTIMO
  campo (checkbox "Li e aceito a Política de Privacidade") contra o topo do rodapé fixo, nas 4 larguras.
- CTA continua visível (dentro do viewport) depois de rolar até o fim, nas 4 larguras.
- **Enviar o formulário vazio** mostra, no rodapé (dentro do `FooterActions`, não solto no conteúdo rolável), o
  resumo "Revise os campos destacados: nome, e-mail, data de nascimento, senha, Termos de Uso, Política de
  Privacidade." — confirmado que o nó do resumo está DENTRO do nó do rodapé (`footer.contains(summary)`), não
  só visualmente perto.
- **"Já tem uma conta? Entrar"** navega de fato para `/login` (tela de login carregada, `login-screen` visível).

### Achado do meu próprio harness, não do produto (vale registrar)

Na primeira passada, o teste de "nada overlapa no fim do scroll" **reprovou** em 360×800 e 390×844
(checkbox de privacidade aparentemente atrás do rodapé). Investiguei antes de reportar como bug (regra da
casa: medir antes de afirmar) e descobri que era o MEU script, não a tela: eu rolava o `ScrollView` do RN Web
com `element.scrollTo()` direto no DOM, e esse elemento **não assume a posição programática** — o `scrollTop`
voltava a 0 sozinho. Com um scroll de verdade (`mouse.wheel` repetido, como um dedo/roda de mouse real) e
esperando os textos legais terminarem de carregar (a altura do conteúdo ainda cresce ~120 px nos primeiros
instantes, antes do segundo checkbox assentar), o checkbox de privacidade aparece **inteiro**, sem nenhuma
sobreposição — confirmado por screenshot real nas duas larguras que tinham "reprovado". Depois do conserto do
harness, as 16 checagens passam limpo.

### Sobre o aviso do Atlas (sonda de contraste)

Não rodei a sonda de contraste do ícone "i" nesta conferência — o Atlas já avisou que ela conta o fundo
translúcido do `InlineAlert` como sólido (falso 1,92:1) e que a Lyra mediu o pixel real em 7,02:1. Não reprovo
por isso; fica para quando o Vulcano consertar a sonda.

### Armadilha de ambiente, registrada (não é bug do P02b)

Numa tentativa anterior, a tela de cadastro (e a própria raiz `/`) travou com uma página em branco e o erro
`src/identity/mode.ts foi carregado diretamente — o metro.config.js deveria ter redirecionado...` — **nas DUAS
cópias** (F08b e P02b), mesmo depois de recarregar a página. Causa: cache GLOBAL do Metro
(`%TEMP%\metro-cache`, `%TEMP%\metro-file-map-expo-*`), compartilhado entre processos/cópias diferentes na
mesma máquina, ficou com uma resolução antiga/corrompida do resolver customizado (`resolveIdentityModeTarget`).
Apagar essas pastas e subir o Metro de novo resolveu nas duas cópias, de primeira. Não é regressão de nenhum
dos dois commits — é o mesmo tipo de armadilha já registrado na memória da Íris sobre cache do Metro
envenenado por execuções em paralelo.

---

## Pendências que valem depois (não bloqueiam nenhuma das duas)

- F08b: ler o recibo por `testID` estruturado em vez de regex de texto por ordem (ver acima).
- P02b: não testei foco/teclado (Tab) no rodapé fixo nem leitor de tela no resumo de erro — fora do pedido
  desta conferência curta, mas é a praça de teste natural da próxima rodada de acessibilidade.

## Aprendizado registrado na memória

- `data-testid` duplicado entre telas adjacentes do expo-router (web) exige `:visible` + `.first()`.
- Mutação de verdade em app sem test runner próprio exige editar o arquivo no disco e **reiniciar o Metro**
  (CI=1 do `dev-server.mjs` desliga fast refresh) — só reler/relançar a página não basta.
- `element.scrollTo()` direto no DOM não é confiável contra `ScrollView` do React Native Web; usar
  `mouse.wheel` (scroll de verdade) e esperar o layout assentar antes de medir posição de elementos no fim do
  scroll.
- Cache global do Metro (`%TEMP%\metro-cache`, `metro-file-map-expo-*`) pode ficar com uma resolução de
  resolver customizado corrompida entre cópias/processos diferentes na mesma máquina — limpar essas pastas
  antes de reportar "a tela não carrega" como bug do produto.
