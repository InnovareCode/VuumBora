/**
 * As artes que o dono entregou em `Imagens_Site/` (19/11/2026), já preparadas
 * para o site em `public/artes/`.
 *
 * Por que os textos estão AQUI e não só dentro da imagem: as artes são 16:9
 * com o texto na faixa navy da esquerda. Num celular de 390px a arte inteira
 * renderiza a 390x219 e esse texto fica com cerca de 7px de altura — ilegível.
 * Então cada arte tem duas formas:
 *   - `completa`  → telas a partir de 768px, onde o texto da arte se lê
 *   - `vertical`  → recorte 4:5 da área fotográfica (pessoa + Natal), para o
 *                   celular, com estes mesmos dizeres saindo em HTML/Poppins
 *
 * Os textos abaixo são transcrição literal do que está escrito em cada arte.
 * Nada foi reescrito, resumido ou "melhorado": se um texto precisar mudar,
 * muda na arte primeiro, senão o site passa a dizer uma coisa e a imagem
 * outra.
 */
export interface Arte {
  readonly id: string;
  readonly completa: string;
  readonly completa800: string;
  /** Ausente na peça 4:5, que já é vertical. */
  readonly vertical?: string;
  readonly olho: string;
  readonly titulo: string;
  readonly tituloDestaque: string;
  readonly apoio: string;
  readonly alt: string;
}

const base = '/artes';

export const ARTE_HERO: Arte = {
  id: 'dirija-ponta-negra',
  completa: `${base}/dirija-ponta-negra-1600.jpg`,
  completa800: `${base}/dirija-ponta-negra-800.jpg`,
  vertical: `${base}/dirija-ponta-negra-vertical.jpg`,
  olho: 'Pré-lançamento',
  titulo: 'Dirija com a',
  tituloDestaque: 'VuumBora.',
  apoio: 'Taxas mais competitivas para motoristas de Natal e região metropolitana.',
  alt: 'Motorista da VuumBora de camisa da marca, sorrindo ao lado do carro na orla de Ponta Negra, com o Morro do Careca ao fundo.',
};

export const ARTES_SECOES: readonly Arte[] = [
  {
    id: 'repasse-rapido',
    completa: `${base}/repasse-rapido-1600.jpg`,
    completa800: `${base}/repasse-rapido-800.jpg`,
    vertical: `${base}/repasse-rapido-vertical.jpg`,
    olho: 'Pré-lançamento',
    titulo: 'Repasse mais',
    tituloDestaque: 'rápido.',
    apoio: 'Para quem ganha a vida ao volante na Grande Natal.',
    alt: 'Motorista da VuumBora apoiado no carro, com a orla e as falésias da Grande Natal ao fundo no fim de tarde.',
  },
  {
    id: 'motorista-mulher-candidatura',
    completa: `${base}/motorista-mulher-candidatura-1600.jpg`,
    completa800: `${base}/motorista-mulher-candidatura-800.jpg`,
    vertical: `${base}/motorista-mulher-candidatura-vertical.jpg`,
    olho: 'Pré-lançamento • Grande Natal',
    titulo: 'Motorista, vem dirigir',
    tituloDestaque: 'com a gente.',
    apoio: 'Entre na fila de espera para dirigir na modalidade com motoristas mulheres.',
    alt: 'Motorista mulher da VuumBora ao lado do carro, com a Ponte Newton Navarro ao fundo.',
  },
  {
    id: 'prefere-motorista-mulher',
    completa: `${base}/prefere-motorista-mulher-1600.jpg`,
    completa800: `${base}/prefere-motorista-mulher-800.jpg`,
    vertical: `${base}/prefere-motorista-mulher-vertical.jpg`,
    olho: 'Pré-lançamento • Grande Natal',
    titulo: 'Prefere uma',
    tituloDestaque: 'motorista mulher?',
    apoio: 'Na VuumBora, você poderá fazer essa escolha ao pedir sua corrida.',
    alt: 'Motorista mulher da VuumBora cumprimentando uma passageira na orla, com o Morro do Careca ao pôr do sol.',
  },
  {
    id: 'sua-corrida-sua-escolha',
    completa: `${base}/sua-corrida-sua-escolha-1600.jpg`,
    completa800: `${base}/sua-corrida-sua-escolha-800.jpg`,
    vertical: `${base}/sua-corrida-sua-escolha-vertical.jpg`,
    olho: 'Pré-lançamento • Grande Natal',
    titulo: 'Sua corrida,',
    tituloDestaque: 'sua escolha.',
    apoio: 'Selecione a opção de viajar com uma motorista mulher.',
    alt: 'Passageira usando o celular num banco da orla, com uma motorista da VuumBora e o carro ao fundo.',
  },
  {
    id: 'suporte-local',
    completa: `${base}/suporte-local-1600.jpg`,
    completa800: `${base}/suporte-local-800.jpg`,
    vertical: `${base}/suporte-local-vertical.jpg`,
    olho: 'Pré-lançamento',
    titulo: 'Suporte',
    tituloDestaque: 'local.',
    apoio: 'Gente daqui para atender você.',
    alt: 'Atendente da VuumBora de headset, sorrindo, com o Forte dos Reis Magos pela janela.',
  },
];

/** Peça 4:5, nascida para rede social — já é vertical, não tem recorte. */
export const ARTE_CHAMADA: Arte = {
  id: 'natal-bora-post',
  completa: `${base}/natal-bora-post-1122.jpg`,
  completa800: `${base}/natal-bora-post-800.jpg`,
  olho: 'Em breve no RN',
  titulo: 'Natal, bora',
  tituloDestaque: 'de VuumBora?',
  apoio: 'O novo app de corridas para passageiros e motoristas de Natal e região metropolitana.',
  alt: 'Ponte Newton Navarro iluminada ao anoitecer, com rastros de luz dos carros sobre a via.',
};
