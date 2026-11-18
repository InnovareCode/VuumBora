import { ClosingBanner } from '@/components/ClosingBanner';
import { CredibilitySection } from '@/components/CredibilitySection';
import { DriverSection } from '@/components/DriverSection';
import { FaqSection } from '@/components/FaqSection';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { PassengerSection } from '@/components/PassengerSection';
import { ServicesSection } from '@/components/ServicesSection';

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <PassengerSection />
        <DriverSection />
        <ServicesSection />
        <CredibilitySection />
        <FaqSection />
      </main>
      <ClosingBanner />
      <Footer />
    </>
  );
}
