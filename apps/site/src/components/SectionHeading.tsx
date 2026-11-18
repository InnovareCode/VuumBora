import styles from './Section.module.css';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  id?: string;
  centered?: boolean;
}

/** Cabeçalho de seção padrão: selo pequeno + título + descrição opcional. */
export function SectionHeading({ eyebrow, title, description, id, centered }: SectionHeadingProps) {
  const centeredClass = centered ? styles.centered : '';
  return (
    <div className={centeredClass}>
      {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
      <h2 id={id} className={`${styles.heading} ${centeredClass}`}>
        {title}
      </h2>
      {description ? <p className={`${styles.description} ${centeredClass}`}>{description}</p> : null}
    </div>
  );
}
