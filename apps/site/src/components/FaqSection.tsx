import {
  FAQ_DRIVER_HEADING,
  FAQ_DRIVER_QUESTIONS,
  FAQ_HEADING,
  FAQ_PASSENGER_HEADING,
  FAQ_PASSENGER_QUESTIONS,
} from '@/content/faq';
import { Reveal } from './Reveal';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';
import styles from './FaqSection.module.css';

function QuestionList({ questions }: { questions: readonly { question: string; answer: string }[] }) {
  return (
    <div className={styles['list']}>
      {questions.map((item, index) => (
        <Reveal key={item.question} delay={Math.min(index, 5) * 60}>
          <details className={styles['item']}>
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
                <path
                  d="M5 7.5l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <p className={styles['answer']}>{item.answer}</p>
          </details>
        </Reveal>
      ))}
    </div>
  );
}

export function FaqSection() {
  return (
    <Section id="perguntas" headingId="perguntas-titulo" tone="elevated">
      <Reveal>
        <SectionHeading id="perguntas-titulo" title={FAQ_HEADING.title} />
      </Reveal>

      <div className={styles['group']}>
        <h3 className={styles['groupTitle']}>{FAQ_PASSENGER_HEADING}</h3>
        <QuestionList questions={FAQ_PASSENGER_QUESTIONS} />
      </div>

      <div id="perguntas-motorista" className={styles['group']}>
        <h3 className={styles['groupTitle']}>{FAQ_DRIVER_HEADING}</h3>
        <QuestionList questions={FAQ_DRIVER_QUESTIONS} />
      </div>
    </Section>
  );
}
