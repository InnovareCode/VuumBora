/**
 * `docs/conteudo-site.md` §2 — texto final do Apolo (18/11/2026). O dono
 * aprovou em 18/11/2026 as frases marcadas [compromisso] dos cartões 2 e 4
 * (`docs/decisoes-do-dono.md`, "Compromisso público assumido em
 * 18/11/2026") — usa a versão principal.
 */
export const PASSENGER_HEADING = {
  eyebrow: 'Para quem pede corrida',
  title: 'Você não devia entrar num carro com dúvida.',
  description:
    'Pedir corrida hoje ainda tem muita incerteza: quanto tempo falta, quanto vai custar, se aquele é mesmo o seu carro. Desenhamos o VuumBora para responder essas perguntas antes que você precise fazê-las.',
};

export const PASSENGER_PAIN_CARDS = [
  {
    kicker: '"Cinco minutos que viram quinze."',
    title: 'Tempo de espera antes de confirmar',
    description:
      'Você vê a estimativa de chegada de cada opção antes de pedir. Depois de confirmar, acompanha o motorista pelo mapa até o ponto de embarque.',
  },
  {
    kicker: '"Um preço na tela, outro no fim."',
    title: 'Preço estimado antes de você decidir',
    description:
      'Cada opção mostra o valor estimado antes de você confirmar. Como a tarifa vai ser calculada ainda está sendo definida. Quando estiver, a regra vai estar escrita aqui, em português claro.',
  },
  {
    kicker: '"Aquele carro prata é o meu?"',
    title: 'Motorista, carro e placa na tela',
    description:
      'Assim que um motorista aceita, o app mostra o nome dele, o modelo do carro e a placa. Você confere antes de abrir a porta.',
  },
  {
    kicker: '"Cancelaram. De novo."',
    title: 'Regras de cancelamento que você conhece antes',
    description:
      'Ainda estamos definindo as regras de cancelamento, para os dois lados. O que já decidimos: elas vão estar visíveis no app antes de você confirmar a corrida, e não escondidas nos termos.',
  },
] as const;

export const PASSENGER_JOURNEY_HEADING = 'Do pedido ao destino';

export const PASSENGER_JOURNEY_STEPS = [
  {
    tag: '1. Pedir',
    title: 'Diga para onde vai',
    description: 'Digite o destino ou escolha um lugar salvo.',
    visual: {
      src1120: '/mockups/pedir-destino.jpg',
      src560: '/mockups/pedir-destino-560.jpg',
      alt: 'Tela do app pedindo o destino da corrida',
    },
  },
  {
    tag: '2. Confirmar',
    title: 'Compare e confirme',
    description: 'Veja as opções com tempo de espera e preço estimado, escolha a forma de pagamento e confirme.',
    visual: {
      src1120: '/mockups/confirmar-corrida.jpg',
      src560: '/mockups/confirmar-corrida-560.jpg',
      alt: 'Tela de confirmação da corrida, com categoria e forma de pagamento',
    },
  },
  {
    tag: '3. Acompanhar',
    title: 'Confira quem vem e acompanhe até chegar',
    description:
      'Nome do motorista, carro e placa aparecem assim que alguém aceita. Siga o trajeto pelo mapa. No fim, você recebe o recibo e avalia a corrida.',
    // Mockup fotográfico chegou em 19/11/2026 — última tela que ainda usava
    // a moldura CSS + cena antiga.
    visual: {
      src1120: '/mockups/acompanhar-corrida.jpg',
      src560: '/mockups/acompanhar-corrida-560.jpg',
      alt: 'Tela de busca do motorista em andamento',
    },
  },
] as const;

export const SCREENS_LEGEND = 'Telas do app em construção. Nomes, valores, endereços e veículos são de exemplo.';

export const PASSENGER_CLOSING_CTA = { label: 'Ver o que vamos oferecer', href: '#servicos' };
