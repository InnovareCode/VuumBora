import { AboutBlock } from '@/components/AboutBlock';
import { CommitmentBanner } from '@/components/CommitmentBanner';
import { Container } from '@/components/Container';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { PassengerNote } from '@/components/PassengerNote';
import { ProductGlimpse } from '@/components/ProductGlimpse';
import { DRIVER_COMMITMENT } from '@/content/driverApplication';

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <Container>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-7)', paddingBottom: 'var(--site-section-gap)' }}>
            <CommitmentBanner label={DRIVER_COMMITMENT.label} text={DRIVER_COMMITMENT.text} />
            <ProductGlimpse />
          </div>
        </Container>
        <PassengerNote />
        <Container>
          <AboutBlock />
        </Container>
      </main>
      <Footer />
    </>
  );
}
