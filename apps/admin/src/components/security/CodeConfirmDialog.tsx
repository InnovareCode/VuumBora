import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useApi } from '../../context/ApiContext';
import type { ApiError } from '../../api';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { Dialog } from '../Dialog';
import { PasswordField, RecoveryField, TotpField, isCompleteTotp, isPlausibleRecovery } from '../auth/CodeField';
import { RecoveryCodesPanel } from '../auth/RecoveryCodesPanel';
import { TwoFactorAlert } from '../auth/TwoFactorAlert';

export type CodeConfirmAction = 'regenerate' | 'disable';

const COPY: Record<CodeConfirmAction, { title: string; body: string; submit: string; danger: boolean }> = {
  regenerate: {
    title: 'Gerar novos códigos de recuperação',
    body: 'Os códigos atuais deixam de valer assim que os novos forem gerados. Confirme com a sua senha e com o código do app autenticador.',
    submit: 'Gerar novos códigos',
    danger: false,
  },
  disable: {
    title: 'Desativar verificação em duas etapas',
    body: 'A conta volta a entrar só com e-mail e senha, os códigos de recuperação deixam de valer e as outras sessões abertas desta conta serão encerradas. Confirme com a sua senha e com o código do app autenticador ou um código de recuperação.',
    submit: 'Desativar',
    danger: true,
  },
};

/**
 * Confirmação para as duas ações sensíveis das configurações: regenerar
 * códigos (só TOTP — recuperação não vale, contrato) e desativar (TOTP ou
 * recuperação). As duas pedem também a SENHA ATUAL (reautenticação). Regenerar
 * termina na exibição ÚNICA dos novos códigos, com o diálogo travado até a
 * pessoa confirmar que guardou.
 *
 * Código errado é 401 `invalid_second_factor` e senha errada é 403
 * `password_invalid` — o cliente HTTP NÃO trata nenhum dos dois como sessão
 * expirada (senão errar um campo derrubaria o login). Cada erro vai para o campo
 * certo: senha errada apaga a senha e foca nela; código errado apaga o código.
 * Ordem do documento: senha → código → alternar método → confirmar/cancelar.
 */
export function CodeConfirmDialog({
  action,
  onClose,
  onChanged,
}: {
  readonly action: CodeConfirmAction;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const api = useApi();
  const titleId = useId();
  const passwordId = useId();
  const codeId = useId();
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);
  const [method, setMethod] = useState<'totp' | 'recovery'>('totp');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newCodes, setNewCodes] = useState<readonly string[] | null>(null);
  const { feedback, report, clear, locked, remaining } = useTwoFactorFeedback();
  const copy = COPY[action];

  // Abre no campo da senha; ao trocar o método de código, o campo antigo some e o foco vai para o novo.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      passwordRef.current?.focus();
    } else {
      codeRef.current?.focus();
    }
  }, [method]);

  const codeReady = method === 'totp' ? isCompleteTotp(code) : isPlausibleRecovery(code);
  const ready = password !== '' && codeReady;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || !ready) return;
    setSubmitting(true);
    clear();
    if (action === 'regenerate') {
      const result = await api.twoFactor.regenerateRecoveryCodes({ code, password });
      if (result.ok) {
        onChanged();
        setNewCodes(result.data.recoveryCodes);
        return;
      }
      fail(result.error);
    } else {
      const result = await api.twoFactor.disable({ code, password });
      if (result.ok) {
        onChanged();
        onClose();
        return;
      }
      fail(result.error);
    }
  }

  function fail(error: ApiError) {
    setSubmitting(false);
    report(error, method);
    if (error.kind === 'password_invalid') {
      setPassword('');
      passwordRef.current?.focus();
    } else if (error.kind === 'invalid_second_factor') {
      setCode('');
      codeRef.current?.focus();
    } else {
      // Bloqueio (`account_locked`/`two_factor_locked`), rede etc.: mantém o que foi digitado.
      codeRef.current?.focus();
    }
  }

  if (newCodes) {
    return (
      <Dialog titleId={titleId} title="Novos códigos de recuperação" onClose={onClose} busy>
        <RecoveryCodesPanel codes={newCodes} continueLabel="Concluir" onContinue={onClose} />
      </Dialog>
    );
  }

  const describedBy = feedback ? errorId : undefined;

  return (
    <Dialog titleId={titleId} title={copy.title} onClose={onClose} busy={submitting}>
      <p className="text-small leading-relaxed text-text-secondary">{copy.body}</p>

      {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mt-4" />}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <PasswordField
          id={passwordId}
          ref={passwordRef}
          value={password}
          onChange={setPassword}
          invalid={feedback?.field === 'password'}
          describedBy={describedBy}
        />

        {method === 'totp' ? (
          <TotpField
            key="totp"
            id={codeId}
            ref={codeRef}
            value={code}
            onChange={setCode}
            invalid={feedback?.field === 'code'}
            describedBy={describedBy}
          />
        ) : (
          <RecoveryField
            key="recovery"
            id={codeId}
            ref={codeRef}
            value={code}
            onChange={setCode}
            invalid={feedback?.field === 'code'}
            describedBy={describedBy}
          />
        )}

        {action === 'disable' && (
          <button
            type="button"
            onClick={() => {
              setMethod((m) => (m === 'totp' ? 'recovery' : 'totp'));
              setCode('');
              clear();
            }}
            className="min-h-11 rounded-lg px-1 py-1.5 text-small font-semibold text-text-secondary underline-offset-4 outline-none transition-colors hover:text-text hover:underline focus-visible:ring-2 focus-visible:ring-info"
          >
            {method === 'totp' ? 'Usar um código de recuperação' : 'Usar o código do app autenticador'}
          </button>
        )}

        {/* `sm:flex-1` (não `flex-1` solto): em coluna, `flex-1` zera a altura (flex-basis 0 no eixo vertical) e
            o botão colapsa para ~21 px no celular — achado medido em 21/11/2026. */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button
            type="submit"
            aria-disabled={submitting || locked || !ready}
            onClick={(e) => {
              if (submitting || locked || !ready) e.preventDefault();
            }}
            className={
              copy.danger
                ? 'flex h-11 items-center justify-center rounded-xl bg-danger-fill text-small font-bold text-white outline-none transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:flex-1'
                : 'flex h-11 items-center justify-center rounded-xl bg-cta text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta sm:flex-1'
            }
          >
            {submitting ? 'Confirmando…' : copy.submit}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-11 items-center justify-center rounded-xl border border-border-control text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info disabled:opacity-60 sm:flex-1"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
