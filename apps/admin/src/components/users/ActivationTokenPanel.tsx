import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { formatDateTime } from '../../lib/format';

/**
 * Exibição ÚNICA do token de ativação de um usuário recém-criado
 * (docs/contrato-admin-usuarios.md §2): depois desta tela não há endpoint de
 * "ver de novo" — se a pessoa perder o token ou o prazo, o único jeito hoje é
 * desativar e criar de novo. O dono entrega isto à pessoa por um canal fora
 * do painel (WhatsApp, e-mail, em mãos); por isso o aviso é explícito e o
 * botão de prosseguir não precisa de confirmação extra (diferente dos
 * códigos de recuperação, não há como "usar por engano" um token que
 * ninguém mais vê).
 */
export function ActivationTokenPanel({
  name,
  email,
  token,
  expiresAt,
  onDone,
}: {
  readonly name: string;
  readonly email: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly onDone: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard indisponível');
      await navigator.clipboard.writeText(token);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopyState('idle'), 2500);
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-body font-bold text-text outline-none focus-visible:ring-2 focus-visible:ring-info">
        {name} foi criado(a)
      </h3>
      <p className="text-small leading-relaxed text-text-secondary">
        Copie o código de ativação abaixo e entregue a <strong className="font-bold text-text">{email}</strong> por fora do painel
        (WhatsApp, e-mail, em mãos). A pessoa vai usá-lo em <strong className="font-bold text-text">/activate</strong> para definir a
        própria senha.
      </p>

      <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="font-medium">Copie agora — esta é a única vez que este código aparece. Vale até {formatDateTime(expiresAt)}.</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-input px-4 py-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-small font-semibold tracking-wider text-text">{token}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-control bg-surface px-3 text-caption font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info"
        >
          {copyState === 'copied' ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copyState === 'copied' ? 'Copiado' : copyState === 'error' ? 'Não copiou' : 'Copiar'}
        </button>
      </div>
      <p role="status" className="sr-only">
        {copyState === 'copied' ? 'Código copiado para a área de transferência.' : null}
      </p>

      <button
        type="button"
        onClick={onDone}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-cta text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
      >
        Copiei, pode fechar
      </button>
    </section>
  );
}
