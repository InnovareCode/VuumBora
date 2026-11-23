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
    id: 'M05',
    app: 'motorista',
    nome: 'painel-do-motorista',
    rota: '/',
    estados: [ESTADOS.PADRAO],
    pranchaArquivo: 'alvo_motorista_2026-11-22.png',
    recortePrancha: { x0: 799, y0: 6, x1: 1045, y1: 470 },
    // ⚠ `cli.mjs capturar --telas M05` ainda NÃO autentica: `lib/capture.mjs` navega direto para
    // `rota` sem sessão, e a M05 fica atrás da guarda `(app)` (`Stack.Protected`) — a captura hoje
    // sairia da tela de login, não da Home. Esta entrada documenta a tela para quando alguém
    // acrescentar um passo de login ao `capture.mjs` (ex.: registrar+verificar+logar via
    // `window.__vuumboraIdentity` antes do `page.goto`, código-mock fixo '123456' em
    // `packages/api-client/src/identity/mock-adapter.ts:129`). Até lá, a medição da M05 foi feita
    // por um script ad hoc fora desta ferramenta (ver handoff da Lyra, onda 2 do padrão premium).
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
