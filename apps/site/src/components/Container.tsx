import type { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string | undefined;
}

/** Largura máxima central do site + gutter responsivo (ver globals.css). */
export function Container({ children, className }: ContainerProps) {
  return <div className={className ? `container ${className}` : 'container'}>{children}</div>;
}
