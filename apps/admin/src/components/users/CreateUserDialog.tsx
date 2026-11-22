import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Mail, User } from 'lucide-react';
import { useApi } from '../../context/ApiContext';
import type { AdminRole, AdminUserCreateResult, ApiError } from '../../api';
import { adminUserFeedback } from '../../lib/adminUserFeedback';
import { roleRequiresSecondFactorGate } from '../../lib/permissions';
import { useTwoFactorFeedback } from '../../hooks/useTwoFactorFeedback';
import { Dialog } from '../Dialog';
import { LabeledIconInput } from '../auth/LabeledIconInput';
import { PasswordField, TotpField, isCompleteTotp } from '../auth/CodeField';
import { TwoFactorAlert } from '../auth/TwoFactorAlert';
import { RoleSelect } from './RoleSelect';
import { ActivationTokenPanel } from './ActivationTokenPanel';

const EMAIL_PATTERN = /\S+@\S+\.\S+/;

/**
 * Criar um usuário do painel: nome, e-mail, papel e — reautenticação de quem
 * está criando — a SUA senha, mais o SEU código de 6 dígitos quando o papel
 * escolhido for `dono`/`financeiro` (gate do servidor, ver `lib/permissions.ts`).
 * O usuário novo nasce sem senha; sucesso vira `ActivationTokenPanel` (token
 * de uso único, só aparece agora).
 */
export function CreateUserDialog({ onClose, onCreated }: { readonly onClose: () => void; readonly onCreated: () => void }) {
  const api = useApi();
  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const roleId = useId();
  const passwordId = useId();
  const codeId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const [created, setCreated] = useState<AdminUserCreateResult | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('suporte');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { feedback, show, clear, locked, remaining } = useTwoFactorFeedback();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const requireCode = roleRequiresSecondFactorGate(role);
  const ready = name.trim().length >= 2 && EMAIL_PATTERN.test(email) && password !== '' && (!requireCode || isCompleteTotp(code));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked || !ready) return;
    setSubmitting(true);
    clear();
    setEmailTaken(false);
    const result = await api.adminUsers.create({ name: name.trim(), email: email.trim(), role, password, ...(requireCode ? { code } : {}) });
    setSubmitting(false);
    if (result.ok) {
      setCreated(result.data);
      return;
    }
    fail(result.error);
  }

  function fail(error: ApiError) {
    if (error.kind === 'conflict' && error.reason === 'email_taken') {
      setEmailTaken(true);
      emailRef.current?.focus();
      return;
    }
    show(adminUserFeedback(error));
    switch (error.kind) {
      case 'password_invalid':
        setPassword('');
        passwordRef.current?.focus();
        break;
      case 'invalid_second_factor':
      case 'two_factor_locked':
        setCode('');
        codeRef.current?.focus();
        break;
      default:
        passwordRef.current?.focus();
    }
  }

  if (created) {
    return (
      <Dialog titleId={titleId} title="Usuário criado" onClose={onCreated} busy>
        <ActivationTokenPanel
          name={created.name}
          email={created.email}
          token={created.activationToken}
          expiresAt={created.activationTokenExpiresAt}
          onDone={onCreated}
        />
      </Dialog>
    );
  }

  const describedBy = feedback ? errorId : undefined;

  return (
    <Dialog titleId={titleId} title="Criar usuário" onClose={onClose} busy={submitting}>
      {feedback && <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mb-4" />}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <LabeledIconInput
          id={nameId}
          ref={nameRef}
          label="Nome completo"
          icon={<User className="h-4 w-4" />}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="space-y-1.5">
          <LabeledIconInput
            id={emailId}
            ref={emailRef}
            label="E-mail"
            type="email"
            icon={<Mail className="h-4 w-4" />}
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailTaken(false);
            }}
            aria-invalid={emailTaken ? true : undefined}
            required
          />
          {emailTaken && (
            <p role="alert" className="text-caption font-semibold text-danger">
              Já existe um usuário com este e-mail.
            </p>
          )}
        </div>

        <RoleSelect id={roleId} value={role} onChange={setRole} />

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-caption font-semibold text-text-secondary">Confirme com a sua conta para criar este usuário:</p>
          <div className="space-y-4">
            <PasswordField
              id={passwordId}
              ref={passwordRef}
              value={password}
              onChange={setPassword}
              invalid={feedback?.field === 'password'}
              describedBy={describedBy}
              label="Sua senha de acesso ao painel"
            />
            {requireCode && (
              <TotpField
                id={codeId}
                ref={codeRef}
                value={code}
                onChange={setCode}
                invalid={feedback?.field === 'code'}
                describedBy={describedBy}
                hint="O papel escolhido (dono/financeiro) exige verificação em duas etapas: o código do seu app autenticador."
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button
            type="submit"
            aria-disabled={submitting || locked || !ready}
            onClick={(e) => {
              if (submitting || locked || !ready) e.preventDefault();
            }}
            className="flex h-11 items-center justify-center rounded-xl bg-cta text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta sm:flex-1"
          >
            {submitting ? 'Criando…' : 'Criar usuário'}
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
