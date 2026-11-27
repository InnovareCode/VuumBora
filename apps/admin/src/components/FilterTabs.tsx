import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';

export interface FilterTabOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Contagem opcional mostrada depois do rótulo ("Pendentes (4)"). `null`/ausente = sem contagem. */
  readonly count?: number | null;
}

/** Id da aba de `value` — a tela usa o mesmo para o `aria-labelledby` do seu `role="tabpanel"`. */
export function filterTabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}

/**
 * Abas de filtro de lista, no padrão WAI-ARIA "tabs" com ativação MANUAL: as setas (e Home/End) só movem o foco;
 * Enter/Espaço (o clique nativo do `<button>`) é que troca o filtro — trocar dispara uma chamada à API, então não
 * se troca a cada seta. Uma aba só no Tab (`tabIndex` 0 na selecionada, -1 nas outras).
 *
 * Papel: `tab` + `aria-selected`. O `aria-pressed` que convivia com ele na lista de pré-cadastro saiu — é estado de
 * `role="button"` (botão de alternar), não de aba, e os dois juntos diziam coisas diferentes ao leitor de tela.
 *
 * Quem usa renderiza o conteúdo filtrado num `role="tabpanel"` com `id={panelId}` e
 * `aria-labelledby={filterTabId(idPrefix, valorSelecionado)}`.
 */
export function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  idPrefix,
  panelId,
  className,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<FilterTabOption<T>>;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly idPrefix: string;
  readonly panelId: string;
  readonly className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft'
          ? (index === 0 ? last : index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            id={filterTabId(idPrefix, option.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={
              selected
                ? 'min-h-11 rounded-pill bg-cta px-4 py-2 text-caption font-bold text-on-cta outline-none focus-visible:ring-2 focus-visible:ring-info'
                : 'min-h-11 rounded-pill border border-border px-4 py-2 text-caption font-semibold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info'
            }
          >
            {option.label}
            {option.count != null ? ` (${option.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}
