import { AboutBlock } from '@/components/AboutBlock';
import { ArtCarousel } from '@/components/ArtCarousel';
import { CommitmentBanner } from '@/components/CommitmentBanner';
import { Container } from '@/components/Container';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { PassengerNote } from '@/components/PassengerNote';
import { SectionHeading } from '@/components/SectionHeading';
import { ARTES_SECOES } from '@/content/artes';
import { DRIVER_COMMITMENT } from '@/content/driverApplication';
import { ARTES_CAROUSEL_HEADING } from '@/content/hero';

/**
 * Reescrita de 19/11/2026 (3ª vez): o dono pediu alternância clara/escura de
 * verdade — "hero navy → seção clara com cards brancos → seção navy →
 * formulário claro" — e, numa correção sobre a correção, que a candidatura
 * flutue em vidro fosco sobre a arte do hero (ver `Hero.tsx`) e que as 5
 * artes informativas virem um carrossel automático e acessível em vez de
 * blocos empilhados (ver `ArtCarousel.tsx`).
 *
 * Quatro faixas, cada uma uma forma diferente (nunca o mesmo bloco duas
 * vezes seguidas, `docs/padrao-visual-site.md` §4):
 *   1. Hero (navy/foto) — candidatura flutuante
 *   2. `.light-section` — carrossel de cartões brancos
 *   3. navy — compromisso público (selo de confiança, sozinho)
 *   4. `.light-section` — lista de espera do passageiro ("formulário claro")
 * `AboutBlock`/`Footer` fecham a página no mesmo navy do cabeçalho.
 */
export default function HomePage() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />

        <div className="light-section">
          <section className="section-pad" aria-labelledby="artes-heading">
            <Container>
              <SectionHeading id="artes-heading" eyebrow={ARTES_CAROUSEL_HEADING.eyebrow} title={ARTES_CAROUSEL_HEADING.title} />
              <ArtCarousel artes={ARTES_SECOES} ariaLabel={ARTES_CAROUSEL_HEADING.title} />
            </Container>
          </section>
        </div>

        <section className="section-pad" aria-label="Compromisso público">
          <Container>
            <CommitmentBanner label={DRIVER_COMMITMENT.label} text={DRIVER_COMMITMENT.text} />
          </Container>
        </section>

        <div className="light-section">
          <PassengerNote />
        </div>

        <Container>
          <AboutBlock />
        </Container>
      </main>
      <Footer />
    </>
  );
}
