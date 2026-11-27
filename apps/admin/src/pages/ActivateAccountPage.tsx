import { useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../context/ApiContext';
import { useAuth } from '../context/AuthContext';
import { DemoModeBanner } from '../components/DemoModeBanner';
import { AuthSplitLayout } from '../components/auth/AuthSplitLayout';
import { LabeledIconInput } from '../components/auth/LabeledIconInput';
import { ActivationField, isPlausibleActivation } from '../components/auth/CodeField';
import { AuthAlert } from '../components/auth/AuthAlert';
import { EnrollmentStep } from '../components/auth/EnrollmentStep';
import { errorMessage, type SecondFactorChallenge } from '../api';

const MIN_PASSWORD_LENGTH = 12;

const HERO_FEATURES = [
  { icon: <UserCheck className="h-4 w-4" aria-hidden="true" />, text: 'Primeiro acesso de uma conta criada por quem administra o painel' },
  { icon: <KeyRound className="h-4 w-4" aria-hidden="true" />, text: 'Defina sua própria senha — ninguém mais vai conhecê-la' },
  { icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />, text: 'Papéis sensíveis (dono/financeiro) ativam a verificação em duas etapas na sequência' },
];

type Phase =
  | { readonly name: 'form' }
  | { readonly name: 'loggingIn'; readonly enrollmentToken: string }
  | { readonly name: 'enrolling'; readonly challenge: SecondFactorChallenge; readonly enrollmentToken: string }
  | { readonly name: 'done' }
  /** Login automático pós-ativação não bateu com o esperado (ex.: conflito de outra sessão) — nunca trava a pessoa sem saída. */
  | { readonly name: 'manual'; readonly message: string };

/**
 * Primeiro acesso — `POST /auth/activate` (docs/contrato-admin-usuarios.md §6).
 * Rota PÚBLICA, sem cookie. Quem chega aqui tem um e-mail e um código de
 * ativação de uso único que o dono entregou por fora do painel.
 *
 * Papel sensível (dono/financeiro): a resposta já traz o `enrollmentToken` do
 * 2FA obrigatório — a tela então faz o LOGIN automaticamente com a senha que
 * a pessoa acabou de criar (ela já digitou aqui, não precisa digitar de
 * novo) e segue direto para o QR code (`EnrollmentStep` com
 * `initialEnrollmentToken`), sem pedir esse código uma segunda vez.
 */
export function ActivateAccountPage() {
  const api = useApi();
  const { acceptSession, login } = useAuth();
  const navigate = useNavigate();
  const headingId = useId();
  const emailId = useId();
  const tokenId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [phase, setPhase] = useState<Phase>({ name: 'form' });
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ready = /\S+@\S+\.\S+/.test(email) && isPlausibleActivation(token) && newPassword.length >= MIN_PASSWORD_LENGTH;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !ready) return;
    setSubmitting(true);
    setError(null);
    const result = await api.adminUsers.activate({ email: email.trim().toLowerCase(), token, newPassword });
    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessage(result.error));
      return;
    }
    if (!result.data.requiresTwoFactorEnrollment) {
      setPhase({ name: 'done' });
      return;
    }
    const enrollmentToken = result.data.enrollmentToken;
    if (!enrollmentToken) {
      // Contrato quebrado (devia vir junto de `requiresTwoFactorEnrollment: true`) — nunca trava sem saída.
      setPhase({ name: 'manual', message: 'Sua senha foi definida. Entre com e-mail e senha para continuar a ativação da verificação em duas etapas.' });
      return;
    }
    setPhase({ name: 'loggingIn', enrollmentToken });
    const loginResult = await login({ email: email.trim().toLowerCase(), password: newPassword });
    if (loginResult.ok && loginResult.next === 'enrollment_required') {
      setPhase({ name: 'enrolling', challenge: { challengeToken: loginResult.challengeToken, challengeExpiresAt: loginResult.challengeExpiresAt }, enrollmentToken });
      return;
    }
    // `signedIn` (2FA já estaria ativo — não devia acontecer logo após ativar) ou qualquer falha: sem risco de travar a
    // pessoa, ela entra manualmente e, se o papel ainda exigir, o login normal pede o código de novo.
    setPhase({ name: 'manual', message: 'Sua senha foi definida. Entre com e-mail e senha para continuar a ativação da verificação em duas etapas.' });
  }

  return (
    <div className="flex min-h-screen flex-col bg-screen">
      {api.mode === 'mock' ? <DemoModeBanner /> : null}

      <AuthSplitLayout heroTitle="Defina sua senha de acesso" heroSubtitle="Use o código de ativação que lhe foi entregue para criar sua senha." heroFeatures={HERO_FEATURES}>
        {phase.name === 'form' && (
          <>
            <div className="mb-8 space-y-2 text-left">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cta-pressed">
                Primeiro acesso
              </span>
              <h1 id={headingId} className="text-title font-bold tracking-tight text-text sm:text-heading">
                Ative sua conta
              </h1>
              <p className="text-small leading-relaxed text-text-secondary sm:text-body">
                Informe o e-mail e o código de ativação que quem administra o painel lhe entregou, e crie sua senha.
              </p>
            </div>

            {error && (
              <AuthAlert id={errorId} kind="error" className="mb-6">
                {error}
              </AuthAlert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <LabeledIconInput
                id={emailId}
                label="E-mail"
                type="email"
                icon={<Mail className="h-4 w-4" />}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={error ? errorId : undefined}
                required
              />

              <ActivationField
                id={tokenId}
                value={token}
                onChange={setToken}
                describedBy={error ? errorId : undefined}
                hint="Formato ABCDE-FGHIJ-KLMNO-PQRST. Maiúsculas e hífens não importam."
              />

              <div className="space-y-1.5">
                <LabeledIconInput
                  id={passwordId}
                  label="Crie sua senha"
                  type={showPassword ? 'text' : 'password'}
                  icon={<Lock className="h-4 w-4" />}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-describedby={error ? errorId : undefined}
                  required
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={showPassword}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  }
                />
                <p className="text-caption text-text-muted">Pelo menos {MIN_PASSWORD_LENGTH} caracteres.</p>
              </div>

              <button
                type="submit"
                aria-disabled={submitting || !ready}
                onClick={(e) => {
                  if (submitting || !ready) e.preventDefault();
                }}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
                    Ativando…
                  </span>
                ) : (
                  'Ativar conta'
                )}
              </button>
            </form>

            {/* O link é um alvo de 44 px (o texto sozinho media 41x18); `pt-5` compensa a altura a mais. */}
            <p className="mt-8 border-t border-border pt-5 text-center text-small text-text-secondary">
              Já ativou sua conta?{' '}
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-cta-pressed underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-info"
              >
                Entrar
              </Link>
            </p>
          </>
        )}

        {phase.name === 'loggingIn' && (
          <div role="status" className="flex items-center justify-center gap-3 py-10 text-small text-text-secondary">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-control border-t-cta" aria-hidden="true" />
            Senha definida. Entrando para continuar a ativação…
          </div>
        )}

        {phase.name === 'enrolling' && (
          <EnrollmentStep
            challenge={phase.challenge}
            initialEnrollmentToken={phase.enrollmentToken}
            onDone={(admin, origin) => {
              acceptSession(admin, origin);
              navigate('/', { replace: true });
            }}
            onBackToCredentials={(message) => setPhase({ name: 'manual', message: message ?? 'Entre com e-mail e senha para continuar.' })}
          />
        )}

        {phase.name === 'manual' && (
          <div className="space-y-5 text-left">
            <h1 className="text-title font-bold tracking-tight text-text sm:text-heading">Senha definida</h1>
            <AuthAlert kind="warning">{phase.message}</AuthAlert>
            <Link
              to="/login"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
            >
              Ir para o login
            </Link>
          </div>
        )}

        {phase.name === 'done' && (
          <div className="space-y-5 text-left">
            <h1 className="text-title font-bold tracking-tight text-text sm:text-heading">Conta ativada</h1>
            <p className="text-small leading-relaxed text-text-secondary sm:text-body">
              Sua senha foi definida. Você já pode entrar no painel administrativo.
            </p>
            <Link
              to="/login"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
            >
              Ir para o login
            </Link>
          </div>
        )}
      </AuthSplitLayout>
    </div>
  );
}
