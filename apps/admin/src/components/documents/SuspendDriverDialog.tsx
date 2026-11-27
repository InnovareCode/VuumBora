import { useEffect, useId, useRef, useState } from 'react';
import { Ban } from 'lucide-react';
import { Dialog } from '../Dialog';
import { useApi } from '../../context/ApiContext';
import { errorMessage, SUSPEND_REASON_MAX_LENGTH, SUSPEND_REASON_MIN_LENGTH, type DriverSuspension } from '../../api';
import { createIdempotencyKey } from '../../lib/idempotency';

/**
 * Suspender o motorista (`POST /drivers/:id/suspend`). Motivo obrigatório, 10 a 1000 caracteres — o botão só
 * habilita a partir do mínimo, e o `400 validation_failed` do servidor (`fields.reason`) aparece no campo.
 * Suspender quem já está suspenso devolve a suspensão original: a tela trata como sucesso.
 */
export function SuspendDriverDialog({
  driverId,
  driverName,
  onSuspended,
  onForbidden,
  onClose,
}: {
  readonly driverId: string;
  readonly driverName: string;
  readonly onSuspended: (suspension: DriverSuspension) => void;
  /** 403: o papel perdeu o acesso — a página fecha o diálogo e tira o cadastro da tela. */
  readonly onForbidden: () => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const titleId = useId();
  const reasonId = useId();
  const hintId = useId();
  const fieldErrorId = useId();
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (errorTick === 0) return;
    if (fieldError) reasonRef.current?.focus();
    else errorRef.current?.focus();
  }, [errorTick, fieldError]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= SUSPEND_REASON_MIN_LENGTH && trimmed.length <= SUSPEND_REASON_MAX_LENGTH && !pending;

  async function handleConfirm() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setFieldError(null);
    const result = await api.documentReview.suspend(driverId, { reason: trimmed }, idempotencyKey);
    setPending(false);
    if (result.ok) {
      onSuspended(result.data);
      return;
    }
    if (result.error.kind === 'forbidden') {
      onForbidden();
      return;
    }
    if (result.error.kind === 'validation' && result.error.fields['reason'] !== undefined) {
      setFieldError(result.error.fields['reason'] || 'Informe o motivo (10 a 1000 caracteres).');
    } else {
      setError(errorMessage(result.error));
    }
    setErrorTick((tick) => tick + 1);
  }

  const describedBy = fieldError ? `${hintId} ${fieldErrorId}` : hintId;

  return (
    <Dialog
      titleId={titleId}
      title="Suspender motorista"
      onClose={onClose}
      busy={pending}
      // Botões presos ao pé: a 390 px o conteúdo rola e "Confirmar" continua à vista.
      footer={
        <div className="flex flex-wrap justify-end gap-3">
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
            aria-disabled={!canSubmit}
            className="flex min-h-11 items-center gap-2 rounded-pill bg-danger-fill px-5 py-2.5 text-small font-bold text-white outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:brightness-75"
          >
            {pending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            ) : (
              <Ban className="h-4 w-4" aria-hidden="true" />
            )}
            {pending ? 'Suspendendo…' : 'Confirmar suspensão'}
          </button>
        </div>
      }
    >
      <p className="text-small text-text-secondary">
        O cadastro de <strong className="font-bold text-text">{driverName}</strong> passa a "Suspenso" e ele não consegue
        ficar disponível para corridas. Este painel ainda não tem como desfazer a suspensão.
      </p>

      <div className="mt-4">
        <label htmlFor={reasonId} className="mb-1.5 block text-caption font-semibold uppercase tracking-wide text-text-muted">
          Motivo da suspensão
        </label>
        <textarea
          ref={reasonRef}
          id={reasonId}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setFieldError(null);
          }}
          rows={3}
          required
          maxLength={SUSPEND_REASON_MAX_LENGTH}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          readOnly={pending}
          placeholder="Ex.: documento adulterado identificado na conferência."
          className="w-full rounded-xl border border-border-control bg-screen px-3 py-2.5 text-body text-text outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-info aria-invalid:border-danger"
        />
        <p id={hintId} className="mt-1.5 text-caption text-text-muted">
          Obrigatório, de {SUSPEND_REASON_MIN_LENGTH} a {SUSPEND_REASON_MAX_LENGTH} caracteres — o botão habilita a partir do mínimo.
        </p>
        {fieldError && (
          <p id={fieldErrorId} className="mt-1.5 text-caption font-semibold text-danger">
            {fieldError}
          </p>
        )}
      </div>

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-fill px-3 py-2.5 text-small text-text outline-none">
          {error}
        </p>
      )}

    </Dialog>
  );
}
