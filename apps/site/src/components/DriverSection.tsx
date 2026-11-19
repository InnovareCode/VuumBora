import {
  DRIVER_BUILT_HEADING,
  DRIVER_BUILT_LIST,
  DRIVER_COMMITMENT,
  DRIVER_COMPLAINT_CARDS,
  DRIVER_CTA,
  DRIVER_FAQ_LINK,
  DRIVER_HEADING,
  DRIVER_SHOWCASE_DESCRIPTION,
  DRIVER_VISUAL,
} from '@/content/driver';
import { SCREENS_LEGEND } from '@/content/passenger';
import { AnchorCta } from './AnchorCta';
import { CommitmentBanner } from './CommitmentBanner';
import { DisabledAction } from './DisabledAction';
import { FeatureGrid } from './FeatureGrid';
import { Reveal } from './Reveal';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';
import { ShowcaseRow } from './ShowcaseRow';
import styles from './DriverSection.module.css';

export function DriverSection() {
  return (
    <Section id="motorista" headingId="motorista-titulo" tone="elevated">
      <Reveal>
        <SectionHeading id="motorista-titulo" {...DRIVER_HEADING} />
      </Reveal>
      <CommitmentBanner label={DRIVER_COMMITMENT.label} text={DRIVER_COMMITMENT.text} />
      <div style={{ marginTop: 'var(--spacing-8)' }}>
        <FeatureGrid items={DRIVER_COMPLAINT_CARDS} columns={2} />
      </div>

      <h3 className={styles['builtHeading']}>{DRIVER_BUILT_HEADING}</h3>
      <div className={styles['builtList']}>
        <FeatureGrid items={DRIVER_BUILT_LIST} columns={2} />
      </div>
      <div style={{ marginTop: 'var(--spacing-8)' }}>
        <ShowcaseRow
          title="Seu painel, seus números"
          description={DRIVER_SHOWCASE_DESCRIPTION}
          visual={DRIVER_VISUAL}
        />
      </div>
      <p className={styles['legend']}>{SCREENS_LEGEND}</p>

      <div className={styles['ctaBlock']}>
        <div className={styles['ctaColumn']}>
          <DisabledAction caption={DRIVER_CTA.caption} label={DRIVER_CTA.label} showIcon={false} />
          <p className={styles['ctaNote']}>{DRIVER_CTA.note}</p>
        </div>
        <AnchorCta href={DRIVER_FAQ_LINK.href} variant="secondary">
          {DRIVER_FAQ_LINK.label}
        </AnchorCta>
      </div>
    </Section>
  );
}
