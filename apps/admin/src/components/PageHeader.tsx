import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Cabeçalho padrão de tela do admin.
 *
 * Anatomia: selo com o ícone da área · título · uma linha dizendo para que
 * serve a tela. O ícone deve ser o MESMO que a área tem no menu
 * (`nav/adminNav.ts`) — o cabeçalho serve para confirmar onde a pessoa está,
 * e um ícone diferente do menu faria exatamente o contrário disso.
 *
 * O selo some no mobile (`sm:flex`): ali o espaço vale mais para o título, e
 * o ícone já aparece no menu/gaveta.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  readonly title: string;
  /** Uma frase sobre para que serve a tela. */
  readonly description?: ReactNode;
  /** Ícone da área — o mesmo do menu. */
  readonly icon?: LucideIcon;
  /** Ação principal da tela. */
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn('flex items-start gap-3', className)}>
      {Icon && (
        <span
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xxl bg-cta/10 text-cta-pressed sm:flex"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-title font-bold tracking-tight text-text sm:text-heading">{title}</h1>
          {description && <p className="mt-1 text-small font-medium text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
