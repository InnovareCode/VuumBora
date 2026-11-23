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
  {
    id: 'P03',
    app: 'passageiro',
    nome: 'inicio',
    rota: '/',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // §18.1: "Home", 813,12,1049,508 + folga de 8px.
    recortePrancha: { x0: 805, y0: 4, x1: 1057, y1: 516 },
  },
  {
    id: 'P04',
    app: 'passageiro',
    nome: 'destino',
    rota: '/destino',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    // Ficha P04: "sem recorte na prancha, herda o topo da 'Escolha de categoria'" (§18.1: 1061,12,1297,508) + folga de 8px.
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    recortePrancha: { x0: 1053, y0: 4, x1: 1305, y1: 516 },
  },
  {
    id: 'P05',
    app: 'passageiro',
    nome: 'categoria',
    // `?devSeed=1`: só em desenvolvimento (`__DEV__`), popula o destino para a captura não
    // precisar clicar o fluxo inteiro (Home/P04) antes de chegar aqui — ver
    // `apps/passenger/src/dev/useDevRideSeed.ts`. Mesmo padrão já usado pela M05b (`devAprovado`).
    rota: '/categoria?devSeed=1',
    estados: [ESTADOS.PADRAO, ESTADOS.SEM_REDE],
    pranchaArquivo: 'alvo_passageiro_2026-11-22.png',
    // Ficha P05 §título: recorte "Escolha de categoria", 1061,12,1297,508 + folga de 8px.
    recortePrancha: { x0: 1053, y0: 4, x1: 1305, y1: 516 },
  },
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
  {
    id: 'M05',
    app: 'motorista',
    nome: 'painel-do-motorista',
    rota: '/',
    estados: [ESTADOS.PADRAO],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 799, y0: 6, x1: 1045, y1: 470 },
    // A M05 fica atrás da guarda `(app)`: a ferramenta entra sozinha no app simulado
    // (`lib/auth-bootstrap.mjs`) antes de capturar.
  },
  {
    id: 'M05b',
    app: 'motorista',
    nome: 'painel-do-motorista-sem-aprovacao',
    // Parâmetro só de desenvolvimento (`__DEV__`): em produção é ignorado e o painel usa o status real.
    rota: '/?devAprovado=false',
    estados: [ESTADOS.PADRAO],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 799, y0: 6, x1: 1045, y1: 470 },
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
];

export function telaPorId(id) {
  const tela = TELAS.find((t) => t.id === id);
  if (!tela) throw new Error(`Tela "${id}" não está em screens.config.mjs`);
  return tela;
}

export function nomeArquivo(tela, estado, tamanho) {
  return `${tela.id}-${estado}-${tamanho.largura}x${tamanho.altura}.png`;
}
