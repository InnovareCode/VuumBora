import Image from 'next/image';
import { Container } from './Container';
import { StoreBadges } from './StoreBadges';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <section id="topo" className={styles.hero} aria-label="Apresentação do VuumBora">
      <Image
        src="/backgrounds/onboarding-noturno.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className={styles.photo}
      />
      <div className={styles.scrim} aria-hidden="true" />
      <Container>
        <div className={styles.content}>
          <span className={styles.eyebrow}>Em desenvolvimento</span>
          <h1 className={styles.title}>Sua próxima corrida vai ter a cara da sua cidade.</h1>
          <p className={styles.subtitle}>
            O VuumBora é o novo app de mobilidade urbana para passageiros e motoristas. Ainda
            estamos construindo — em breve, mais novidades por aqui.
          </p>
          <div className={styles.actions}>
            <StoreBadges />
          </div>
        </div>
      </Container>
    </section>
  );
}
