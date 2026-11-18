import { Section } from './Section';
import { SectionHeading } from './SectionHeading';
import styles from './FaqSection.module.css';

const QUESTIONS = [
  {
    question: 'Quando o VuumBora vai estar disponível?',
    answer:
      'Ainda não temos data. O app está em desenvolvimento e vamos avisar por aqui assim que tivermos novidades.',
  },
  {
    question: 'Em quais cidades o VuumBora vai funcionar?',
    answer: 'Ainda não definimos. Atualizamos esta página assim que uma cidade for confirmada.',
  },
  {
    question: 'Quanto custa uma corrida?',
    answer: 'Ainda não temos tarifas definidas. Os preços serão divulgados quando o app estiver disponível.',
  },
  {
    question: 'Como faço para ser motorista?',
    answer: 'O cadastro de motoristas ainda não está aberto. Em breve, trazemos o passo a passo por aqui.',
  },
  {
    question: 'Vocês têm suporte por telefone ou chat?',
    answer: 'Ainda estamos definindo nossos canais de atendimento. Por enquanto, não há suporte disponível.',
  },
  {
    question: 'Já dá para baixar o aplicativo?',
    answer: 'Ainda não. O VuumBora ainda não foi publicado nas lojas de aplicativo.',
  },
] as const;

export function FaqSection() {
  return (
    <Section id="faq" headingId="faq-titulo" tone="elevated">
      <SectionHeading id="faq-titulo" eyebrow="Dúvidas" title="Perguntas frequentes" />
      <div className={styles['list']}>
        {QUESTIONS.map((item) => (
          <details key={item.question} className={styles['item']}>
            <summary className={styles['question']}>
              <span>{item.question}</span>
              <svg
                className={styles['chevron']}
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className={styles['answer']}>{item.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
