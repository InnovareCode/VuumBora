import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Aviso de formulário de autenticação. Dois tons, nunca misturados:
 * `error` (vermelho) = você errou algo; `warning` (âmbar) = limite/indisponibilidade,
 * que não é "digitou errado" — dizer isso evita a pessoa insistir achando que o erro é dela.
 * `role="alert"`: anunciado ao aparecer. Mantenha o texto ESTÁTICO — conteúdo
 * que muda a cada segundo (contagem) vai em `aria-hidden` com equivalente `sr-only`.
 * `focusOnMount`: leva o foco ao aviso quando ele aparece. Só para beco sem saída (não há campo a corrigir, ex.: painel
 * e API em versões diferentes) — nos demais, o foco fica onde a pessoa estava (o campo ou o botão que ela usou).
 */
export function AuthAlert({
  id,
  kind,
  children,
  className,
  focusOnMount,
}: {
  readonly id?: string | undefined;
  readonly kind: 'error' | 'warning';
  readonly children: ReactNode;
  readonly className?: string;
  readonly focusOnMount?: boolean | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <div
      ref={ref}
      role="alert"
      id={id}
      tabIndex={focusOnMount ? -1 : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-small text-text',
        kind === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-danger/30 bg-danger-fill',
        focusOnMount && 'outline-none focus-visible:ring-2 focus-visible:ring-info',
        className,
      )}
    >
      {kind === 'warning' ? (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 font-medium">{children}</div>
    </div>
  );
}
