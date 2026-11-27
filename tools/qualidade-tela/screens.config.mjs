// Matriz tela × estado × tamanho (padrão premium §14.2). Este arquivo só declara os
// 4 tamanhos do padrão e as telas de login, cadastro e boas-vindas dos dois apps —
// o escopo pedido nesta rodada (P01, P02a, P02b, M01, M02). Acrescentar uma tela nova
// é só adicionar um item em TELAS; nada no resto da ferramenta precisa mudar.
//
// Por que só "padrao" e "sem-rede" por tela, e não a lista inteira de estados da
// ficha: as demais (erro de campo, sessão expirada, carregando…) dependem de
// interações com o cliente de identidade (`mock`) que esta primeira versão não
// automatiza — ver docs/qualidade-tela.md, "o que não foi validado". "Sem-rede" é
// alcançado com `context.setOffline(true)` (parâmetro de teste do Playwright, nunca
// edição de código), como o próprio padrão pede.

export const TAMANHOS = [
  { largura: 320, altura: 568 },
  { largura: 360, altura: 800 },
  { largura: 390, altura: 844 },
  { largura: 430, altura: 932 },
];

export const ESTADOS = {
  PADRAO: 'padrao',
  SEM_REDE: 'sem-rede',
};

/**
 * `recortePrancha`: coordenadas lidas em docs/padrao-premium-telas.md §18.1, já com a
 * folga de 8px que o próprio documento pede ("para recortar, use uma folga de 8 px").
 * `pranchaArquivo` é o nome do PNG dentro de VuumBora_Claude_Design_System/referencias/.
 */
