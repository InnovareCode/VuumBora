import { Link } from 'react-router-dom';
import type { NavItem } from '../../nav/types';
import { cn } from '../../lib/cn';

/** Item de navegação — mesma peça na sidebar escura e na gaveta clara do celular. */
export function NavLink({
  item,
  active,
  badge,
  onNavigate,
  variant,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly badge?: number | undefined;
  readonly onNavigate?: (() => void) | undefined;
  readonly variant: 'sidebar' | 'drawer';
}) {
  const sidebar = variant === 'sidebar';
  const Icon = item.icon;

  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-11 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-info',
        sidebar
          ? active
            ? 'bg-white/15 text-white'
            : 'text-white/60 hover:bg-white/10 hover:text-white'
          : active
            ? 'bg-cta/10 text-text'
            : 'text-text-secondary hover:bg-surface hover:text-text',
      )}
    >
      {active && sidebar && (
        <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-cta" aria-hidden="true" />
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          sidebar
            ? active
              ? 'text-white'
              : 'text-white/50 group-hover:text-white/90'
            : active
              ? 'text-text'
              : 'text-text-muted',
        )}
        aria-hidden="true"
      />
      <span className="flex-1">{item.label}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span
          className={cn(
            'min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-black tabular-nums',
            sidebar ? 'bg-cta text-on-cta' : 'bg-cta/15 text-text',
          )}
          aria-label={`${badge} item(ns) aguardando`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
