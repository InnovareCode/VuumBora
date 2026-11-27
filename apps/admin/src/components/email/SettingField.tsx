import type { ReactNode } from 'react';
import type { EmailFieldSource } from '../../api';
import { cn } from '../../lib/cn';

/** Selo de origem do valor em uso — sempre com TEXTO (cor sozinha não basta). */
const SOURCE_LABEL: Record<EmailFieldSource, string> = {
  panel: 'Definido aqui',
  env: 'Variável de ambiente',
  unset: 'Não definido',
};

const SOURCE_CLASS: Record<EmailFieldSource, string> = {
  panel: 'bg-cta/15 text-cta-pressed',
  env: 'bg-info/15 text-info',
  unset: 'bg-elevated text-text-secondary',
};

export function SourceBadge({ source }: { readonly source: EmailFieldSource }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        SOURCE_CLASS[source],
      )}
    >
      <span className="sr-only">Origem do valor: </span>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/** Mesmo desenho do `LabeledIconInput` das telas de login, sem o ícone (campos de configuração são mais densos). */
export const controlClass =
  'h-12 w-full rounded-xl border border-border bg-input px-4 text-body text-text outline-none transition-colors placeholder:text-text-muted focus:border-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger';

export interface ControlProps {
  readonly id: string;
  readonly 'aria-describedby': string;
  readonly 'aria-invalid': true | undefined;
}

/**
 * Campo de configuração: rótulo + selo da origem, o controle (via render prop,
 * que recebe `id`/`aria-describedby`/`aria-invalid` já ligados), o valor em
 * uso quando ele vem de outro lugar, a dica e o erro. O rótulo é um `<label>`
 * de verdade associado ao controle; dica e erro entram em `aria-describedby`.
 */
export function SettingField({
  id,
  label,
  source,
  effective,
  hint,
  error,
  children,
  className,
}: {
  readonly id: string;
  readonly label: string;
  readonly source: EmailFieldSource;
  /** Texto do "valor em uso" — só faz sentido quando o painel está em branco e outra origem vale. */
  readonly effective?: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string | undefined;
  readonly children: (control: ControlProps) => ReactNode;
  readonly className?: string;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, effective ? `${id}-effective` : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          {label}
        </label>
        <SourceBadge source={source} />
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className="text-caption font-semibold text-danger">
          {error}
        </p>
      )}
      {effective && (
        <p id={`${id}-effective`} className="break-words text-caption font-medium text-text-secondary">
          {effective}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
