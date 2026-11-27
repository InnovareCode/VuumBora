import { useEffect, useId, useRef, useState } from 'react';
import { Lock, XCircle } from 'lucide-react';
import { Dialog } from '../Dialog';
import { LoadingState } from '../RequestState';
import { useApi } from '../../context/ApiContext';
import { errorMessage, INTERNAL_NOTE_MAX_LENGTH, type AdminDriverDocument, type DocumentDecision, type DocumentRejection } from '../../api';
import { createIdempotencyKey } from '../../lib/idempotency';

type ReasonsState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'ready'; readonly reasons: readonly DocumentRejection[] };

/**
 * Recusa de UM documento: o motivo é OBRIGATÓRIO e só pode sair do catálogo (`rejectionReasons()`, N2) —
 * sem campo livre para o motorista. Duas caixas bem separadas na tela:
 *  - o MOTIVO, cujo texto é exatamente o que o motorista lê no app;
 *  - a NOTA INTERNA, opcional, que fica só no painel (o contrato garante que nunca sai para o app).
 *
 * O catálogo é pedido quando o diálogo abre (não antes): mudou no servidor, a próxima recusa já usa o novo.
 */
export function RejectDocumentDialog({
  document,
  driverName,
  onRejected,
  onConflict,
  onClose,
}: {
  readonly document: AdminDriverDocument;
  readonly driverName: string;
  readonly onRejected: (decision: DocumentDecision) => void;
  readonly onConflict: () => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const titleId = useId();
  const legendId = useId();
  const reasonErrorId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [reasons, setReasons] = useState<ReasonsState>({ phase: 'loading' });
  const [reasonsAttempt, setReasonsAttempt] = useState(0);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);
  const reasonGroupRef = useRef<HTMLFieldSetElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    setReasons({ phase: 'loading' });
    api.documentReview.rejectionReasons().then((result) => {
      if (cancelled) return;
      setReasons(result.ok ? { phase: 'ready', reasons: result.data } : { phase: 'error', message: errorMessage(result.error) });
    });
    return () => {
      cancelled = true;
    };
  }, [api, reasonsAttempt]);

  useEffect(() => {
    if (errorTick === 0) return;
    if (reasonError) reasonGroupRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
    else errorRef.current?.focus();
  }, [errorTick, reasonError]);

  const trimmedNote = note.trim();
  const selected = reasons.phase === 'ready' ? reasons.reasons.find((reason) => reason.code === reasonCode) : undefined;
  const canSubmit = !!selected && !pending;

  async function handleConfirm() {
    if (!canSubmit || !selected) return;
    setPending(true);
    setError(null);
    setReasonError(null);
    const result = await api.documentReview.reject(
      document.documentId,
      { reasonCode: selected.code, ...(trimmedNote ? { internalNote: trimmedNote } : {}) },
      idempotencyKey,
    );
    setPending(false);
    if (result.ok) {
      onRejected(result.data);
      return;
    }
    if (result.error.kind === 'conflict') {
      onConflict();
      return;
    }
    if (result.error.kind === 'validation' && result.error.fields['reasonCode'] !== undefined) {
      setReasonError(result.error.fields['reasonCode'] || 'Motivo de recusa desconhecido.');
    } else {
      setError(errorMessage(result.error));
    }
    setErrorTick((tick) => tick + 1);
  }

  return (
    <Dialog titleId={titleId} title="Recusar documento" onClose={onClose} busy={pending}>
      <p className="text-small text-text-secondary">
        <strong className="font-bold text-text">{document.typeLabel}</strong> de {driverName}. O motorista recebe o motivo
        escolhido e pode enviar o documento de novo.
      </p>

      {reasons.phase === 'loading' && <LoadingState label="Carregando motivos…" />}
      {reasons.phase === 'error' && (
        <div role="alert" className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-danger/30 bg-danger-fill px-3 py-2.5 text-small text-text">
          <span>Não foi possível carregar os motivos de recusa. {reasons.message}</span>
          <button
            type="button"
            onClick={() => setReasonsAttempt((n) => n + 1)}
            className="min-h-11 rounded-pill border border-white/40 px-4 py-2 text-small font-bold text-text outline-none focus-visible:ring-2 focus-visible:ring-info"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {reasons.phase === 'ready' && (
        <>
          <fieldset
            ref={reasonGroupRef}
            className="mt-4"
            aria-describedby={reasonError ? reasonErrorId : undefined}
            aria-invalid={reasonError ? true : undefined}
          >
            <legend id={legendId} className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Motivo — o motorista lê este texto
            </legend>
            <div className="flex flex-col gap-2">
              {reasons.reasons.map((reason) => (
                <label
                  key={reason.code}
                  className={
                    reason.code === reasonCode
                      ? 'flex cursor-pointer items-start gap-3 rounded-xl border border-cta bg-elevated px-3 py-2.5 text-small text-text'
                      : 'flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-small text-text-secondary hover:border-border-control'
                  }
                >
                  <input
                    type="radio"
                    name={`reject-reason-${titleId}`}
                    value={reason.code}
                    checked={reason.code === reasonCode}
                    onChange={() => {
                      setReasonCode(reason.code);
                      setReasonError(null);
                    }}
                    disabled={pending}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-cta outline-none focus-visible:ring-2 focus-visible:ring-info"
                  />
                  <span>{reason.text}</span>
                </label>
              ))}
            </div>
            {reasonError && (
              <p id={reasonErrorId} className="mt-1.5 text-caption font-semibold text-danger">
                {reasonError}
              </p>
            )}
          </fieldset>

          <div className="mt-5 rounded-xl border border-dashed border-border-control p-3">
            <label htmlFor={noteId} className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Nota interna (opcional)
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={INTERNAL_NOTE_MAX_LENGTH}
              aria-describedby={noteHintId}
              readOnly={pending}
              placeholder="Ex.: foto com reflexo no número do registro."
              className="w-full rounded-xl border border-border-control bg-screen px-3 py-2.5 text-body text-text outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-info"
            />
            <p id={noteHintId} className="mt-1.5 flex flex-wrap justify-between gap-2 text-caption text-text-muted">
              <span>Fica só no painel, para a equipe. O motorista NÃO vê esta nota.</span>
              <span aria-hidden="true">
                {note.length}/{INTERNAL_NOTE_MAX_LENGTH}
              </span>
            </p>
          </div>
        </>
      )}

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-fill px-3 py-2.5 text-small text-text outline-none">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
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
          // bg-danger-fill + brightness no hover: mesmo par já medido no RejectDialog das candidaturas (contraste AA,
          // e opacidade nunca dilui o texto — memória bug_opacity_botao_dilui_contraste_texto).
          className="flex min-h-11 items-center gap-2 rounded-pill bg-danger-fill px-5 py-2.5 text-small font-bold text-white outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:brightness-75"
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
