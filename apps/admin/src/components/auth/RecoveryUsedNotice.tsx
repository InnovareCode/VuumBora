import { useEffect, useId, useRef } from 'react';
import { KeyRound, TriangleAlert } from 'lucide-react';
import { LOW_RECOVERY_CODES_THRESHOLD } from '../../lib/twoFactorFeedback';

/**
 * Passo extra do login quando a pessoa entrou com um CÓDIGO DE RECUPERAÇÃO (e não com o app
 * autenticador): quase sempre significa que ela está sem o aparelho, e cada código gasto é um a
 * menos. Diz quantos restam e oferece o caminho para gerar novos. A sessão já foi emitida pelo
 * servidor, mas a tela só a "aceita" (`onContinue`) depois deste aviso — senão `/login` redirecionaria
 * sozinho e a pessoa nunca o veria.
 *
 * O foco vai para o título (a tela anterior sumiu do DOM e o foco cairia no <body>); o título tem
 * `tabIndex=-1` só para receber esse foco programático.
 */
export function RecoveryUsedNotice({
  remaining,
  onContinue,
  onGenerateNew,
}: {
  /** `null` = o servidor não informou quantos restam. */
  readonly remaining: number | null;
  readonly onContinue: () => void;
  readonly onGenerateNew: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const low = remaining !== null && remaining < LOW_RECOVERY_CODES_THRESHOLD;
  const count =
    remaining === null
      ? 'Esse código não vale mais.'
      : remaining === 0
        ? 'Esse era o seu último código de recuperação: não restou nenhum.'
        : `Restam ${remaining} ${remaining === 1 ? 'código de recuperação' : 'códigos de recuperação'}.`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-6 space-y-2 text-left">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cta-pressed">
          Verificação em duas etapas
        </span>
        <h1 id={headingId} ref={headingRef} tabIndex={-1} className="text-title font-bold tracking-tight text-text outline-none sm:text-heading">
          Você entrou com um código de recuperação
        </h1>
        <p className="text-small leading-relaxed text-text-secondary sm:text-body">
          Cada código vale uma única vez e já foi usado. Se você está sem o aparelho do app autenticador, gere novos códigos assim que puder.
        </p>
      </div>

      <div
        role="status"
        className={
          low
            ? 'flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text'
            : 'flex items-start gap-2.5 rounded-xl border border-border bg-elevated px-4 py-3 text-small text-text'
        }
      >
        {low ? (
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        ) : (
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        )}
        <p className="min-w-0 flex-1 font-medium">
          {count}
          {low && ' Gere novos códigos agora, em Minha conta > Segurança, para não ficar sem alternativa.'}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
        >
          Continuar
        </button>
        <button
          type="button"
          onClick={onGenerateNew}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border-control px-4 text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info"
        >
          Gerar novos códigos agora
        </button>
      </div>
    </section>
  );
}
