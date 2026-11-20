import { useCallback, useState } from 'react';

/**
 * Estado de "quais grupos do menu estão recolhidos", com persistência.
 *
 * Regras:
 * - tudo começa expandido (sem preferência salva, nada está recolhido);
 * - o grupo da rota atual NUNCA recolhe — `isOpen()` ignora a preferência
 *   salva para ele e `toggle()` não faz nada nele, para quem navega não
 *   perder de vista onde está;
 * - `localStorage` é só conforto: bloqueado, cheio ou corrompido, o menu
 *   funciona do mesmo jeito (só não lembra entre visitas).
 */

function readCollapsed(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function writeCollapsed(key: string, titles: readonly string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(titles));
  } catch {
    /* sem storage: a preferência vale só nesta visita */
  }
}

export function useCollapsibleNavGroups(storageKey: string, activeGroup?: string) {
  // Inicializador preguiçoso: lê o storage uma vez, sem efeito de sincronização.
  const [collapsed, setCollapsed] = useState<string[]>(() => readCollapsed(storageKey));

  /** O grupo da rota atual conta como aberto mesmo que esteja salvo como recolhido. */
  const isOpen = useCallback(
    (title: string) => title === activeGroup || !collapsed.includes(title),
    [collapsed, activeGroup],
  );

  /** Grupo que não pode ser recolhido agora (é o da página atual). */
  const isLocked = useCallback((title: string) => title === activeGroup, [activeGroup]);

  const toggle = useCallback(
    (title: string) => {
      if (title === activeGroup) return;
      const next = collapsed.includes(title) ? collapsed.filter((t) => t !== title) : [...collapsed, title];
      setCollapsed(next);
      writeCollapsed(storageKey, next);
    },
    [collapsed, activeGroup, storageKey],
  );

  return { isOpen, isLocked, toggle };
}
