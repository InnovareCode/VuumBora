import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ApiError, Result, StepUp } from '../../api';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { Dialog } from '../Dialog';
import { PasswordField, TotpField, isCompleteTotp } from '../auth/CodeField';
import { TwoFactorAlert } from '../auth/TwoFactorAlert';

/**
 * Reautenticação (step-up) antes de uma ação sensível: a SENHA ATUAL do dono +
 * o TOTP de 6 dígitos do app autenticador (código de recuperação NÃO vale — contrato
 * `docs/contrato-admin-email.md`). Hoje serve à tela "E-mail" (salvar e remover a senha
 * salva do SMTP); fica genérico porque a próxima ação sensível pede o mesmo par.
 *
 * Quem chama passa `run`, que faz a chamada real com o `StepUp` digitado. Erros:
 *  - `password_invalid` (403): apaga a senha e foca nela;
 *  - `invalid_second_factor` (401): apaga o código e foca nele;
 *  - `account_locked` (espera curta por par e-mail + IP, 1 s a 15 min) e `two_factor_locked`
 *    (bloqueio de 15 min do código): aviso com contagem e envio travado SÓ até acabar;
 *  - rede / indisponível / `two_factor_unavailable`: aviso âmbar, mantém o digitado.
 *  NENHUM deles derruba a sessão (o cliente HTTP mapeia por `error.code` antes do 401 genérico).
 *  Erros que pertencem ao FORMULÁRIO de quem abriu o diálogo (campo inválido, host bloqueado…)
 *  vão para `onRejected`; se devolver `true`, o chamador assumiu e fechou o diálogo.
 *
 * Senha e código vivem só em `useState` deste componente: somem ao fechar, nunca vão a
 * storage, URL nem log. Ordem do documento (= ordem do Tab): senha, código, confirmar, cancelar.
 */
export function StepUpDialog<T>({
  title,
  intro,
  submitLabel,
  pendingLabel,
  danger = false,
  onClose,
  run,
  onDone,
  onRejected,
}: {
  readonly title: string;
  /** Explica o que está sendo confirmado — texto estático acima dos campos. */
  readonly intro: ReactNode;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly danger?: boolean;
  readonly onClose: () => void;
  readonly run: (stepUp: StepUp) => Promise<Result<T>>;
  readonly onDone: (data: T) => void;
  readonly onRejected?: (error: ApiError) => boolean;
}) {
  const titleId = useId();
  const passwordId = useId();
  const codeId = useId();
  const errorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { feedback, report, clear, locked, remaining } = useTwoFactorFeedback();

  // `useFocusTrap` (dentro de <Dialog>) foca o primeiro focável, que é o "Fechar" do cabeçalho. Este efeito roda
  // DEPOIS (filho antes do pai) e leva o foco ao campo da senha — o primeiro campo que a pessoa precisa preencher.
  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const ready = password !== '' && isCompleteTotp(code);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || !ready) return;
    setSubmitting(true);
    clear();
    const result = await run({ password, code });
    if (result.ok) {
      // Sucesso: quem chamou fecha o diálogo (e a senha/código somem com o estado). Não reabilita nada aqui.
      onDone(result.data);
      return;
    }
    setSubmitting(false);
    if (onRejected?.(result.error)) return;
    report(result.error);
    switch (result.error.kind) {
      case 'password_invalid':
        // Apaga só a senha (é o que está errado) e mantém o código: medido contra a API real, senha errada NÃO gasta o
        // TOTP (a senha é conferida antes), então o mesmo código ainda vale — dentro dos 30 s do passo.
        setPassword('');
        passwordRef.current?.focus();
        break;
      case 'invalid_second_factor':
      case 'two_factor_locked':
        setCode('');
        codeRef.current?.focus();
        break;
      default:
        // Espera (`account_locked`), rede etc.: mantém o que foi digitado; o foco volta ao primeiro campo.
        passwordRef.current?.focus();
    }
  }

  const describedBy = feedback ? errorId : undefined;

  return (
    <Dialog titleId={titleId} title={title} onClose={onClose} busy={submitting}>
      <p className="text-small leading-relaxed text-text-secondary">{intro}</p>

      {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mt-4" />}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <PasswordField
          id={passwordId}
          ref={passwordRef}
          value={password}
          onChange={setPassword}
          invalid={feedback?.field === 'password'}
          describedBy={describedBy}
          label="Sua senha de acesso ao painel"
          hint="A senha da sua conta de administrador — não a do servidor de e-mail."
        />

        <TotpField
          id={codeId}
          ref={codeRef}
          value={code}
          onChange={setCode}
          invalid={feedback?.field === 'code'}
          describedBy={describedBy}
          hint="O código muda a cada 30 segundos e vale uma vez. Se acabou de usá-lo para entrar, espere o próximo. Código de recuperação não vale aqui."
        />

        {/* `sm:flex-1` (não `flex-1` solto): em coluna, `flex-1` zera a altura (flex-basis 0 no eixo vertical) e o
            botão colapsa para ~21 px no celular — achado medido em 21/11/2026. */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button
            type="submit"
            // `aria-disabled` (não `disabled`): desabilitar o botão que tem o foco o joga no <body>.
            aria-disabled={submitting || locked || !ready}
            onClick={(e) => {
              if (submitting || locked || !ready) e.preventDefault();
            }}
            className={
              danger
                ? 'flex h-11 items-center justify-center rounded-xl bg-danger-fill text-small font-bold text-white outline-none transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:flex-1'
                : 'flex h-11 items-center justify-center rounded-xl bg-cta text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta sm:flex-1'
            }
          >
            {submitting ? pendingLabel : submitLabel}
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
