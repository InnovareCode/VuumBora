import type { ReactNode } from 'react';
import styles from './AnchorCta.module.css';

interface AnchorCtaProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}

/**
 * Botão de ação que é, de fato, um link âncora (`<a href="#...">`) — nunca
 * um `<button>` sem destino. O site ainda não tem nada para "enviar" ou
 * "cadastrar"; toda ação hoje é navegação dentro da própria página.
 */
export function AnchorCta({ href, children, variant = 'primary' }: AnchorCtaProps) {
  return <a href={href} className={variant === 'primary' ? styles['primary'] : styles['secondary']}>{children}</a>;
}
