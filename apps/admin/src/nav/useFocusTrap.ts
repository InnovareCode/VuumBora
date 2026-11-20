import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  );
}

/**
 * Armadilha de foco para superfícies sobrepostas (gaveta mobile, paleta de
 * comandos): enquanto `active`, Tab/Shift+Tab circulam só entre os elementos
 * focáveis de `containerRef` — sem isso o foco escapa para controles da
 * página de fundo que o backdrop só cobre VISUALMENTE (achado da Íris,
 * 20/11/2026, na gaveta — e o mesmo risco existia na paleta de comandos,
 * que é a última coisa no DOM: Shift+Tab a partir do campo de busca ia
 * para o último link focável do conteúdo por baixo).
 *
 * Ao ativar, foca o primeiro elemento focável do contêiner (ou o próprio
 * contêiner, se não houver nenhum). Ao desativar, devolve o foco a quem
 * tinha o foco antes de abrir (o botão que disparou `active=true`) — sem
 * isso o foco cai no `<body>` ao fechar, que é tão ruim quanto a fuga.
 * Escape chama `onEscape`, igual nas duas superfícies.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return undefined;

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (container) {
      const [first] = getFocusable(container);
      (first ?? container).focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Captura (não bolha): precisa rodar antes de qualquer handler de Escape
    // de dentro do contêiner, e continua funcionando mesmo se o foco, por
    // algum motivo, estiver fora dele.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      triggerRef.current?.focus();
    };
  }, [active, containerRef, onEscape]);
}
