import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { EmailSettings } from '../../api';
import { formatDateTime } from '../../lib/format';

const MISSING_LABEL: Record<string, string> = {
  host: 'servidor',
  port: 'porta',
  from: 'remetente',
  password: 'senha (há um usuário definido)',
};

/**
 * Faixa-resumo: o que está valendo AGORA para o envio (o `summary` vem pronto
 * do servidor, "Enviando por host:porta como Nome <remetente>"), ou o que
 * falta para o e-mail funcionar. `role="status"`: quando o resumo muda depois
 * de salvar, o leitor de tela anuncia sem roubar o foco.
 */
export function EmailSummaryBand({ settings }: { readonly settings: EmailSettings }) {
  const missing = settings.missing.map((name) => MISSING_LABEL[name] ?? name);

  if (settings.configured && settings.summary) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xxl border border-success/30 bg-success/10 px-4 py-3.5 sm:px-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-0">
          <p className="break-words text-small font-bold text-text sm:text-body">{settings.summary}</p>
          {settings.updatedAt && (
            <p className="mt-0.5 text-caption text-text-secondary">Última alteração feita aqui em {formatDateTime(settings.updatedAt)}.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="flex items-start gap-3 rounded-xxl border border-warning/40 bg-warning/10 px-4 py-3.5 sm:px-5">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-small font-bold text-text sm:text-body">O envio de e-mail ainda não está configurado.</p>
        {missing.length > 0 && (
          <p className="mt-0.5 text-small text-text-secondary">
            Falta definir: <strong className="font-bold text-text">{missing.join(', ')}</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
