import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ApproveDialog } from './ApproveDialog';
import { RejectDialog } from './RejectDialog';

type OpenDialog = 'approve' | 'reject' | null;

/**
 * Botões "Aprovar"/"Recusar" da tela de detalhe. Quem decide se eles
 * aparecem é a página (papel + `status === 'pending'`, ver
 * `lib/permissions.ts`) — este componente só abre o diálogo certo e repassa
 * o resultado: nunca muda o status sozinho (sem otimismo — o dado só muda
 * depois que `onDecided`/`onConflict` disparam um `reload()` de verdade).
 */
export function DecisionActions({
  applicationId,
  applicantName,
  onDecided,
  onConflict,
}: {
  readonly applicationId: string;
  readonly applicantName: string;
  readonly onDecided: () => void;
  readonly onConflict: () => void;
}) {
  const [open, setOpen] = useState<OpenDialog>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen('approve')}
          className="flex items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Aprovar
        </button>
        <button
          type="button"
          onClick={() => setOpen('reject')}
          className="flex items-center gap-2 rounded-pill border border-danger/40 px-5 py-2.5 text-small font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Recusar
        </button>
      </div>

      {/* Só existem no DOM enquanto abertos (nunca escondidos com CSS) — ver
          comentário em `Dialog.tsx` sobre por que isso importa. */}
      {open === 'approve' && (
        <ApproveDialog
          applicationId={applicationId}
          applicantName={applicantName}
          onSuccess={() => {
            setOpen(null);
            onDecided();
          }}
          onConflict={() => {
            setOpen(null);
            onConflict();
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'reject' && (
        <RejectDialog
          applicationId={applicationId}
          applicantName={applicantName}
          onSuccess={() => {
            setOpen(null);
            onDecided();
          }}
          onConflict={() => {
            setOpen(null);
            onConflict();
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
