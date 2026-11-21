import { useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/RequestState';
import { CodeConfirmDialog, type CodeConfirmAction } from '../components/security/CodeConfirmDialog';
import { EnableTwoFactorDialog } from '../components/security/EnableTwoFactorDialog';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import { errorMessage } from '../api';
import { LOW_RECOVERY_CODES_THRESHOLD } from '../lib/twoFactorFeedback';

type OpenDialog = 'enable' | CodeConfirmAction | null;

const secondaryButton =
  'flex h-11 items-center justify-center gap-2 rounded-xl border border-border-control bg-surface px-4 text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info';

/**
 * Segurança da conta: ligar/desligar o segundo fator e regenerar códigos de
 * recuperação. Quem é `required` (dono, financeiro) não vê "Desativar" — o
 * servidor também recusa (403), isto só evita oferecer o botão.
 */
export function SecuritySettingsPage() {
  const { state, reload, retry } = useTwoFactorStatus();
  const [open, setOpen] = useState<OpenDialog>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Segurança"
        icon={ShieldCheck}
        description="Verificação em duas etapas com app autenticador e códigos de recuperação."
      />

      {state.status === 'loading' && <LoadingState label="Carregando…" />}
      {state.status === 'error' && <ErrorState message={errorMessage(state.error)} onRetry={retry} />}

      {state.status === 'ready' && (
        <section aria-labelledby="two-factor-heading" className="space-y-5 rounded-xxl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="two-factor-heading" className="text-subtitle font-bold text-text">
              Verificação em duas etapas
            </h2>
            <span
              className={
                state.data.enabled
                  ? 'inline-flex items-center gap-1.5 rounded-pill bg-success/15 px-3 py-1 text-caption font-bold text-success'
                  : 'inline-flex items-center gap-1.5 rounded-pill bg-elevated px-3 py-1 text-caption font-bold text-text-secondary'
              }
            >
              {state.data.enabled ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />}
              {state.data.enabled ? 'Ativa' : 'Desativada'}
            </span>
            {state.data.required && (
              <span className="inline-flex rounded-pill bg-cta/15 px-3 py-1 text-caption font-bold text-cta-pressed">Obrigatória para o seu papel</span>
            )}
          </div>

          {state.data.enabled ? (
            <>
              <p className="text-small leading-relaxed text-text-secondary">
                Ao entrar, além da senha, você digita o código de 6 dígitos do app autenticador.
              </p>
              <p
                className={
                  state.data.recoveryCodesRemaining < LOW_RECOVERY_CODES_THRESHOLD
                    ? 'flex items-center gap-2 text-small font-semibold text-warning'
                    : 'flex items-center gap-2 text-small text-text-secondary'
                }
              >
                <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {state.data.recoveryCodesRemaining === 0
                    ? 'Você não tem mais códigos de recuperação. Gere novos.'
                    : `${state.data.recoveryCodesRemaining} ${state.data.recoveryCodesRemaining === 1 ? 'código de recuperação restante' : 'códigos de recuperação restantes'}.`}
                </span>
              </p>
              <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
                <button type="button" onClick={() => setOpen('regenerate')} className={secondaryButton}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Gerar novos códigos
                </button>
                {!state.data.required && (
                  <button
                    type="button"
                    onClick={() => setOpen('disable')}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-danger/40 px-4 text-small font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info"
                  >
                    <ShieldOff className="h-4 w-4" aria-hidden="true" />
                    Desativar
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-small leading-relaxed text-text-secondary">
                Acrescenta uma segunda camada ao login: mesmo com a senha vazada, ninguém entra sem o código do seu celular.
              </p>
              <div className="border-t border-border pt-5">
                <button
                  type="button"
                  onClick={() => setOpen('enable')}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-cta px-5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Ativar verificação em duas etapas
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {open === 'enable' && <EnableTwoFactorDialog onClose={() => setOpen(null)} onChanged={reload} />}
      {(open === 'regenerate' || open === 'disable') && (
        <CodeConfirmDialog action={open} onClose={() => setOpen(null)} onChanged={reload} />
      )}
    </div>
  );
}
