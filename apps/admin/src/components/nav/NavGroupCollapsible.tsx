import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Grupo de menu que expande e recolhe (sidebar escura e gaveta mobile clara).
 *
 * O título é um `<button>` com `aria-expanded`/`aria-controls`. O corpo
 * recolhe animando a altura (grid `1fr` -> `0fr`) e, recolhido, sai da ordem
 * de tabulação (`inert`) — só `overflow-hidden` deixaria os links focáveis
 * por teclado mesmo escondidos. `motion-reduce` desliga a animação.
 *
 * Quando `locked` (grupo da página atual) o botão fica `aria-disabled`: o
 * estado é sempre "aberto" e o clique não faz nada.
 */
export function NavGroupCollapsible({
  title,
  open,
  locked = false,
  onToggle,
  surface,
  children,
}: {
  readonly title: string;
  readonly open: boolean;
  readonly locked?: boolean;
  readonly onToggle: () => void;
  /** "dark": sidebar; "light": gaveta mobile. */
  readonly surface: 'dark' | 'light';
  readonly children: ReactNode;
}) {
  const id = useId();
  const buttonId = `${id}-title`;
  const bodyId = `${id}-body`;
  const dark = surface === 'dark';

  return (
    <div className="mb-6 last:mb-0">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-disabled={locked || undefined}
        title={locked ? 'Grupo da página atual' : undefined}
        onClick={onToggle}
        className={cn(
          // 44 px de alvo (antes 23 px) — o texto continua pequeno, só a área de toque cresce. Branco a 40% sobre o navy
          // media 3,82:1 em texto de 10 px; a 70% passa de 4,5:1 (medido com alpha composto).
          '-my-2 flex min-h-11 w-full items-center justify-between rounded-lg px-3.5 text-left text-[10px] font-bold uppercase tracking-widest outline-none transition-colors focus-visible:ring-2 focus-visible:ring-info',
          dark ? 'text-white/70 hover:text-white' : 'text-text-muted hover:text-text',
          locked && 'cursor-default hover:text-inherit',
        )}
      >
        <span>{title}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
            !open && '-rotate-90',
            locked && 'opacity-40',
          )}
        />
      </button>

      <div
        id={bodyId}
        role="group"
        aria-labelledby={buttonId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none',
          open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
        )}
      >
        {/* Margens negativas alargam a área recortada: o recorte do
            `overflow-hidden` comeria o anel de foco dos links, que sai um
            pouco da caixa. */}
        <div className="-mx-4 -my-1 min-h-0 overflow-hidden px-4 py-1">
          <div className="flex flex-col gap-1 pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
