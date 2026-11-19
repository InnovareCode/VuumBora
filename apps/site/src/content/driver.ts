/**
 * `docs/conteudo-site.md` §3 — texto final do Apolo (18/11/2026). Decisões
 * do dono em 18/11/2026 (`docs/decisoes-do-dono.md`), as duas frases
 * [confirmar] resolvidas:
 * - motorista vê o destino antes de aceitar → CONFIRMADO, versão principal
 *   (ver DRIVER_BUILT_LIST) — é o que o app já faz, não promessa;
 * - avaliação dos dois lados → NÃO confirmado, só o passageiro avalia hoje.
 *   O terceiro item de BUILT_LIST ("avaliação dos dois lados") fica fora por
 *   inteiro — não sugerir avaliação mútua em nenhum texto do site.
 * As frases [compromisso] (taxa/repasse) também foram aprovadas — versão
 * principal, não mais a alternativa.
 */
export const DRIVER_HEADING = {
  eyebrow: 'Para quem dirige',
  title: 'Você devia saber as regras antes de ligar o carro.',
  description:
    'Quanto fica com você, quando o dinheiro cai, como o valor da corrida é calculado. Isso não devia ser descoberto depois do cadastro. Ainda estamos definindo essas regras, e vamos publicá-las aqui, por escrito, antes de abrir o cadastro de motoristas.',
};

/**
 * O compromisso público citado com todas as letras em
 * `docs/decisoes-do-dono.md` — merece destaque visual de verdade (pedido do
 * Atlas em 18/11/2026), não mais uma linha de texto no meio dos cartões.
 * Ver `CommitmentBanner.tsx`.
 */
export const DRIVER_COMMITMENT = {
  label: 'Compromisso público',
  text: 'As regras de taxa da plataforma e de repasse ao motorista serão publicadas antes de o cadastro de motoristas ser aberto.',
};

export const DRIVER_COMPLAINT_CARDS = [
  {
    kicker: '"Quanto a plataforma fica?"',
    title: 'A taxa do VuumBora',
    description:
      'A taxa do VuumBora ainda não foi definida. Quando for, vai estar nesta página com o número, sem asterisco e sem "a partir de".',
    status: { variant: 'deciding', label: 'Em definição' },
  },
  {
    kicker: '"Quando eu recebo?"',
    title: 'Prazo e frequência do repasse',
    description:
      'Dependem do parceiro de pagamento, que estamos escolhendo agora. Sabemos que isso pesa no seu mês, e vamos tratar como prioridade, não como detalhe.',
    status: { variant: 'deciding', label: 'Em definição' },
  },
  {
    kicker: '"Se der problema, alguém responde?"',
    title: 'Canal de atendimento',
    description:
      'Ainda não temos canal de atendimento. E não vamos colocar botão de suporte no app sem ter gente do outro lado para responder.',
    status: { variant: 'deciding', label: 'Em definição' },
  },
  {
    kicker: '"Como chegaram nesse valor?"',
    title: 'Cálculo da tarifa',
    description:
      'Ainda está sendo desenhado. O princípio que estamos seguindo: você deve conseguir entender de onde veio o valor de cada corrida.',
    status: { variant: 'deciding', label: 'Em definição' },
  },
] as const;

export const DRIVER_BUILT_HEADING = 'O que você já pode ver nas telas';

export const DRIVER_BUILT_LIST = [
  {
    title: 'Você decide quando trabalhar',
    description: 'Um botão liga e desliga o recebimento de corridas. Ficou offline, não chega pedido.',
    status: { variant: 'existing', label: 'Já funciona assim' },
  },
  {
    // Confirmado pelo dono em 18/11/2026: o app já mostra o destino antes de
    // aceitar — é descrição do que existe, não promessa (docs/decisoes-do-dono.md).
    title: 'Você vê o destino antes de aceitar',
    description:
      'Cada pedido mostra o ponto de embarque, o destino, a distância e o valor estimado. Você tem alguns segundos para aceitar ou recusar.',
    status: { variant: 'existing', label: 'Já funciona assim' },
  },
] as const;

export const DRIVER_VISUAL = {
  src1120: '/mockups/motorista-ganhos.jpg',
  src560: '/mockups/motorista-ganhos-560.jpg',
  alt: 'Painel do motorista com ganhos do dia e uma corrida chegando para aceitar',
};

export const DRIVER_SHOWCASE_DESCRIPTION =
  'Ganhos do dia, corridas feitas e o pedido chegando com ponto de embarque, distância e valor estimado — para decidir em segundos se aceita.';

export const DRIVER_CTA = {
  caption: 'Cadastro de motoristas',
  label: 'Ainda fechado',
  note: 'O cadastro abre depois que taxa, repasse e análise de documentos estiverem definidos. Antes disso, as regras aparecem aqui.',
};

export const DRIVER_FAQ_LINK = { label: 'Ler as perguntas de quem dirige', href: '#perguntas-motorista' };
