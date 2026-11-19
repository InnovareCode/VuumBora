/**
 * `docs/conteudo-site.md` §5 — texto final do Apolo (18/11/2026). O bloco
 * "Quem está por trás" fica de fora até o dono informar nome da empresa,
 * cidade e CNPJ (regra explícita do Atlas, 18/11/2026) — não publicar com
 * espaço em branco.
 *
 * Nota do próprio documento: as colunas "Já existe" e "Estamos construindo"
 * precisam ser revisadas a cada marco (referência: `docs/escopo-telas.md`
 * em 18/11/2026). Se ficarem desatualizadas, isto deixa de ser
 * credibilidade e vira o contrário — incluir "atualizar #transparencia" no
 * fechamento de marco é responsabilidade do Atlas, não da Lyra.
 */
export const CREDIBILITY_HEADING = {
  eyebrow: 'Onde estamos',
  title: 'Sem número inventado, sem depoimento de mentira.',
  description:
    'O VuumBora ainda não fez nenhuma corrida. Por isso você não vai encontrar aqui "mil motoristas" ou "nota 4,9". Quando tivermos números, eles vão aparecer. Até lá, preferimos mostrar exatamente em que ponto estamos.',
};

export const CREDIBILITY_COLUMNS = [
  {
    variant: 'existing',
    label: 'Já existe',
    items: [
      'O app do passageiro: pedir corrida, escolher a categoria e confirmar.',
      'O app do motorista: ficar online e receber pedidos de corrida.',
      'A identidade visual e o sistema de design dos dois apps.',
    ],
  },
  {
    variant: 'building',
    label: 'Estamos construindo',
    items: [
      'O acompanhamento da corrida, do embarque ao destino.',
      'Cadastro, perfil e histórico de viagens.',
      'O servidor que conecta passageiro e motorista de verdade.',
    ],
  },
  {
    variant: 'deciding',
    label: 'Ainda vamos decidir',
    items: [
      'Tarifa, taxa da plataforma e prazo de repasse.',
      'Cidade e data de lançamento.',
      'Canal de atendimento e regras de cancelamento.',
    ],
  },
] as const;

export const CREDIBILITY_SCREENS_LEGEND =
  'Telas reais do app em construção. Nomes, valores, endereços e veículos são de exemplo.';

/**
 * Só os 4 mockups fotográficos que existem hoje em `public/mockups/`
 * (home-passageiro, pedir-destino, confirmar-corrida, motorista-ganhos) —
 * de propósito, nenhuma moldura CSS misturada nesta fileira (ver
 * `ScreensStrip.tsx`). "Boas-vindas" e "acompanhar-corrida" saíram daqui até
 * terem mockup equivalente; a tela de boas-vindas já aparece em destaque no
 * Hero.
 */
export const CREDIBILITY_SCREENS = [
  {
    src1120: '/mockups/home-passageiro.jpg',
    src560: '/mockups/home-passageiro-560.jpg',
    alt: 'Tela inicial do passageiro, com mapa e categorias de veículo',
  },
  {
    src1120: '/mockups/pedir-destino.jpg',
    src560: '/mockups/pedir-destino-560.jpg',
    alt: 'Tela do app pedindo o destino da corrida',
  },
  {
    src1120: '/mockups/confirmar-corrida.jpg',
    src560: '/mockups/confirmar-corrida-560.jpg',
    alt: 'Tela de confirmação da corrida, com categoria e forma de pagamento',
  },
  {
    src1120: '/mockups/motorista-ganhos.jpg',
    src560: '/mockups/motorista-ganhos-560.jpg',
    alt: 'Painel do motorista com ganhos do dia',
  },
] as const;
