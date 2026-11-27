import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Ban, X } from 'lucide-react';
import { useAdminDriverDetail } from '../hooks/useAdminDriverDetail';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { VerificationStatusPill } from '../components/documents/DocumentStatusPills';
import { DriverDocumentCard, type DocumentDecisionKind } from '../components/documents/DriverDocumentCard';
import { DriverRegistrationPanel } from '../components/documents/DriverRegistrationPanel';
import { ApproveDocumentDialog } from '../components/documents/ApproveDocumentDialog';
import { RejectDocumentDialog } from '../components/documents/RejectDocumentDialog';
import { SuspendDriverDialog } from '../components/documents/SuspendDriverDialog';
import { canReviewDocuments } from '../lib/permissions';
import { formatDateTime } from '../lib/format';
import type { AdminDriverDocument, DocumentDecision } from '../api';

type OpenDialog =
  | { readonly kind: DocumentDecisionKind; readonly document: AdminDriverDocument }
  | { readonly kind: 'suspend' };

type Notice = { readonly tone: 'success' | 'warning'; readonly text: string };

const CONFLICT_NOTICE =
  'Este documento já foi analisado (por você ou por outra pessoa) enquanto a confirmação estava aberta. A situação atual está abaixo.';

/**
 * Detalhe do motorista na fila de documentos (D7): documentos com o visualizador e as decisões, ao lado
 * dos dados do cadastro e do veículo para conferir. Mesmos estados das outras telas (carregando, erro,
 * vazio); nenhuma decisão é otimista — o cartão só muda depois que o servidor confirma e a tela recarrega.
 */
