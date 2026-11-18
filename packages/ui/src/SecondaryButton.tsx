import { ButtonCore, type ButtonCoreProps } from './ButtonCore';

export type SecondaryButtonProps = Omit<ButtonCoreProps, 'variant'>;

/** Ação de apoio — fundo `surfaceElevated`, borda `borderControl`, texto `textPrimary`. */
export function SecondaryButton(props: SecondaryButtonProps) {
  return <ButtonCore variant="secondary" {...props} />;
}
