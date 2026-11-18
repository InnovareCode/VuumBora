/**
 * `docs/conteudo-site.md` §6 — texto final do Apolo (18/11/2026). O dono
 * aprovou as frases [compromisso] das perguntas de taxa e repasse do
 * motorista (`docs/decisoes-do-dono.md`) — usa a versão principal.
 *
 * "Hoje este site não coleta nenhum dado seu" (resposta de privacidade):
 * verificado em 18/11/2026 — `apps/site` não tem nenhum script de
 * analytics, pixel ou serviço de terceiro, e o único cookie possível seria
 * do próprio navegador. Se isso mudar (analytics, formulário, etc.), essa
 * frase sai primeiro.
 */
export const FAQ_HEADING = { title: 'As perguntas que você faria antes de confiar num app novo.' };

export const FAQ_PASSENGER_HEADING = 'Para quem pede corrida';

export const FAQ_PASSENGER_QUESTIONS = [
  {
    question: 'Já posso usar o VuumBora?',
    answer:
      'Ainda não. O app está em construção e não foi publicado nas lojas. Quando for, os botões do topo desta página passam a levar direto para a Google Play e a App Store.',
  },
  {
    question: 'Em que cidade vai funcionar, e quando?',
    answer:
      'Ainda não decidimos a cidade de lançamento nem a data. Não vamos anunciar uma data que não temos certeza de cumprir. Quando as duas estiverem definidas, é aqui que você vai ver primeiro.',
  },
  {
    question: 'Quanto vai custar uma corrida?',
    answer:
      'Ainda não definimos a tarifa. O que já está desenhado: antes de confirmar, você vê o preço estimado de cada opção, e no fim recebe o recibo com o detalhamento.',
  },
  {
    question: 'Como vou saber que o motorista é de confiança?',
    answer:
      'Ainda não abrimos o cadastro de motoristas, justamente porque o processo de análise de documentos ainda está sendo definido. Quando abrirmos, vamos explicar aqui quais documentos pedimos e como eles são analisados. Durante a corrida, você vê nome, carro e placa antes de embarcar, e pode avaliar o motorista no fim.',
  },
  {
    question: 'E se acontecer um problema durante a corrida?',
    answer:
      'Ainda estamos definindo o canal de atendimento: por onde, em que horário e com quem. Não vamos anunciar suporte antes de ter alguém para atender. Isso vai estar claro antes do lançamento.',
  },
  {
    question: 'O que vocês fazem com os meus dados?',
    answer:
      'A Política de Privacidade está sendo escrita e vai ser publicada antes do app. Ela vai dizer quais dados coletamos, para que usamos e por quanto tempo guardamos. Hoje este site não coleta nenhum dado seu.',
  },
] as const;

export const FAQ_DRIVER_HEADING = 'Para quem dirige';

export const FAQ_DRIVER_QUESTIONS = [
  {
    question: 'Quanto o VuumBora vai cobrar de taxa?',
    answer:
      'Ainda não está definido. Vamos publicar o valor nesta página antes de abrir o cadastro, para que você decida com o número na mão.',
  },
  {
    question: 'Em quanto tempo eu recebo pelas corridas?',
    answer:
      'Depende do parceiro de pagamento, que ainda estamos escolhendo. Prazo, frequência e se haverá taxa para sacar vão estar escritos aqui antes de você se cadastrar.',
  },
  {
    question: 'Que carro eu preciso ter?',
    answer:
      'Os requisitos de veículo, como ano e tipo, ainda estão sendo definidos junto com as categorias de corrida. Eles também dependem das regras da cidade onde vamos começar, já que algumas prefeituras têm exigências próprias.',
  },
  {
    question: 'Quando abre o cadastro de motoristas?',
    answer:
      'Ainda não tem data. O cadastro só vai abrir quando taxa, repasse e análise de documentos estiverem definidos. Não queremos que você se cadastre sem saber em que está entrando.',
  },
  {
    question: 'Por que confiar num app que ainda nem existe?',
    answer:
      'Você não precisa confiar agora. Precisa só acompanhar. Estamos mostrando o que já está pronto, o que falta e o que ainda vamos decidir. Quando o cadastro abrir, as regras vão estar aqui para você comparar com o app que usa hoje.',
  },
] as const;
