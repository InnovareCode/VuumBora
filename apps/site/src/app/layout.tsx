import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { tokens } from '@vuumbora/tokens';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import '@/styles/globals.css';

// Plus Jakarta Sans é a tipografia aprovada da marca (docs/tipografia.md).
// next/font self-hospeda o WOFF2 (subset latin) no build — nada é buscado do
// Google em tempo de execução, compatível com exportação estática.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'VuumBora — Mobilidade urbana (em breve)',
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
    title: 'VuumBora — Mobilidade urbana (em breve)',
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
    title: 'VuumBora — Mobilidade urbana (em breve)',
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
    <html lang="pt-BR" className={jakarta.variable}>
      <body>
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