export const TELAS = [
  {
    id: 'P01',
    app: 'passageiro',
    nome: 'boas-vindas',
    rota: '/boas-vindas',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    recortePrancha: { x0: 310, y0: 4, x1: 561, y1: 516 },
  },
  {
    id: 'P02a',
    app: 'passageiro',
    nome: 'login',
    rota: '/login',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    // P02a herda o recorte de "Criar conta" (mesma coluna de campos, §18.1 nota do P02).
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    recortePrancha: { x0: 558, y0: 4, x1: 809, y1: 516 },
  },
  {
    id: 'P02b',
    app: 'passageiro',
    nome: 'cadastro',
    rota: '/cadastro',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    recortePrancha: { x0: 558, y0: 4, x1: 809, y1: 516 },
  },
  {
    id: 'M01',
    app: 'motorista',
    nome: 'entrar',
    rota: '/entrar',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 308, y0: 6, x1: 553, y1: 470 },
  },
  {
    id: 'M02',
    app: 'motorista',
    nome: 'criar-conta',
    rota: '/criar-conta',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 553, y0: 6, x1: 799, y1: 470 },
  },
  // ---- Fatia G6 (M4): P03-P06 sobre o mock do contrato de geografia e cotação ------------------------------
  // Cada ID é UM estado. Só `__DEV__` (apps/passenger/src/dev/devGeo.ts): `?devLocal=` faz a porta de localização
  // responder como o cenário (sem ele, o Chromium da ferramenta não tem permissão e a P03 cairia sempre na
  // pré-permissão); `?devGeoErro=<código>` faz a 1ª chamada da operação da tela recusar com o erro do catálogo
  // `GEO_QUOTE_ERRORS`; `?devBusca=` preenche a busca da P04; `?devPino=` abre a P04 no pino; `?devSeed=1` monta o
  // trajeto da P05/P06. Os números (preço, rota) saem sempre da cotação do mock do contrato.
  {
    id: 'P03',
    app: 'passageiro',
    nome: 'inicio',
    rota: '/?devLocal=ok',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // §18.1: "Home", 813,12,1049,508 + folga de 8px.
    recortePrancha: { x0: 805, y0: 4, x1: 1057, y1: 516 },
  },
  { id: 'P03-sem-permissao', app: 'passageiro', nome: 'inicio-pre-permissao', rota: '/?devLocal=pedir', estados: [ESTADOS.PADRAO] },
  { id: 'P03-negada', app: 'passageiro', nome: 'inicio-localizacao-bloqueada', rota: '/?devLocal=negada', estados: [ESTADOS.PADRAO] },
  { id: 'P03-erro-local', app: 'passageiro', nome: 'inicio-erro-localizacao', rota: '/?devLocal=erro', estados: [ESTADOS.PADRAO] },
  { id: 'P03-fora', app: 'passageiro', nome: 'inicio-fora-da-area', rota: '/?devLocal=fora', estados: [ESTADOS.PADRAO] },
  { id: 'P03-carregando', app: 'passageiro', nome: 'inicio-procurando-localizacao', rota: '/?devLocal=carregando', estados: [ESTADOS.PADRAO] },
  {
    id: 'P04',
    app: 'passageiro',
    nome: 'destino',
    rota: '/destino?devLocal=ok',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    // Ficha P04: "sem recorte na prancha, herda o topo da 'Escolha de categoria'" (§18.1: 1061,12,1297,508) + folga de 8px.
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    recortePrancha: { x0: 1053, y0: 4, x1: 1305, y1: 516 },
  },
  { id: 'P04-resultados', app: 'passageiro', nome: 'destino-resultados', rota: '/destino?devLocal=ok&devBusca=natal', estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE] },
  { id: 'P04-vazio', app: 'passageiro', nome: 'destino-sem-resultado', rota: '/destino?devLocal=ok&devBusca=zzzz', estados: [ESTADOS.PADRAO] },
  { id: 'P04-erro', app: 'passageiro', nome: 'destino-erro-busca', rota: '/destino?devLocal=ok&devBusca=midway&devGeoErro=geo_unavailable', estados: [ESTADOS.PADRAO] },
  { id: 'P04-sem-permissao', app: 'passageiro', nome: 'destino-sem-localizacao', rota: '/destino?devLocal=negada', estados: [ESTADOS.PADRAO] },
  { id: 'P04-pino', app: 'passageiro', nome: 'destino-pino', rota: '/destino?devLocal=ok&devPino=destino', estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE] },
  { id: 'P04-pino-fora', app: 'passageiro', nome: 'destino-pino-fora-da-area', rota: '/destino?devLocal=fora&devPino=destino', estados: [ESTADOS.PADRAO] },
  { id: 'P04-pino-erro', app: 'passageiro', nome: 'destino-pino-erro', rota: '/destino?devLocal=negada&devPino=origem&devGeoErro=geo_unavailable', estados: [ESTADOS.PADRAO] },
  {
    id: 'P05',
    app: 'passageiro',
    nome: 'categoria',
    rota: '/categoria?devSeed=1',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P05 §título: recorte "Escolha de categoria", 1061,12,1297,508 + folga de 8px.
    recortePrancha: { x0: 1053, y0: 4, x1: 1305, y1: 516 },
  },
  { id: 'P05-nao-operamos', app: 'passageiro', nome: 'categoria-fare-not-configured', rota: '/categoria?devSeed=1&devGeoErro=fare_not_configured', estados: [ESTADOS.PADRAO] },
  { id: 'P05-erro', app: 'passageiro', nome: 'categoria-rota-indisponivel', rota: '/categoria?devSeed=1&devGeoErro=route_unavailable', estados: [ESTADOS.PADRAO] },
  { id: 'P05-fora-da-area', app: 'passageiro', nome: 'categoria-fora-da-area', rota: '/categoria?devSeed=1&devGeoErro=outside_service_area', estados: [ESTADOS.PADRAO] },
  {
    id: 'P06',
    app: 'passageiro',
    nome: 'confirmacao',
    rota: '/confirmacao?devSeed=1',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P06 §título: "mesmo recorte da P05".
    recortePrancha: { x0: 1053, y0: 4, x1: 1305, y1: 516 },
  },
  // P07/P08/P09 — onda 4: unificadas na rota `/corrida` (PP-10). `?devPhase=...` força a fase
  // sem esperar os passos do simulador (ver `src/dev/useDevRidePhaseOverride.ts`), mesmo padrão
  // de `?devSeed`/`?devAprovado`. Cada ID abaixo é UM estado da mesma tela, não uma rota nova.
  {
    id: 'P07',
    app: 'passageiro',
    nome: 'corrida-buscando',
    rota: '/corrida?devPhase=searching_driver',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    // Ficha P07 §2: "sem recorte na prancha, herda o esqueleto da P05" — G-07b não se aplica.
  },
  {
    id: 'P07b',
    app: 'passageiro',
    nome: 'corrida-nenhum-motorista',
    rota: '/corrida?devPhase=failed',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'P07c',
    app: 'passageiro',
    nome: 'corrida-motorista-cancelou',
    rota: '/corrida?devPhase=driver_cancelled',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'P07d',
    app: 'passageiro',
    nome: 'corrida-cancelada-por-terceiros',
    rota: '/corrida?devPhase=cancelled',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'P08',
    app: 'passageiro',
    nome: 'corrida-motorista-a-caminho',
    rota: '/corrida?devPhase=driver_en_route',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P08 §título: recorte "Corrida em andamento", 1309,12,1536,508 + folga de 8px.
    recortePrancha: { x0: 1301, y0: 4, x1: 1544, y1: 516 },
  },
  {
    id: 'P08b',
    app: 'passageiro',
    nome: 'corrida-motorista-chegou',
    rota: '/corrida?devPhase=driver_arrived',
    estados: [ESTADOS.PADRAO],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    recortePrancha: { x0: 1301, y0: 4, x1: 1544, y1: 516 },
  },
  {
    id: 'P09',
    app: 'passageiro',
    nome: 'corrida-em-andamento',
    rota: '/corrida?devPhase=in_progress',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P09 §título: "mesmo recorte da P08".
    recortePrancha: { x0: 1301, y0: 4, x1: 1544, y1: 516 },
  },
  {
    id: 'P10',
    app: 'passageiro',
    nome: 'concluida',
    rota: '/concluida?devPhase=completed',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    // Ficha P10 §título: "sem recorte, herda a linguagem do Histórico (P11)" — G-07b não se aplica.
  },
  {
    id: 'P10b',
    app: 'passageiro',
    nome: 'concluida-avaliada',
    rota: '/concluida?devPhase=completed&devRated=1',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M05',
    app: 'motorista',
    nome: 'painel-do-motorista',
    // Fatia D6: o topo da Home é o estado REAL do cadastro (mock do K0). O "Você está offline ·
    // Ficar online" da prancha só existe com o cadastro aprovado — `?devCenario=aprovado` (só
    // `__DEV__`, ver apps/driver/src/onboarding/devScenarios.ts) leva o mock até lá.
    rota: '/?devCenario=aprovado',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 799, y0: 6, x1: 1045, y1: 470 },
    // A M05 fica atrás da guarda `(app)`: a ferramenta entra sozinha no app simulado
    // (`lib/auth-bootstrap.mjs`) antes de capturar.
  },
  {
    id: 'M05b',
    app: 'motorista',
    nome: 'painel-do-motorista-sem-aprovacao',
    // Conta recém-ligada à candidatura: o cartão do cadastro (M04 `pending_documents`) no lugar
    // do "Ficar online". É o estado em que a Home abre por padrão no app simulado.
    rota: '/',
    estados: [ESTADOS.PADRAO],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 799, y0: 6, x1: 1045, y1: 470 },
  },
  // ---- Fatia D6 (M3): cadastro do motorista sobre o mock do K0 --------------------------------
  // Cada ID é UM estado. `?devCenario=` (só `__DEV__`) leva o cadastro simulado ao estado pelos
  // mesmos métodos da porta que as telas usam (apps/driver/src/onboarding/devScenarios.ts);
  // `?devErro=`/`?devEnvio=` fazem o servidor simulado recusar o próximo envio pelo caminho real.
  // Sem prancha: a M03 é desenho sem recorte próprio fechado (ficha M03 §13) e a M04 herda a M05.
  {
    id: 'M02d',
    app: 'motorista',
    nome: 'etapa2-dados',
    rota: '/cadastro/dados?devCenario=inicio',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M02d-cpf',
    app: 'motorista',
    nome: 'etapa2-dados-erro-cpf',
    rota: '/cadastro/dados?devCenario=inicio&devErro=invalid_cpf',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M02d-ear',
    app: 'motorista',
    nome: 'etapa2-dados-erro-ear',
    rota: '/cadastro/dados?devCenario=inicio&devErro=cnh_without_ear',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M02d-rede',
    app: 'motorista',
    nome: 'etapa2-dados-erro-rede',
    rota: '/cadastro/dados?devCenario=inicio&devErro=network',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M02v',
    app: 'motorista',
    nome: 'etapa2-veiculo',
    rota: '/cadastro/veiculo?devCenario=veiculo',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M02v-placa',
    app: 'motorista',
    nome: 'etapa2-veiculo-erro-placa',
    rota: '/cadastro/veiculo?devCenario=veiculo&devErro=plate_in_use',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M02v-idade',
    app: 'motorista',
    nome: 'etapa2-veiculo-erro-idade',
    rota: '/cadastro/veiculo?devCenario=veiculo&devErro=vehicle_too_old',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03',
    app: 'motorista',
    nome: 'meus-documentos',
    rota: '/cadastro?devCenario=faltam-docs',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M03-inicio',
    app: 'motorista',
    nome: 'meus-documentos-inicio',
    rota: '/cadastro?devCenario=inicio',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-carregando',
    app: 'motorista',
    nome: 'meus-documentos-carregando',
    rota: '/cadastro?devCenario=carregando',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-erro',
    app: 'motorista',
    nome: 'meus-documentos-erro-servidor',
    rota: '/cadastro?devCenario=erro-servidor',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-correcao',
    app: 'motorista',
    nome: 'meus-documentos-correcao',
    rota: '/cadastro?devCenario=correcao',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-doc',
    app: 'motorista',
    nome: 'documento-enviar',
    rota: '/cadastro/documento?tipo=antecedentes&devCenario=faltam-docs',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M03-doc-arquivo',
    app: 'motorista',
    nome: 'documento-arquivo-escolhido',
    rota: '/cadastro/documento?tipo=antecedentes&devCenario=faltam-docs&devEnvio=arquivo',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M03-doc-enviando',
    app: 'motorista',
    nome: 'documento-enviando',
    rota: '/cadastro/documento?tipo=antecedentes&devCenario=faltam-docs&devEnvio=progresso',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-doc-erro',
    app: 'motorista',
    nome: 'documento-erro-envio',
    rota: '/cadastro/documento?tipo=antecedentes&devCenario=faltam-docs&devEnvio=erro',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-doc-enviado',
    app: 'motorista',
    nome: 'documento-enviado',
    rota: '/cadastro/documento?tipo=antecedentes&devCenario=faltam-docs&devEnvio=enviado',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-doc-correcao',
    app: 'motorista',
    nome: 'documento-correcao-pedida',
    rota: '/cadastro/documento?tipo=cnh&devCenario=correcao',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-doc-vencido',
    app: 'motorista',
    nome: 'documento-vencido',
    rota: '/cadastro/documento?tipo=cnh&devCenario=vencido',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M03-doc-analise',
    app: 'motorista',
    nome: 'documento-em-analise',
    rota: '/cadastro/documento?tipo=crlv&devCenario=faltam-docs',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04',
    app: 'motorista',
    nome: 'analise-em-andamento',
    rota: '/cadastro/analise?devCenario=em-analise',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M04-aprovado',
    app: 'motorista',
    nome: 'analise-aprovado',
    rota: '/cadastro/analise?devCenario=aprovado',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-analise',
    app: 'motorista',
    nome: 'painel-cadastro-em-analise',
    rota: '/?devCenario=em-analise',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-correcao',
    app: 'motorista',
    nome: 'painel-cadastro-correcao',
    rota: '/?devCenario=correcao',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-vencido',
    app: 'motorista',
    nome: 'painel-documento-vencido',
    rota: '/?devCenario=vencido',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-suspenso',
    app: 'motorista',
    nome: 'painel-cadastro-suspenso',
    rota: '/?devCenario=suspenso',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-nao-aberto',
    app: 'motorista',
    nome: 'painel-cadastro-nao-aberto',
    rota: '/?devCenario=sem-candidatura',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-erro',
    app: 'motorista',
    nome: 'painel-cadastro-erro-rede',
    rota: '/?devCenario=erro-rede',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'M04-home-carregando',
    app: 'motorista',
    nome: 'painel-cadastro-carregando',
    rota: '/?devCenario=carregando',
    estados: [ESTADOS.PADRAO],
  },
  {
    id: 'P11',
    app: 'passageiro',
    nome: 'historico',
    rota: '/historico',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P11 §título: recorte "Histórico", 376,522,640,976 + folga de 8px.
    recortePrancha: { x0: 368, y0: 514, x1: 648, y1: 984 },
  },
  {
    id: 'P11b',
    app: 'passageiro',
    nome: 'historico-detalhe',
    // Ficha P11 §2.2: "o detalhe não tem recorte; herda o cartão-linha e o valor em destaque".
    rota: '/historico-detalhe?id=trip-1',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'P13',
    app: 'passageiro',
    nome: 'perfil',
    rota: '/perfil',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P13 §título: recorte "Meu Perfil", 925,522,1189,976 + folga de 8px.
    recortePrancha: { x0: 917, y0: 514, x1: 1197, y1: 984 },
  },
  {
    id: 'P13b',
    app: 'passageiro',
    nome: 'configuracoes',
    rota: '/configuracoes',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P13 §título: recorte "Configurações", 1200,522,1470,976 + folga de 8px.
    recortePrancha: { x0: 1192, y0: 514, x1: 1478, y1: 984 },
  },
  {
    id: 'P14',
    app: 'passageiro',
    nome: 'ajuda',
    rota: '/ajuda',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    // Ficha P14: "Sem recorte: herda o 'Suporte' do motorista" (alvo_motorista, 1336,516,1532,926) + folga de 8px.
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 1328, y0: 508, x1: 1540, y1: 934 },
  },
  {
    id: 'M12',
    app: 'motorista',
    nome: 'historico-de-corridas',
    rota: '/historico',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M12 §Alvo visual: recorte 708,516,906,926 ("Histórico de Corridas") + folga de 8px.
    recortePrancha: { x0: 700, y0: 508, x1: 914, y1: 934 },
  },
  {
    id: 'M12b',
    app: 'motorista',
    nome: 'historico-detalhe',
    // Ficha M12 §2.2 (Detalhe): sem recorte próprio na prancha (mesmo padrão do P11b).
    rota: '/historico-detalhe?id=trip-h1',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M13',
    app: 'motorista',
    nome: 'perfil-e-documentos',
    rota: '/perfil',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M13 §Alvo visual: recorte 1127,516,1324,926 ("Perfil") + folga de 8px.
    recortePrancha: { x0: 1119, y0: 508, x1: 1332, y1: 934 },
  },
  {
    id: 'M13c',
    app: 'motorista',
    nome: 'excluir-conta',
    // Sem recorte próprio na prancha (ajuste do dono: a exclusão de conta é real, `identity.deleteAccount`).
    rota: '/excluir-conta',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
  {
    id: 'M14',
    app: 'motorista',
    nome: 'suporte-e-seguranca',
    rota: '/suporte',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M14 §Alvo visual: recorte 1336,516,1532,926 ("Suporte") + folga de 8px (mesmo recorte
    // da P14 — as duas herdam a mesma tela da prancha, cada app com a própria cópia da tela).
    recortePrancha: { x0: 1328, y0: 508, x1: 1540, y1: 934 },
  },
  {
    id: 'M06',
    app: 'motorista',
    nome: 'nova-corrida',
    rota: '/oferta',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M06 §Alvo visual: recorte "Solicitação de Corrida", 1053,14,1281,462 + folga de 8px.
    recortePrancha: { x0: 1045, y0: 6, x1: 1289, y1: 470 },
  },
  {
    id: 'M07',
    app: 'motorista',
    nome: 'a-caminho-do-embarque',
    // PP-10: M07/M08/M09 são ESTADOS da mesma rota `/corrida` — `?devFase=` escolhe qual
    // fotografar (padrão: `en_route`, nem precisa do parâmetro). `__DEV__` apenas.
    rota: '/corrida',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M07 §Alvo visual: recorte "Navegação (GPS)", 290,516,487,926 + folga de 8px.
    recortePrancha: { x0: 282, y0: 508, x1: 495, y1: 934 },
  },
  {
    id: 'M08',
    app: 'motorista',
    nome: 'embarque',
    rota: '/corrida?devFase=arrived',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M08 §Alvo visual: metade de cima do recorte "Corrida em Andamento", 1298,14,1528,462
    // + folga de 8px (mesma caixa da M09; M08 usa só a metade de cima dela).
    recortePrancha: { x0: 1290, y0: 6, x1: 1536, y1: 470 },
  },
  {
    id: 'M09',
    app: 'motorista',
    nome: 'corrida-em-andamento',
    rota: '/corrida?devFase=in_progress',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    // Ficha M09 §Alvo visual: recorte "Corrida em Andamento", 1298,14,1528,462 + folga de 8px.
    recortePrancha: { x0: 1290, y0: 6, x1: 1536, y1: 470 },
  },
  {
    id: 'M10',
    app: 'motorista',
    nome: 'corrida-finalizada',
    // Ficha M10 §Alvo visual: "sem recorte — herda o valor da M06 e o cartão-linha da M12" (mesmo
    // padrão de P11b/M12b, sem `pranchaArquivo`/`recortePrancha` próprios).
    rota: '/finalizada',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
  },
];

export function telaPorId(id) {
  const tela = TELAS.find((t) => t.id === id);
  if (!tela) throw new Error(`Tela "${id}" não está em screens.config.mjs`);
  return tela;
}

export function nomeArquivo(tela, estado, tamanho) {
  return `${tela.id}-${estado}-${tamanho.largura}x${tamanho.altura}.png`;
}
