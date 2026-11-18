import { FeatureGrid } from './FeatureGrid';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';
import styles from './Section.module.css';

const PRINCIPLES = [
  {
    title: 'Rota visível na corrida',
    description: 'O trajeto no mapa deve acompanhar a corrida do início ao fim, dentro do app.',
  },
  {
    title: 'Identificação de motorista e veículo',
    description: 'Dados de quem está dirigindo e do carro, disponíveis para o passageiro conferir.',
  },
  {
    title: 'Avaliação depois de cada corrida',
    description: 'Passageiro e motorista avaliam a experiência ao final, dos dois lados.',
  },
] as const;

export function SafetySection() {
  return (
    <Section id="seguranca" headingId="seguranca-titulo">
      <SectionHeading
        id="seguranca-titulo"
        eyebrow="Segurança"
        title="Segurança faz parte do desenho, desde o início"
        description="O VuumBora ainda não está em operação. Os pontos abaixo são princípios que estamos usando para desenhar o produto — não recursos já disponíveis."
      />
      <FeatureGrid items={PRINCIPLES} columns={3} />
      <p className={styles['description']} style={{ marginTop: 'var(--spacing-6)' }}>
        Assim que o app estiver disponível, atualizamos esta página com o que realmente
        funciona — sem prometer nada antes da hora.
      </p>
    </Section>
  );
}
