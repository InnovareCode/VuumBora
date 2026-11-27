import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../nav/useFocusTrap';

/**
 * Modal genérico (confirmação, formulário curto) para qualquer tela do
 * admin — com armadilha de foco de verdade via `useFocusTrap` (ver o bug
 * real que ela corrigiu na gaveta/paleta de comandos: posição visual por
 * cima do backdrop não basta, é a ordem do documento que decide o Tab).
 *
 * `busy`: trava o fechamento (Escape, clique no backdrop, botão "x") enquanto
 * uma requisição está em voo — quem chama ainda decide o que fazer com os
 * próprios botões de ação (desabilitá-los é responsabilidade de quem usa
 * `<Dialog>`, isto só impede a SAÍDA no meio da operação).
 *
 * Só deve ser montado enquanto aberto (`{open && <Dialog>...}</Dialog>}`),
 * nunca escondido com CSS — montar de novo já devolve o estado inicial.
 *
 * `footer` (opcional): os botões de ação ficam PRESOS ao pé do diálogo e só o meio rola. Sem ele, o
 * diálogo continua exatamente como antes (tudo rola junto). Nasceu na recusa de documento (D7): a 390 px,
 * com cinco motivos, "Confirmar recusa" ficava abaixo da dobra.
 */
export function Dialog({
  titleId,
  title,
  onClose,
  busy = false,
  footer,
  children,
}: {
  readonly titleId: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, () => {
    if (!busy) onClose();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!busy) onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          footer
            ? 'relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xxl bg-surface shadow-2xl ring-1 ring-border'
            : 'relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xxl bg-surface p-6 shadow-2xl ring-1 ring-border'
        }
      >
        <div className={footer ? 'flex shrink-0 items-start justify-between gap-3 px-6 pb-4 pt-6' : 'mb-4 flex items-start justify-between gap-3'}>
          <h2 id={titleId} className="text-title font-bold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted outline-none transition-colors hover:bg-elevated hover:text-text focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {footer ? (
          <>
            {/* `min-h-0` + encolher (sem `flex-1`: base 0 num pai de altura automática zera o meio). */}
            <div className="min-h-0 shrink overflow-y-auto px-6 pb-4">{children}</div>
            <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
