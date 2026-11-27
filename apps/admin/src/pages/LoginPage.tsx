import { useCallback, useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Mail, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../context/ApiContext';
import { DemoModeBanner } from '../components/DemoModeBanner';
import { AuthSplitLayout } from '../components/auth/AuthSplitLayout';
import { LabeledIconInput } from '../components/auth/LabeledIconInput';
import { AuthAlert } from '../components/auth/AuthAlert';
import { TwoFactorAlert } from '../components/auth/TwoFactorAlert';
import { useTwoFactorFeedback } from '../hooks/useTwoFactorFeedback';
import { SecondFactorStep } from '../components/auth/SecondFactorStep';
import { EnrollmentStep } from '../components/auth/EnrollmentStep';
import type { SecondFactorChallenge } from '../api';

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
 * - `incompatible`: a API respondeu num formato que este painel não conhece
 *   (versões diferentes). Falha fechada: nunca entra. Visual de erro e o foco
 *   vai para o aviso, porque não há nada a corrigir nos campos.
 */
function CredentialsStep({
  notice,
  onChallenge,
}: {
  readonly notice: string | null;
  readonly onChallenge: (stage: 'second_factor_required' | 'enrollment_required', challenge: SecondFactorChallenge) => void;
}) {
  const { login } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // `account_locked` é a espera curta (1 s a 15 min) do par e-mail + IP depois de uma senha errada: traz contagem
  // regressiva e trava SÓ o envio até acabar (nem a senha certa entra antes). Não é conta bloqueada, e quem erra de outro
  // IP não atrapalha. Os demais erros seguem como antes (credenciais = vermelho, espera/rede = âmbar).
  const { feedback, show, clear, locked, remaining } = useTwoFactorFeedback();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || locked) return;
    setSubmitting(true);
    clear();
    const result = await login({ email, password });
    setSubmitting(false);
    if (!result.ok) {
      show({
        message: result.message,
        kind: result.kind === 'blocked' ? 'warning' : 'error',
        ...(result.lockSeconds != null ? { lockSeconds: result.lockSeconds } : {}),
        // `incompatible` (painel e API em versões diferentes): não há campo a corrigir, o aviso recebe o foco.
        ...(result.kind === 'incompatible' ? { focus: true } : {}),
      });
      return;
    }
    // A senha não precisa ficar em memória além daqui: se o próximo passo for o segundo fator,
    // quem volta ao login digita de novo (e o campo nunca reaparece preenchido).
    setPassword('');
    if (result.next !== 'signedIn') {
      onChallenge(result.next, { challengeToken: result.challengeToken, challengeExpiresAt: result.challengeExpiresAt });
    }
  }

  return (
    <>
        <div className="mb-8 space-y-2 text-left">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cta-pressed">
            Conta de administrador
          </span>
          <h1 className="text-title font-bold tracking-tight text-text sm:text-heading">Entrar no painel</h1>
          <p className="text-small leading-relaxed text-text-secondary sm:text-body">
            Use o e-mail e a senha da sua conta de administrador.
          </p>
        </div>

        {/* `notice`: voltou do segundo fator (desafio expirou etc.) — âmbar, não é "senha errada". */}
        {feedback ? (
          <TwoFactorAlert id={errorId} feedback={feedback} remaining={remaining} className="mb-6" />
        ) : notice ? (
          <AuthAlert kind="warning" className="mb-6">
            {notice}
          </AuthAlert>
        ) : null}

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
                className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            }
          />

          <button
            type="submit"
            // `aria-disabled` (não `disabled`): desabilitar o botão clicado joga o foco no <body>; o handler ignora o envio.
            aria-disabled={submitting || locked}
            onClick={(e) => {
              if (submitting || locked) e.preventDefault();
            }}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta"
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
    </>
  );
}

type Stage =
  | { readonly name: 'credentials'; readonly notice: string | null }
  | { readonly name: 'second_factor_required' | 'enrollment_required'; readonly challenge: SecondFactorChallenge };

/**
 * Login em até três passos (contrato docs/contrato-admin-2fa.md): e-mail e
 * senha → (se o papel exigir/tiver 2FA) código de 6 dígitos, ou ativação
 * obrigatória. O `challengeToken` mora SÓ neste estado de componente — nunca
 * em storage, URL ou contexto global — e some quando o componente desmonta.
 */
export function LoginPage() {
  const api = useApi();
  const { acceptSession } = useAuth();
  const [stage, setStage] = useState<Stage>({ name: 'credentials', notice: null });


  const backToCredentials = useCallback((message?: string) => {
    setStage({ name: 'credentials', notice: message ?? null });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-screen">
      {api.mode === 'mock' ? <DemoModeBanner /> : null}

      <AuthSplitLayout
        heroTitle="Acesso restrito à equipe VuumBora"
        heroSubtitle="Entre com sua conta de administrador para acompanhar e gerenciar o pré-cadastro de motoristas."
        heroFeatures={HERO_FEATURES}
      >
        {stage.name === 'credentials' && (
          <CredentialsStep
            notice={stage.notice}
            onChallenge={(name, challenge) => setStage({ name, challenge })}
          />
        )}
        {stage.name === 'second_factor_required' && (
          <SecondFactorStep challenge={stage.challenge} onSuccess={acceptSession} onBackToCredentials={backToCredentials} />
        )}
        {stage.name === 'enrollment_required' && (
          <EnrollmentStep challenge={stage.challenge} onDone={acceptSession} onBackToCredentials={backToCredentials} />
        )}
      </AuthSplitLayout>
    </div>
  );
}
