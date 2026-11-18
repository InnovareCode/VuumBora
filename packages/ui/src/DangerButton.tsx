import { ButtonCore, type ButtonCoreProps } from './ButtonCore';

export type DangerButtonProps = Omit<ButtonCoreProps, 'variant'>;

/** Ação destrutiva — fundo `dangerFill` (nunca `danger`), texto branco (`textPrimary`). */
export function DangerButton(props: DangerButtonProps) {
  return <ButtonCore variant="danger" {...props} />;
}
