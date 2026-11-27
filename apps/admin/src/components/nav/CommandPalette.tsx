import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import type { NavGroup, NavItem } from '../../nav/types';
import { flattenNav } from '../../nav/types';
import { useFocusTrap } from '../../nav/useFocusTrap';
import { cn } from '../../lib/cn';

/**
 * Paleta de comandos do admin (Ctrl+K).
 *
 * Navega só para rotas do próprio painel (lista fixa em `nav/adminNav.ts`) —
 * não é busca de conteúdo, então não chama a API nem inventa resultado.
 *
 * Quem renderiza decide se a paleta existe (`{open && <CommandPalette/>}`),
 * em vez de um `open` que a esconde: montar de novo já devolve busca e
 * cursor ao estado inicial, sem efeito de reset.
 */

/** Remove acento para "pre cadastro" encontrar "Pré-cadastro". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function CommandPalette({
  groups,
  onClose,
  label = 'Buscar área do painel',
}: {
  readonly groups: readonly NavGroup[];
  readonly onClose: () => void;
  readonly label?: string;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // A paleta só existe no DOM enquanto está aberta (ver comentário acima) —
  // por isso a armadilha está sempre "ativa" aqui; o próprio
  // montar/desmontar é que liga/desliga o foco preso. Também resolve
  // Escape (sem precisar tratar de novo no handleKeyDown abaixo).
  useFocusTrap(dialogRef, true, onClose);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const flat: Array<NavItem & { readonly group: string }> = flattenNav(groups).map((item) => {
      const group = groups.find((g) => g.items.includes(item))?.title ?? '';
      return { ...item, group };
    });
    if (!q) return flat;
    return flat.filter(
      (item) => normalize(item.label).includes(q) || normalize(item.hint).includes(q) || normalize(item.group).includes(q),
    );
  }, [groups, query]);

  // Digitar volta a seleção para o primeiro resultado — senão o Enter
  // dispara um item que já saiu da lista filtrada.
  function handleQueryChange(value: string) {
    setQuery(value);
    setCursor(0);
  }

  function go(item: NavItem) {
    navigate(item.href);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
      return;
    }
    if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-full max-w-lg overflow-hidden rounded-xxl bg-surface shadow-2xl ring-1 ring-border"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border px-5">
          <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            // `useFocusTrap` já foca este campo (primeiro focável do
            // contêiner) ao montar — sem `autoFocus` duplicado.
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar área do painel…"
            aria-label={label}
            aria-controls="admin-command-results"
            // 16 px: abaixo disso o Safari do iOS dá zoom ao focar o campo.
            className="w-full bg-transparent py-4 text-body text-text placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-secondary sm:block">
            ESC
          </kbd>
        </div>

        <ul id="admin-command-results" className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Resultados">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-small text-text-secondary">Nenhuma área corresponde a "{query}".</li>
          ) : (
            results.map((item, i) => (
              <li key={item.href} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onClick={() => go(item)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
                    i === cursor ? 'bg-cta/10' : 'hover:bg-elevated',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      i === cursor ? 'bg-cta text-on-cta' : 'bg-elevated text-text-secondary',
                    )}
                    aria-hidden="true"
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-bold text-text">{item.label}</span>
                    <span className="block truncate text-caption text-text-secondary">{item.hint}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-muted">{item.group}</span>
                  {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-cta-pressed" aria-hidden="true" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
