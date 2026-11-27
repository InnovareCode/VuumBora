import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface LabeledIconInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  /** Ícone fixo à esquerda — decorativo, nunca é o único jeito de entender o campo. */
  readonly icon: ReactNode;
  /** Ex.: botão de revelar senha. Interativo, então nunca `aria-hidden`. */
  readonly rightSlot?: ReactNode;
}

/**
 * Campo rotulado com ícone à esquerda, padrão das telas de autenticação do
 * admin. Pequeno e sem estado próprio de propósito — quem decide `invalid`/
 * `aria-describedby` é a tela (no login, o erro é um só, compartilhado pelos
 * dois campos; ver LoginPage).
 */
export const LabeledIconInput = forwardRef<HTMLInputElement, LabeledIconInputProps>(
  ({ label, icon, rightSlot, id, className, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5 text-left">
        <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          {label}
        </label>
        <div className="group relative">
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted transition-colors group-focus-within:text-cta-pressed"
            aria-hidden="true"
          >
            {icon}
          </span>
          <input
            id={id}
            ref={ref}
            className={cn(
              'h-12 w-full rounded-xl border border-border bg-input pl-11 text-body text-text outline-none transition-colors',
              // Sem `/70`: com o alpha o exemplo media 3,22:1 sobre o fundo do campo (texto de exemplo também é texto).
              'placeholder:text-text-muted',
              'focus:border-cta-pressed focus-visible:ring-2 focus-visible:ring-info',
              rightSlot ? 'pr-12' : 'pr-4',
              className,
            )}
            {...props}
          />
          {rightSlot && <div className="absolute right-0.5 top-1/2 -translate-y-1/2">{rightSlot}</div>}
        </div>
      </div>
    );
  },
);
LabeledIconInput.displayName = 'LabeledIconInput';
