import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '../../context/ApiContext';
import type { PostLoginDestination } from '../../context/AuthContext';
import type { AdminUser, DataOrigin, SecondFactorChallenge } from '../../api';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { useChallengeExpiry } from '../../hooks/useChallengeExpiry';
import { RecoveryField, TotpField, isCompleteTotp, isPlausibleRecovery } from './CodeField';
import { RecoveryUsedNotice } from './RecoveryUsedNotice';
import { TwoFactorAlert } from './TwoFactorAlert';

type Method = 'totp' | 'recovery';

/**
 * Passo 2 do login (senha já aceita, falta o segundo fator). O
 * `challengeToken` chega por props e nunca sai da memória: nada de storage,
 * URL ou log. Erros por `error.code`:
 *  - código inválido: fica na tela, limpa o campo e devolve o foco a ele (texto próprio para código de
 *    recuperação, que não vem do app autenticador);
 *  - 429 `two_factor_locked`: aviso com contagem e envio travado;
 *  - `challenge_invalid` / expirou: volta ao e-mail/senha com a explicação.
 *
 * Entrou com código de RECUPERAÇÃO: antes de aceitar a sessão, uma tela diz quantos códigos restam e
 * oferece gerar novos (`RecoveryUsedNotice`). Com TOTP a sessão é aceita na hora.
 *
 * Ordem do documento (= ordem do Tab): aviso → campo → Entrar → alternar
 * método → voltar. Voltar vem por último de propósito: é a saída, não o caminho.
 */
export function SecondFactorStep({
  challenge,
  onSuccess,
  onBackToCredentials,
}: {
  readonly challenge: SecondFactorChallenge;
  /** `goTo`: destino pedido pela pessoa na tela de aviso (`/security`, para gerar novos códigos). */
  readonly onSuccess: (admin: AdminUser, origin: DataOrigin, goTo?: PostLoginDestination) => void;
  readonly onBackToCredentials: (message?: string) => void;
}) {
  const api = useApi();
  const headingId = useId();
  const codeId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<Method>('totp');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** Sessão já emitida pelo servidor, mas só aceita pela UI depois do aviso de código de recuperação usado. */
  const [recoveryNotice, setRecoveryNotice] = useState<{ admin: AdminUser; origin: DataOrigin; remaining: number | null } | null>(null);
  const { feedback, report, clear, locked, remaining } = useTwoFactorFeedback();

  useChallengeExpiry(challenge.challengeExpiresAt, true, () =>
    onBackToCredentials('O tempo para confirmar o acesso acabou (10 minutos). Informe e-mail e senha novamente.'),
  );

  // Entrar no passo ou trocar de método: o campo antigo some do DOM, então o foco vai para o novo.
  useEffect(() => {
    inputRef.current?.focus();
  }, [method]);

  const ready = method === 'totp' ? isCompleteTotp(code) : isPlausibleRecovery(code);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || !ready) return;
    setSubmitting(true);
    clear();
    const result = await api.auth.verifySecondFactor({ challengeToken: challenge.challengeToken, code });
    if (result.ok) {
      const { admin, recoveryCodesRemaining } = result.data;
      if (method === 'recovery') {
        setRecoveryNotice({ admin, origin: result.origin, remaining: recoveryCodesRemaining });
        return;
      }
      onSuccess(admin, result.origin);
      return;
    }
    setSubmitting(false);
    if (result.error.kind === 'challenge_invalid') {
      onBackToCredentials('O tempo para confirmar o acesso acabou ou ele já foi usado. Informe e-mail e senha novamente.');
      return;
    }
    report(result.error, method);
    setCode('');
    inputRef.current?.focus();
  }

  function switchMethod() {
    setMethod((current) => (current === 'totp' ? 'recovery' : 'totp'));
    setCode('');
    clear();
  }

  const invalid = feedback?.field === 'code';
  const describedBy = feedback ? errorId : undefined;

  if (recoveryNotice) {
    return (
      <RecoveryUsedNotice
        remaining={recoveryNotice.remaining}
        onContinue={() => onSuccess(recoveryNotice.admin, recoveryNotice.origin)}
        onGenerateNew={() => onSuccess(recoveryNotice.admin, recoveryNotice.origin, '/security')}
      />
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-8 space-y-2 text-left">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cta-pressed">
          Verificação em duas etapas
        </span>
        <h1 id={headingId} className="text-title font-bold tracking-tight text-text sm:text-heading">
          {method === 'totp' ? 'Digite o código' : 'Use um código de recuperação'}
        </h1>
        <p className="text-small leading-relaxed text-text-secondary sm:text-body">
          {method === 'totp'
            ? 'Abra o app autenticador e digite o código de 6 dígitos da sua conta VuumBora.'
            : 'Digite um dos códigos de recuperação que você guardou. Cada um vale uma única vez.'}
        </p>
      </div>

      {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mb-6" />}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {method === 'totp' ? (
          <TotpField key="totp" id={codeId} ref={inputRef} value={code} onChange={setCode} invalid={invalid} describedBy={describedBy} />
        ) : (
          <RecoveryField
            key="recovery"
            id={codeId}
            ref={inputRef}
            value={code}
            onChange={setCode}
            invalid={invalid}
            describedBy={describedBy}
            hint="Maiúsculas, hífen e espaço não importam."
          />
        )}

        <button
          type="submit"
          disabled={submitting || locked || !ready}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
              Verificando…
            </span>
          ) : (
            'Entrar'
          )}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-5 text-small">
        <button
          type="button"
          onClick={switchMethod}
          className="min-h-11 rounded-lg px-3 py-2 font-semibold text-text-secondary underline-offset-4 outline-none transition-colors hover:text-text hover:underline focus-visible:ring-2 focus-visible:ring-info"
        >
          {method === 'totp' ? 'Usar um código de recuperação' : 'Voltar ao código do app autenticador'}
        </button>
        <button
          type="button"
          onClick={() => onBackToCredentials()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Usar outra conta
        </button>
      </div>
    </section>
  );
}
