import { forwardRef, type ReactNode } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { LabeledIconInput } from './LabeledIconInput';

export const TOTP_LENGTH = 6;

/** Só dígitos, no máximo 6 — colar "123 456" ou "123-456" do app vira "123456". */
export function normalizeTotp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, TOTP_LENGTH);
}

export function isCompleteTotp(value: string): boolean {
  return value.length === TOTP_LENGTH;
}

interface CommonProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly hint?: ReactNode;
}

/**
 * Campo do código de 6 dígitos do app autenticador. UM `<input>` (não seis
 * caixinhas): leitor de tela, colar do app e o preenchimento automático
 * `one-time-code` do celular funcionam sem truque. `inputMode="numeric"`
 * abre o teclado numérico sem virar `type="number"` (que aceita "e" e perde zeros).
 */
export const TotpField = forwardRef<HTMLInputElement, CommonProps>(
  ({ id, value, onChange, invalid, describedBy, disabled, label = 'Código do app autenticador', hint }, ref) => (
    <div className="space-y-1.5">
      <LabeledIconInput
        id={id}
        ref={ref}
        label={label}
        icon={<ShieldCheck className="h-4 w-4" />}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={TOTP_LENGTH + 4}
        spellCheck={false}
        placeholder="000000"
        value={value}
        onChange={(e) => onChange(normalizeTotp(e.target.value))}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        className="font-mono text-subtitle font-semibold tracking-[0.35em] tabular-nums"
      />
      {hint && <p className="text-caption text-text-muted">{hint}</p>}
    </div>
  ),
);
TotpField.displayName = 'TotpField';

/** Formato `ABCDE-FGHIJ`; o servidor ignora caixa, hífen e espaço, então a tela só normaliza para exibição. */
export function normalizeRecovery(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-\s]/g, '').slice(0, 24);
}

export const RECOVERY_MIN_LENGTH = 10;

export function isPlausibleRecovery(value: string): boolean {
  return value.replace(/[\s-]/g, '').length >= RECOVERY_MIN_LENGTH;
}

export const RecoveryField = forwardRef<HTMLInputElement, CommonProps>(
  ({ id, value, onChange, invalid, describedBy, disabled, label = 'Código de recuperação', hint }, ref) => (
    <div className="space-y-1.5">
      <LabeledIconInput
        id={id}
        ref={ref}
        label={label}
        icon={<KeyRound className="h-4 w-4" />}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="ABCDE-FGHIJ"
        value={value}
        onChange={(e) => onChange(normalizeRecovery(e.target.value))}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        className="font-mono font-semibold uppercase tracking-widest"
      />
      {hint && <p className="text-caption text-text-muted">{hint}</p>}
    </div>
  ),
);
RecoveryField.displayName = 'RecoveryField';

/** Código de ativação (enrollmentToken, `ABCDE-FGHIJ-KLMNO-PQRST`): o servidor ignora caixa, hífen e espaço; a tela só normaliza para leitura. */
export function normalizeActivation(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-\s]/g, '').slice(0, 32);
}

/** O servidor exige ao menos 10 caracteres; checar só o piso evita rejeitar no cliente um formato que o servidor aceita. */
export function isPlausibleActivation(value: string): boolean {
  return value.replace(/[\s-]/g, '').length >= 10;
}

export const ActivationField = forwardRef<HTMLInputElement, CommonProps>(
  ({ id, value, onChange, invalid, describedBy, disabled, label = 'Código de ativação', hint }, ref) => (
    <div className="space-y-1.5">
      <LabeledIconInput
        id={id}
        ref={ref}
        label={label}
        icon={<KeyRound className="h-4 w-4" />}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="ABCDE-FGHIJ-KLMNO-PQRST"
        value={value}
        onChange={(e) => onChange(normalizeActivation(e.target.value))}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        // 16 px (o `text-body` do campo base): abaixo disso o Safari do iOS dá zoom na página ao focar. NÃO repetir um
        // `text-small`/`text-caption` aqui — as duas classes de tamanho coexistem e `cn` não resolve o conflito.
        className="font-mono font-semibold uppercase"
      />
      {hint && <p className="text-caption text-text-muted">{hint}</p>}
    </div>
  ),
);
ActivationField.displayName = 'ActivationField';

/**
 * Senha ATUAL da conta, pedida de novo antes de ligar/desligar/regenerar o 2FA
 * (reautenticação). `current-password`: deixa o gerenciador de senhas preencher
 * — é a senha do próprio painel. Fica só em estado de componente; some ao fechar.
 */
export const PasswordField = forwardRef<HTMLInputElement, CommonProps>(
  ({ id, value, onChange, invalid, describedBy, disabled, label = 'Sua senha atual', hint }, ref) => (
    <div className="space-y-1.5">
      <LabeledIconInput
        id={id}
        ref={ref}
        label={label}
        icon={<Lock className="h-4 w-4" />}
        type="password"
        autoComplete="current-password"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
      />
      {hint && <p className="text-caption text-text-muted">{hint}</p>}
    </div>
  ),
);
PasswordField.displayName = 'PasswordField';
