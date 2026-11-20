import { useId, useState, type FormEvent } from 'react';
import { AlertCircle, Clock, Eye, EyeOff, KeyRound, Lock, Mail, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../context/ApiContext';
import { DemoModeBanner } from '../components/DemoModeBanner';
import { AuthSplitLayout } from '../components/auth/AuthSplitLayout';
import { LabeledIconInput } from '../components/auth/LabeledIconInput';

const HERO_FEATURES = [
  { icon: <UserCheck className="h-4 w-4" aria-hidden="true" />, text: 'Gerencie o pré-cadastro de motoristas em um só lugar' },
  { icon: <KeyRound className="h-4 w-4" aria-hidden="true" />, text: 'Acesso definido por papel — cada conta vê só o que precisa' },
  { icon: <Lock className="h-4 w-4" aria-hidden="true" />, text: 'Contas criadas só por quem administra, nunca por autoatendimento' },
];

/**
 * Login do painel administrativo. Rota pública, mas sem nada do "cadastre-se
 * grátis"/"continuar com o Google" de um login de loja: isto é um sistema
 * interno — conta de admin nasce por script (decisão de segurança), então o
 * rodapé diz isso em vez de oferecer um cadastro que não existe.
 *
 * Duas mensagens de erro distintas, nunca misturadas:
 * - `credentials`: e-mail inexistente, senha errada OU usuário desativado —
 *   SEMPRE o mesmo texto para as três (não dá pista de qual aconteceu, ver
 *   AuthContext.login). Visual de erro (vermelho).
 * - `blocked`: limite de tentativas (429) ou falha de rede/indisponibilidade
 *   — é um estado de infraestrutura, não "senha errada"; dizer isso evita a
 *   pessoa tentar de novo pensando que digitou errado. Visual de aviso
 *   (âmbar), não de erro.
 */
export function LoginPage() {
  const { login } = useAuth();
  const api = useApi();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; kind: 'credentials' | 'blocked' } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const result = await login({ email, password });
    setSubmitting(false);
    if (!result.ok) setFeedback({ message: result.message, kind: result.kind });
  }

  return (
    <div className="flex min-h-screen flex-col bg-screen">
      {api.mode === 'mock' ? <DemoModeBanner /> : null}

      <AuthSplitLayout
        heroTitle="Acesso restrito à equipe VuumBora"
        heroSubtitle="Entre com sua conta de administrador para acompanhar e gerenciar o pré-cadastro de motoristas."
        heroFeatures={HERO_FEATURES}
      >
        <div className="mb-8 space-y-2 text-left">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cta-pressed">
            Conta de administrador
          </span>
          <h1 className="text-title font-bold tracking-tight text-text sm:text-heading">Entrar no painel</h1>
          <p className="text-small leading-relaxed text-text-secondary sm:text-body">
            Use o e-mail e a senha da sua conta de administrador.
          </p>
        </div>

        {feedback && (
          <div
            role="alert"
            id={errorId}
            className={
              feedback.kind === 'blocked'
                ? 'mb-6 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text'
                : 'mb-6 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-fill px-4 py-3 text-small text-text'
            }
          >
            {feedback.kind === 'blocked' ? (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            )}
            <span className="flex-1 font-medium">{feedback.message}</span>
          </div>
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
            aria-invalid={feedback ? true : undefined}
            aria-describedby={feedback ? errorId : undefined}
            required
          />

          <LabeledIconInput
            id={passwordId}
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            icon={<Lock className="h-4 w-4" />}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={feedback ? true : undefined}
            aria-describedby={feedback ? errorId : undefined}
            required
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            }
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-cta/40 border-t-on-cta" aria-hidden="true" />
                Entrando…
              </span>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <div className="mt-8 space-y-3 border-t border-border pt-6 text-center text-small text-text-secondary">
          <p>Esqueceu sua senha? Peça para quem administra o painel redefinir o seu acesso.</p>
          <p>Contas de administrador são criadas por quem administra o sistema — não há cadastro aberto.</p>
        </div>
      </AuthSplitLayout>
    </div>
  );
}
