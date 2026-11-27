import { useId, useState } from 'react';
import { XCircle } from 'lucide-react';
import { Dialog } from './Dialog';
import { useApi } from '../context/ApiContext';
import { errorMessage } from '../api';
import { notifyDriverApplicationsChanged } from '../api/driverApplicationsEvents';
import { createIdempotencyKey } from '../lib/idempotency';

// Mesmo mínimo de `REJECT_REASON_MIN_LENGTH` em
// apps/api/src/routes/admin-driver-application-route.ts — pareado por
// comentário (abaixo do mínimo a API responde 400, mas a tela já trava o
// envio antes disso).
const REASON_MIN_LENGTH = 10;

/**
 * Confirmação antes de recusar — motivo é OBRIGATÓRIO (regra do briefing):
 * o botão fica desabilitado até ter pelo menos `REASON_MIN_LENGTH`
 * caracteres, nunca envia vazio ou curto demais.
 */
export function RejectDialog({
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
  const reasonId = useId();
  const hintId = useId();
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length >= REASON_MIN_LENGTH && !pending;

  async function handleConfirm() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await api.driverApplications.reject(applicationId, trimmedReason, idempotencyKey);
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
    <Dialog titleId={titleId} title="Recusar candidatura" onClose={onClose} busy={pending}>
      <p className="text-small text-text-secondary">
        <strong className="font-bold text-text">{applicantName}</strong> vai saber que a candidatura não foi aceita. O
        motivo abaixo fica registrado nesta candidatura.
      </p>

      <div className="mt-4">
        <label htmlFor={reasonId} className="mb-1.5 block text-caption font-semibold uppercase tracking-wide text-text-muted">
          Motivo da recusa
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          aria-describedby={hintId}
          disabled={pending}
          placeholder="Ex.: telefone informado não atende e não confirmamos a identidade."
          className="w-full rounded-xl border border-border-control bg-screen px-3 py-2.5 text-body text-text outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p id={hintId} className="mt-1.5 text-caption text-text-muted">
          Obrigatório, mínimo de {REASON_MIN_LENGTH} caracteres — o botão habilita a partir daí.
        </p>
      </div>

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
          className="min-h-11 rounded-pill px-4 py-2.5 text-small font-bold text-text-secondary outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={!canSubmit}
          // bg-danger-fill (não bg-danger): branco sobre o vermelho claro de
          // `--role-danger` não passa contraste AA — medido, não suposto.
          // hover por `brightness` (não `opacity`) para nunca diluir o
          // contraste do texto (ver memória
          // bug_opacity_botao_dilui_contraste_texto).
          className="flex min-h-11 items-center gap-2 rounded-pill bg-danger-fill px-5 py-2.5 text-small font-bold text-white outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? 'Recusando…' : 'Confirmar recusa'}
        </button>
      </div>
    </Dialog>
  );
}
