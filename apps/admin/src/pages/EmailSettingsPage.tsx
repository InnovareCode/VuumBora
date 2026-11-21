import { useState } from 'react';
import { Mail } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/RequestState';
import { DeliverabilityNotice } from '../components/email/DeliverabilityNotice';
import { EmailSettingsForm } from '../components/email/EmailSettingsForm';
import { EmailSummaryBand } from '../components/email/EmailSummaryBand';
import { TestEmailPanel } from '../components/email/TestEmailPanel';
import { useAuth } from '../context/AuthContext';
import { useEmailSettings } from '../hooks/useEmailSettings';
import { errorMessage } from '../api';

/**
 * Configuração do servidor de e-mail (SMTP) — só `dono` (o menu esconde a
 * rota para os outros papéis e o servidor devolve 403). `dirty` sobe do
 * formulário porque o bloco de teste precisa saber que há alteração não salva.
 */
export function EmailSettingsPage() {
  const { admin } = useAuth();
  const { state, apply, retry } = useEmailSettings();
  const [dirty, setDirty] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="E-mail"
        icon={Mail}
        description="Servidor SMTP que envia os e-mails do VuumBora, como a verificação de e-mail e a recuperação de senha."
      />

      {state.status === 'loading' && <LoadingState label="Carregando…" />}
      {state.status === 'error' && <ErrorState message={errorMessage(state.error)} onRetry={retry} />}

      {state.status === 'ready' && (
        <>
          <EmailSummaryBand settings={state.data} />

          <section className="rounded-xxl border border-border bg-surface p-5 sm:p-6">
            <EmailSettingsForm settings={state.data} onChanged={apply} onDirtyChange={setDirty} />
          </section>

          <section className="rounded-xxl border border-border bg-surface p-5 sm:p-6">
            <TestEmailPanel configured={state.data.configured} dirty={dirty} defaultRecipient={admin?.email} />
          </section>

          <DeliverabilityNotice />
        </>
      )}
    </div>
  );
}
