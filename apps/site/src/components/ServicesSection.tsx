import { SERVICES_HEADING, SERVICES_LAUNCH_ITEMS } from '@/content/services';
import { FeatureGrid } from './FeatureGrid';
import { Reveal } from './Reveal';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';

export function ServicesSection() {
  return (
    <Section id="servicos" headingId="servicos-titulo">
      <Reveal>
        <SectionHeading id="servicos-titulo" {...SERVICES_HEADING} />
      </Reveal>
      <FeatureGrid items={SERVICES_LAUNCH_ITEMS} columns={3} />
    </Section>
  );
}
