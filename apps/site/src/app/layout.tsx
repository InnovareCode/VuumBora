import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { tokens } from '@vuumbora/tokens';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import '@/styles/globals.css';

// Poppins, e nao a Plus Jakarta Sans dos aplicativos, porque o SITE precisa
// ficar uniforme com os banners que o dono entregou em Imagens_Site/.
//
// Quem informou a fonte foi o dono, em 19/11/2026: foi Poppins que ele usou
// como referencia ao gerar as artes. Fica registrado porque eu tinha medido e
// errado: recortei o titulo "Dirija com a" de uma arte, medi
// largura/altura-da-maiuscula no pixel (657/83 = 7,916), comparei com dez
// candidatas e Poppins saiu em NONO lugar (9,70% de desvio), descartada
// porque seu "a" e de um andar e o da arte aparentava dois.
//
// A medicao estava certa sobre os pixels e errada sobre a pergunta: o texto
// daquelas artes foi GERADO dentro da imagem, entao as formas sao uma
// aproximacao da fonte, nao a fonte. Medir imagem gerada nao identifica
// tipografia -- so quem fez sabe. Perguntar custava uma frase.
//
// Pesos conforme o dono especificou: 800 nos titulos, 500 nos textos de apoio,
// 600 no olho "PRE-LANCAMENTO" (maiusculas, com mais espacamento entre letras
// -- ver `--tracking-olho` em globals.css).
//
// Os APLICATIVOS continuam em Plus Jakarta Sans -- aquilo foi decisao do dono
// (docs/tipografia.md) e nao esta em jogo aqui.
//
// next/font self-hospeda o WOFF2 (subset latin) no build — nada e buscado do
// Google em tempo de execucao, compativel com exportacao estatica.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-site',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'VuumBora — chegando a Natal e à Grande Natal. Candidate-se para dirigir.',
    template: '%s · VuumBora',
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: SITE_NAME,
    title: 'VuumBora — chegando a Natal e à Grande Natal. Candidate-se para dirigir.',
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Logomarca VuumBora sobre uma cidade à noite',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VuumBora — chegando a Natal e à Grande Natal. Candidate-se para dirigir.',
    description: SITE_DESCRIPTION,
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  // Cor vem do token, nunca escrita à mão (scripts/check-boundaries.mjs, raiz).
  themeColor: tokens.color.background.base,
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        {/* Cinto de segurança: se o JS não rodar, nada do Reveal (entrada ao
            rolar) deve ficar escondido — o padrão já é visível (ver
            Reveal.tsx), isto só reforça caso o atributo mude no futuro. */}
        <noscript>
          <style>{`[data-hidden='true']{opacity:1 !important;transform:none !important;}`}</style>
        </noscript>
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
