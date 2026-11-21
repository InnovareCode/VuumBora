import type { ReactNode } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Aviso de formulário de autenticação. Dois tons, nunca misturados:
 * `error` (vermelho) = você errou algo; `warning` (âmbar) = limite/indisponibilidade,
 * que não é "digitou errado" — dizer isso evita a pessoa insistir achando que o erro é dela.
 * `role="alert"`: anunciado ao aparecer. Mantenha o texto ESTÁTICO — conteúdo
 * que muda a cada segundo (contagem) vai em `aria-hidden` com equivalente `sr-only`.
 */
export function AuthAlert({
  id,
  kind,
  children,
  className,
}: {
  readonly id?: string | undefined;
  readonly kind: 'error' | 'warning';
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      role="alert"
      id={id}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-small text-text',
        kind === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-danger/30 bg-danger-fill',
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
