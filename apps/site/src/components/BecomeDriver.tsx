import { DisabledAction } from './DisabledAction';
import { FeatureGrid } from './FeatureGrid';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';

const BENEFITS = [
  {
    title: 'Sua rotina, suas regras',
    description: 'A ideia é que você decida quando e por quanto tempo ficar online.',
  },
  {
    title: 'Corridas que fazem sentido',
    description: 'Veja para onde vai antes de aceitar, e decida se topa aquela corrida.',
  },
  {
    title: 'Cadastro direto pelo app',
    description: 'Estamos construindo um cadastro simples, sem burocracia desnecessária.',
  },
] as const;

export function BecomeDriver() {
  return (
    <Section id="seja-motorista" headingId="seja-motorista-titulo" tone="elevated">
      <SectionHeading
        id="seja-motorista-titulo"
        eyebrow="Para o motorista"
        title="Seja motorista parceiro VuumBora"
        description="Ainda não abrimos o cadastro de motoristas. Enquanto isso, veja o que estamos planejando para quem vai dirigir com a gente."
      />
      <FeatureGrid items={BENEFITS} columns={3} />
      <div style={{ marginTop: 'var(--spacing-7)' }}>
        <DisabledAction caption="Cadastro de motorista" label="Em breve" showIcon={false} />
      </div>
    </Section>
  );
}
