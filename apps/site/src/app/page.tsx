import { BecomeDriver } from '@/components/BecomeDriver';
import { FaqSection } from '@/components/FaqSection';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { SafetySection } from '@/components/SafetySection';

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <HowItWorks />
        <BecomeDriver />
        <SafetySection />
        <FaqSection />
      </main>
      <Footer />
    </>
  );
}
