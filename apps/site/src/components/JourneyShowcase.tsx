import type { ShowcaseRowProps } from './ShowcaseRow';
import { ShowcaseRow } from './ShowcaseRow';
import styles from './JourneyShowcase.module.css';

export interface JourneyStep {
  tag: string;
  title: string;
  description: string;
  visual: ShowcaseRowProps['visual'];
}

interface JourneyShowcaseProps {
  steps: readonly JourneyStep[];
  /** Legenda obrigatória sempre que há tela real do app em exibição
   * (`docs/conteudo-site.md`): deixa claro que nome, valor e endereço são
   * de exemplo. */
  legend: string;
}

/**
 * Vitrine de telas reais do app, cada uma em mockup fotográfico (celular
 * renderizado) — usada pela seção do passageiro.
 */
export function JourneyShowcase({ steps, legend }: JourneyShowcaseProps) {
  return (
    <>
      <div className={styles['rows']}>
        {steps.map((step, index) => (
          <ShowcaseRow
            key={step.title}
            tag={step.tag}
            title={step.title}
            description={step.description}
            visual={step.visual}
            reverse={index % 2 === 1}
          />
        ))}
      </div>
      <p className={styles['legend']}>{legend}</p>
    </>
  );
}