export function DocumentReviewDriverPage() {
  const { driverId = '' } = useParams<{ driverId: string }>();
  const [searchParams] = useSearchParams();
  const requestedDocumentId = searchParams.get('documento');
  const { admin } = useAuth();
  const { data, loading, refreshing, error, errorKind, refreshError, reload, revokeAccess } = useAdminDriverDetail(driverId);
  const [open, setOpen] = useState<OpenDialog | null>(null);
  // Sobrevive ao `reload()` — o aviso fica até a pessoa fechar.
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ readonly documentId: string; readonly tick: number } | null>(null);
  const focusedRequested = useRef(false);
  // Depois de suspender, o botão "Suspender" some: o foco vai para o aviso de suspensão (senão cairia no <body>).
  const [suspendFocusTick, setSuspendFocusTick] = useState(0);
  const suspensionRef = useRef<HTMLDivElement>(null);
  const canDecide = canReviewDocuments(admin?.role);
  const forbiddenRef = useRef<HTMLDivElement>(null);
  const forbidden = errorKind === 'forbidden';

  // 403 em qualquer chamada (recarga, visualizar, decidir, motivos): o hook já tirou o cadastro; aqui sai
  // também o diálogo (ele cita o nome do motorista) e o foco vai para o erro — o botão que estava focado sumiu
  // junto com o cartão. O aviso de decisão FICA: diz só o tipo do documento ("Foto de perfil: aprovado.") e
  // é a única confirmação de que a decisão entrou antes de o acesso cair. Por isso nenhum aviso cita o nome.
  useEffect(() => {
    if (!forbidden) return;
    setOpen(null);
    setFocusTarget(null);
    forbiddenRef.current?.focus();
  }, [forbidden]);

  // Chegou pela fila (`?documento=`): o foco começa no documento pedido, uma vez.
  useEffect(() => {
    if (focusedRequested.current || !data || !requestedDocumentId) return;
    if (data.documents.some((document) => document.documentId === requestedDocumentId)) {
      focusedRequested.current = true;
      setFocusTarget({ documentId: requestedDocumentId, tick: 1 });
    }
  }, [data, requestedDocumentId]);

  useEffect(() => {
    if (suspendFocusTick === 0 || !data?.suspension) return;
    suspensionRef.current?.focus();
    // Uma vez só: recargas depois (outra decisão) não podem roubar o foco de volta para cá.
    setSuspendFocusTick(0);
  }, [suspendFocusTick, data?.suspension]);

  const onDecide = useCallback((kind: DocumentDecisionKind, document: AdminDriverDocument) => setOpen({ kind, document }), []);

  function afterDecision(document: AdminDriverDocument, decision: DocumentDecision) {
    const previousStatus = data?.status;
    const verb = decision.status === 'approved' ? 'aprovado' : 'recusado';
    const accountApproved = decision.driverStatus === 'approved' && previousStatus !== 'approved';
    setNotice({
      tone: 'success',
      text: accountApproved
        ? `${document.typeLabel}: ${verb}. Era o último documento obrigatório — o cadastro do motorista foi aprovado.`
        : `${document.typeLabel}: ${verb}.`,
    });
    setOpen(null);
    setFocusTarget((prev) => ({ documentId: document.documentId, tick: (prev?.tick ?? 0) + 1 }));
    void reload();
  }

  function afterConflict(document: AdminDriverDocument) {
    setNotice({ tone: 'warning', text: CONFLICT_NOTICE });
    setOpen(null);
    setFocusTarget((prev) => ({ documentId: document.documentId, tick: (prev?.tick ?? 0) + 1 }));
    void reload();
  }

  return (
    <section>
      <Link
        to="/document-reviews"
        className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-sm text-small text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-info"
      >
        ← Voltar para a fila
      </Link>

      {notice && (
        <div
          role="status"
          className={
            notice.tone === 'success'
              ? 'mb-5 flex items-start justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-small text-text'
              : 'mb-5 flex items-start justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text'
          }
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Fechar aviso"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {refreshError && (
        <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger-fill px-4 py-3 text-small text-text">
          A decisão foi registrada, mas não foi possível atualizar a tela: {refreshError}{' '}
          <button type="button" onClick={() => void reload()} className="font-bold underline outline-none focus-visible:ring-2 focus-visible:ring-info">
            Atualizar
          </button>
        </p>
      )}

      {loading ? <LoadingState label="Carregando motorista…" /> : null}
      {!loading && error ? (
        // Wrapper focável: depois de um 403 com a tela aberta, o foco vem para cá (ver o efeito de `forbidden`).
        <div ref={forbiddenRef} tabIndex={-1} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-info">
          <ErrorState message={error} {...(errorKind !== 'forbidden' && errorKind !== 'not_found' ? { onRetry: () => void reload() } : {})} />
        </div>
      ) : null}
      {!loading && !error && !data ? <EmptyState title="Motorista não encontrado" /> : null}

      {!loading && !error && data ? (
        <div aria-busy={refreshing || undefined}>
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-words text-title font-bold tracking-tight text-text sm:text-heading">{data.fullName}</h1>
                <VerificationStatusPill status={data.status} />
              </div>
              <p className="mt-1 break-all text-small text-text-secondary">{data.email}</p>
            </div>
            {canDecide && data.status !== 'suspended' ? (
              <button
                type="button"
                onClick={() => setOpen({ kind: 'suspend' })}
                className="flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-pill border border-danger/40 px-4 py-2.5 text-small font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info"
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                Suspender motorista
              </button>
            ) : null}
          </header>

          {data.suspension ? (
            <div ref={suspensionRef} tabIndex={-1} className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-small text-text outline-none focus-visible:ring-2 focus-visible:ring-info">
              <p className="font-semibold">Suspenso em {formatDateTime(data.suspension.suspendedAt)}.</p>
              <p className="mt-0.5 text-text-secondary">Motivo: {data.suspension.reason}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-labelledby="driver-documents-title" className="min-w-0">
              <h2 id="driver-documents-title" className="mb-3 text-subtitle font-bold text-text">
                Documentos <span className="font-medium text-text-muted">({data.documents.length})</span>
              </h2>
              {data.documents.length === 0 ? (
                <EmptyState title="Nenhum documento enviado" hint="Os documentos aparecem aqui quando o motorista envia pelo app." />
              ) : (
                <div className="flex flex-col gap-4">
                  {data.documents.map((document) => (
                    <DriverDocumentCard
                      key={document.documentId}
                      document={document}
                      driverName={data.fullName}
                      highlighted={document.documentId === requestedDocumentId}
                      canDecide={canDecide}
                      focusTick={focusTarget?.documentId === document.documentId ? focusTarget.tick : 0}
                      onDecide={onDecide}
                      onForbidden={revokeAccess}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* No desktop, o cadastro acompanha a rolagem: o revisor confere o arquivo de baixo da lista contra o CPF
                e a CNH sem subir a página. `self-start`, senão o item da grade estica e o sticky não tem para onde ir. */}
            <aside aria-label="Dados para conferência" className="lg:sticky lg:top-24 lg:self-start">
              <DriverRegistrationPanel driver={data} />
            </aside>
          </div>
        </div>
      ) : null}

      {open && open.kind === 'approve' && data ? (
        <ApproveDocumentDialog
          document={open.document}
          driverName={data.fullName}
          onApproved={(decision) => afterDecision(open.document, decision)}
          onConflict={() => afterConflict(open.document)}
          onForbidden={revokeAccess}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open && open.kind === 'reject' && data ? (
        <RejectDocumentDialog
          document={open.document}
          driverName={data.fullName}
          onRejected={(decision) => afterDecision(open.document, decision)}
          onConflict={() => afterConflict(open.document)}
          onForbidden={revokeAccess}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open && open.kind === 'suspend' && data ? (
        <SuspendDriverDialog
          driverId={data.driverId}
          driverName={data.fullName}
          onSuspended={() => {
            setNotice({ tone: 'success', text: 'Motorista suspenso.' });
            setOpen(null);
            setSuspendFocusTick((tick) => tick + 1);
            void reload();
          }}
          onForbidden={revokeAccess}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
