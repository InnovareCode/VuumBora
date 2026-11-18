import { ButtonCore, type ButtonCoreProps } from './ButtonCore';

export type PrimaryButtonProps = Omit<ButtonCoreProps, 'variant'>;

/** CTA principal — fundo `ctaBackground`/`ctaBackgroundPressed`, texto `ctaText`. */
export function PrimaryButton(props: PrimaryButtonProps) {
  return <ButtonCore variant="primary" {...props} />;
}
