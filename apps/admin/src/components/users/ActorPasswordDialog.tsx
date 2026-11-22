import { useId, useState } from 'react';
import { Dialog } from '../Dialog';
import { ActorPasswordFields } from './ActorPasswordFields';
import type { ApiError, Result } from '../../api';
import type { ReactNode } from 'react';

/**
 * `<Dialog>` + `ActorPasswordFields` — reautenticação sozinha (sem nenhum
 * outro controle acima, ex.: desativar/reativar). Quando o diálogo PRECISA
 * de mais algum campo (ex.: `ChangeRoleDialog`, com o seletor de papel), use
 * `ActorPasswordFields` direto dentro do seu próprio `<Dialog>`.
 */
export function ActorPasswordDialog<T>({
  title,
  intro,
  submitLabel,
  pendingLabel,
  danger = false,
  requireCode,
  onClose,
  run,
  onDone,
  onRejected,
}: {
  readonly title: string;
  readonly intro: ReactNode;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly danger?: boolean;
  readonly requireCode: boolean;
  readonly onClose: () => void;
  readonly run: (input: { readonly password: string; readonly code?: string }) => Promise<Result<T>>;
  readonly onDone: (data: T) => void;
  readonly onRejected?: ((error: ApiError) => boolean) | undefined;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog titleId={titleId} title={title} onClose={onClose} busy={busy}>
      <ActorPasswordFields
        intro={intro}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        danger={danger}
        requireCode={requireCode}
        onClose={onClose}
        run={run}
        onDone={onDone}
        onRejected={onRejected}
        onBusyChange={setBusy}
      />
    </Dialog>
  );
}
