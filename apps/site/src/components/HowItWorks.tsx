import { FeatureGrid } from './FeatureGrid';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';

const STEPS = [
  {
    title: 'Diga para onde vai',
    description: 'Abra o app e informe seu destino. Simples assim, sem complicação.',
  },
  {
    title: 'Escolha e confirme',
    description: 'Veja as opções disponíveis e confirme a corrida que combina com você.',
  },
  {
    title: 'Acompanhe em tempo real',
    description: 'Veja o motorista se aproximando no mapa, do pedido até o embarque.',
  },
  {
    title: 'Chegue e avalie',
    description: 'Ao final da corrida, avalie a experiência para ajudar a melhorar o app.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="como-funciona" headingId="como-funciona-titulo">
      <SectionHeading
        id="como-funciona-titulo"
        eyebrow="Para o passageiro"
        title="Como vai funcionar a sua corrida"
        description="O VuumBora ainda está em desenvolvimento. É assim que estamos desenhando a experiência do passageiro, do pedido até o destino."
      />
      <FeatureGrid items={STEPS} numbered />
    </Section>
  );
}
