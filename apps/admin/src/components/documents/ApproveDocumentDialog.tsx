import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from '../Dialog';
import { useApi } from '../../context/ApiContext';
import { errorMessage, type AdminDriverDocument, type DocumentDecision } from '../../api';
import { createIdempotencyKey } from '../../lib/idempotency';
import { natalToday } from '../../lib/documentFormat';

/**
 * Confirmação antes de aprovar UM documento. A validade é opcional NA TELA porque o contrato não diz ao
 * painel quais tipos vencem (a lista de exigências é dado, N1, e `AdminDriverDocument` não traz
 * `hasExpiry`): quem decide é o servidor, com `422 invalid_expires_on` no campo `expiresOn` — a mensagem
 * dele aparece embaixo do campo e o foco volta para lá.
 *
 * Nada muda na tela antes de o servidor confirmar (sem otimismo). A chave de idempotência nasce quando o
 * diálogo abre e vale para qualquer nova tentativa dentro dele.
 */
export function ApproveDocumentDialog({
  document,
  driverName,
  onApproved,
  onConflict,
  onForbidden,
  onClose,
}: {
  readonly document: AdminDriverDocument;
  readonly driverName: string;
  readonly onApproved: (decision: DocumentDecision) => void;
  readonly onConflict: () => void;
  /** 403: o papel perdeu o acesso — a página fecha o diálogo e tira o cadastro da tela. */
  readonly onForbidden: () => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const titleId = useId();
  const dateId = useId();
  const hintId = useId();
  const fieldErrorId = useId();
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [expiresOn, setExpiresOn] = useState('');
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Conta tentativas com erro: o efeito de foco roda de novo mesmo quando a mensagem se repete.
  const [errorTick, setErrorTick] = useState(0);
  const dateRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (errorTick === 0) return;
    if (fieldError) dateRef.current?.focus();
    else errorRef.current?.focus();
  }, [errorTick, fieldError]);

  async function handleConfirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    setFieldError(null);
    const result = await api.documentReview.approve(document.documentId, expiresOn ? { expiresOn } : {}, idempotencyKey);
    setPending(false);
    if (result.ok) {
      onApproved(result.data);
      return;
    }
    if (result.error.kind === 'conflict') {
      onConflict();
      return;
    }
    if (result.error.kind === 'forbidden') {
      onForbidden();
      return;
    }
    if (result.error.kind === 'validation' && result.error.fields['expiresOn'] !== undefined) {
      setFieldError(result.error.fields['expiresOn'] || 'Data de validade ausente, inválida ou já passada.');
    } else {
      setError(errorMessage(result.error));
    }
    setErrorTick((tick) => tick + 1);
  }

  const describedBy = fieldError ? `${hintId} ${fieldErrorId}` : hintId;

  return (
    <Dialog
      titleId={titleId}
      title="Aprovar documento"
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
            aria-disabled={pending}
            className="flex min-h-11 items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-wait"
          >
            {pending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {pending ? 'Aprovando…' : 'Confirmar aprovação'}
          </button>
        </div>
      }
    >
      <p className="text-small text-text-secondary">
        <strong className="font-bold text-text">{document.typeLabel}</strong> de {driverName}. Aprove só depois de conferir o
        arquivo contra os dados do cadastro.
      </p>

      <div className="mt-4">
        <label htmlFor={dateId} className="mb-1.5 block text-caption font-semibold uppercase tracking-wide text-text-muted">
          Validade do documento
        </label>
        <input
          ref={dateRef}
          id={dateId}
          type="date"
          value={expiresOn}
          min={natalToday()}
          onChange={(e) => {
            setExpiresOn(e.target.value);
            setFieldError(null);
          }}
          readOnly={pending}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          className="w-full rounded-xl border border-border-control bg-screen px-3 py-2.5 text-body text-text outline-none focus-visible:ring-2 focus-visible:ring-info aria-invalid:border-danger"
        />
        <p id={hintId} className="mt-1.5 text-caption text-text-muted">
          Preencha se o documento tem data de validade impressa. Se ele não vence, deixe em branco.
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
