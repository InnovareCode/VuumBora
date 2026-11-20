import { useId, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { useApi } from '../context/ApiContext';
import { errorMessage } from '../api';
import { notifyDriverApplicationsChanged } from '../api/driverApplicationsEvents';
import { createIdempotencyKey } from '../lib/idempotency';

/**
 * Confirmação antes de aprovar — ação que muda a vida de alguém, nunca
 * dispara no primeiro clique (regra do briefing). O estado só muda de
 * verdade (quem chama recarrega o detalhe) depois que o servidor confirmar;
 * aqui dentro é só pendente/erro, local a este diálogo.
 */
export function ApproveDialog({
  applicationId,
  applicantName,
  onSuccess,
  onConflict,
  onClose,
}: {
  readonly applicationId: string;
  readonly applicantName: string;
  readonly onSuccess: () => void;
  readonly onConflict: () => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const titleId = useId();
  // Gerada uma vez, ao abrir — reaproveitada se a pessoa tentar de novo após
  // um erro (ver src/lib/idempotency.ts).
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await api.driverApplications.approve(applicationId, idempotencyKey);
    setPending(false);
    if (result.ok) {
      notifyDriverApplicationsChanged();
      onSuccess();
      return;
    }
    if (result.error.kind === 'conflict') {
      onConflict();
      return;
    }
    setError(errorMessage(result.error));
  }

  return (
    <Dialog titleId={titleId} title="Aprovar candidatura" onClose={onClose} busy={pending}>
      <p className="text-small text-text-secondary">
        <strong className="font-bold text-text">{applicantName}</strong> passa a poder continuar o cadastro no app do
        motorista (etapa 2: documento, veículo e endereço).
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-fill px-3 py-2.5 text-small text-text">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-pill px-4 py-2.5 text-small font-bold text-text-secondary outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={pending}
          className="flex items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? 'Aprovando…' : 'Confirmar aprovação'}
        </button>
      </div>
    </Dialog>
  );
}
