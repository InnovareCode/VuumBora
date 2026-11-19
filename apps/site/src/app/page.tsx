import { AboutBlock } from '@/components/AboutBlock';
import { ArteSection } from '@/components/ArteSection';
import { CommitmentBanner } from '@/components/CommitmentBanner';
import { Container } from '@/components/Container';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { PassengerNote } from '@/components/PassengerNote';
import { ARTES_SECOES } from '@/content/artes';
import { DRIVER_COMMITMENT } from '@/content/driverApplication';

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        {ARTES_SECOES.map((arte) =>
          // O compromisso público de taxa/repasse (já aprovado pelo dono) não
          // tem arte própria — entra como reforço na seção que já fala de
          // repasse, em vez de virar uma seção extra fora da estrutura
          // "uma seção por arte".
          arte.id === 'repasse-rapido' ? (
            <ArteSection key={arte.id} arte={arte}>
              <CommitmentBanner label={DRIVER_COMMITMENT.label} text={DRIVER_COMMITMENT.text} />
            </ArteSection>
          ) : (
            <ArteSection key={arte.id} arte={arte} />
          ),
        )}
        <PassengerNote />
        <Container>
          <AboutBlock />
        </Container>
      </main>
      <Footer />
    </>
  );
}
