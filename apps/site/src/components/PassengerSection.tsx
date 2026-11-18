import {
  PASSENGER_CLOSING_CTA,
  PASSENGER_HEADING,
  PASSENGER_JOURNEY_HEADING,
  PASSENGER_JOURNEY_STEPS,
  PASSENGER_PAIN_CARDS,
  SCREENS_LEGEND,
} from '@/content/passenger';
import { AnchorCta } from './AnchorCta';
import { FeatureGrid } from './FeatureGrid';
import { JourneyShowcase } from './JourneyShowcase';
import { Reveal } from './Reveal';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';
import styles from './PassengerSection.module.css';

export function PassengerSection() {
  return (
    <Section id="passageiro" headingId="passageiro-titulo">
      <Reveal>
        <SectionHeading id="passageiro-titulo" {...PASSENGER_HEADING} />
      </Reveal>
      <FeatureGrid items={PASSENGER_PAIN_CARDS} columns={2} />
      <h3 className={styles['journeyHeading']}>{PASSENGER_JOURNEY_HEADING}</h3>
      <JourneyShowcase steps={PASSENGER_JOURNEY_STEPS} legend={SCREENS_LEGEND} />
      <div className={styles['ctaRow']}>
        <AnchorCta href={PASSENGER_CLOSING_CTA.href} variant="secondary">
          {PASSENGER_CLOSING_CTA.label}
        </AnchorCta>
      </div>
    </Section>
  );
}
