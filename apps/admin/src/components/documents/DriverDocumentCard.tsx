import { memo, useEffect, useId, useRef } from 'react';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import type { AdminDriverDocument } from '../../api';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { formatCalendarDate, formatContentType, formatFileSize } from '../../lib/documentFormat';
import { DocumentStatusPill } from './DocumentStatusPills';
import { DocumentViewer } from './DocumentViewer';

export type DocumentDecisionKind = 'approve' | 'reject';

/**
 * Um documento no detalhe do motorista: metadados, o motivo que o MOTORISTA leu (se recusado), a nota
 * INTERNA (marcada como tal), o visualizador e — só se ainda está em análise e o papel pode decidir — os
 * botões de aprovar/recusar. Quem abre os diálogos é a página (um por vez); o cartão só avisa.
 *
 * `focusTick` > 0 leva o foco ao título do cartão (depois de uma decisão o botão que abriu o diálogo some,
 * e o foco cairia no <body>; ao chegar pela fila, já começa no documento pedido).
 */
export const DriverDocumentCard = memo(function DriverDocumentCard({
  document,
  driverName,
  highlighted,
  canDecide,
  focusTick,
  onDecide,
  onForbidden,
}: {
  readonly document: AdminDriverDocument;
  readonly driverName: string;
  readonly highlighted: boolean;
  readonly canDecide: boolean;
  readonly focusTick: number;
  readonly onDecide: (kind: DocumentDecisionKind, document: AdminDriverDocument) => void;
  /** 403 em qualquer chamada do cartão: a página descarta o cadastro inteiro. */
  readonly onForbidden: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusTick > 0) headingRef.current?.focus();
  }, [focusTick]);

  return (
    <article
      aria-labelledby={headingId}
      className={cn('rounded-xxl border bg-surface p-4 sm:p-5', highlighted ? 'border-cta ring-1 ring-cta/40' : 'border-border')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="min-w-0 rounded-md text-subtitle font-bold text-text outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          {document.typeLabel}
        </h3>
        <DocumentStatusPill status={document.status} />
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        <div className="flex gap-1">
          <dt>Enviado em</dt>
          <dd className="font-semibold text-text">{formatDateTime(document.submittedAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Arquivo</dt>
          <dd className="font-semibold text-text">
            {formatContentType(document.contentType)} · {formatFileSize(document.sizeBytes)}
          </dd>
        </div>
        {document.expiresOn ? (
          <div className="flex gap-1">
            <dt>Validade</dt>
            <dd className="font-semibold text-text">{formatCalendarDate(document.expiresOn)}</dd>
          </div>
        ) : null}
        {document.reviewedAt ? (
          <div className="flex gap-1">
            <dt>Analisado em</dt>
            <dd className="font-semibold text-text">{formatDateTime(document.reviewedAt)}</dd>
          </div>
        ) : null}
      </dl>

      {document.rejection ? (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-small">
          <p className="font-semibold text-text">Motivo enviado ao motorista</p>
          <p className="mt-0.5 text-text-secondary">{document.rejection.text}</p>
        </div>
      ) : null}

      {document.internalNote ? (
        <div className="mt-2 rounded-xl border border-dashed border-border-control px-3 py-2.5 text-small">
          <p className="flex items-center gap-1.5 font-semibold text-text-secondary">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Nota interna — o motorista não vê
          </p>
          <p className="mt-0.5 text-text-secondary">{document.internalNote}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <DocumentViewer
          documentId={document.documentId}
          typeLabel={document.typeLabel}
          driverName={driverName}
          contentType={document.contentType}
          onForbidden={onForbidden}
        />
      </div>

      {document.status === 'submitted' && canDecide ? (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => onDecide('approve', document)}
            className="flex min-h-11 items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Aprovar
            <span className="sr-only"> {document.typeLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => onDecide('reject', document)}
            className="flex min-h-11 items-center gap-2 rounded-pill border border-danger/40 px-5 py-2.5 text-small font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Recusar
            <span className="sr-only"> {document.typeLabel}</span>
          </button>
        </div>
      ) : null}
    </article>
  );
});
