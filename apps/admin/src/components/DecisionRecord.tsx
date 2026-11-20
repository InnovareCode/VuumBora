import { formatDateTime } from '../lib/format';
import type { DriverApplication } from '../api';

/**
 * Mostrado no lugar dos botões quando a candidatura já foi decidida — quem
 * decidiu, quando e, na recusa, o motivo. Nunca oferece decidir de novo
 * (regra do briefing); quem chama já garante isso só renderizando este
 * componente quando `status !== 'pending'`.
 */
export function DecisionRecord({ application }: { readonly application: DriverApplication }) {
  if (!application.decidedAt || !application.decidedBy) return null;
  const verb = application.status === 'approved' ? 'Aprovada' : 'Recusada';

  return (
    <div className="rounded-xl border border-border bg-elevated px-4 py-3 text-small text-text-secondary">
      <p>
        <strong className="font-bold text-text">{verb}</strong> por {application.decidedBy.name} em{' '}
        {formatDateTime(application.decidedAt)}.
      </p>
      {application.decisionReason && (
        <p className="mt-1.5">
          <span className="font-semibold text-text-muted">Motivo: </span>
          {application.decisionReason}
        </p>
      )}
    </div>
  );
}
