import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Download, TriangleAlert } from 'lucide-react';

const FILE_NAME = 'vuumbora-codigos-de-recuperacao.txt';

function buildFileContent(codes: readonly string[]): string {
  return [
    'VuumBora - painel administrativo',
    'Códigos de recuperação da verificação em duas etapas',
    '',
    'Cada código vale UMA vez e substitui o código do app autenticador no login.',
    'Guarde este arquivo em um cofre de senhas ou impresso, nunca junto da sua senha.',
    '',
    ...codes,
    '',
  ].join('\n');
}

/**
 * Exibição ÚNICA dos códigos de recuperação (a API nunca mais devolve). Por
 * isso o botão de seguir só habilita depois de a pessoa marcar que guardou —
 * e quem hospeda isto não deve oferecer outra saída (ex.: o `Dialog` trava
 * Escape/clique de fora enquanto isto está aberto, via `busy`).
 *
 * Os códigos vivem só nas props (memória). "Baixar" gera um arquivo local por
 * Blob — nada é enviado nem guardado em storage; a URL do Blob é revogada
 * logo em seguida.
 */
export function RecoveryCodesPanel({
  codes,
  continueLabel,
  onContinue,
  headingLevel = 'h2',
}: {
  readonly codes: readonly string[];
  readonly continueLabel: string;
  readonly onContinue: () => void;
  /** `h1` quando o painel É a tela (login, ativação do 2FA); `h2` dentro de um diálogo, que já tem o próprio título. */
  readonly headingLevel?: 'h1' | 'h2';
}) {
  const Heading = headingLevel;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [saved, setSaved] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [downloaded, setDownloaded] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quem entra nesta tela vem de um envio de formulário que sumiu do DOM: sem
  // mover o foco, ele cai no <body> e o leitor de tela recomeça do topo.
  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  async function copyAll() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard indisponível');
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopyState('idle'), 2500);
  }

  function download() {
    const blob = new Blob([buildFileContent(codes)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloaded(true);
  }

  return (
    <section aria-labelledby={headingId} className="space-y-5 text-left">
      <div className="space-y-2">
        <Heading
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-title font-bold tracking-tight text-text outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          Guarde seus códigos de recuperação
        </Heading>
        <p className="text-small leading-relaxed text-text-secondary">
          Se você perder o acesso ao app autenticador, cada código abaixo entra no lugar dele — uma vez só.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="font-medium">Esta é a única vez que eles aparecem. Depois de sair desta tela não dá para ver de novo.</p>
      </div>

      <ol
        aria-label="Códigos de recuperação"
        className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-input p-4"
      >
        {codes.map((code, index) => (
          <li key={code} className="flex items-baseline gap-2 text-small">
            <span className="w-5 shrink-0 text-right text-caption tabular-nums text-text-muted" aria-hidden="true">
              {index + 1}.
            </span>
            <code className="select-all font-mono text-small font-semibold tracking-wider text-text">{code}</code>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void copyAll()}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border-control bg-surface px-3 text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info"
        >
          {copyState === 'copied' ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copyState === 'copied' ? 'Copiado' : copyState === 'error' ? 'Não copiou' : 'Copiar todos'}
        </button>
        <button
          type="button"
          onClick={download}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border-control bg-surface px-3 text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info"
        >
          {downloaded ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {downloaded ? 'Arquivo baixado' : 'Baixar .txt'}
        </button>
      </div>
      <p role="status" className="sr-only">
        {copyState === 'copied' ? 'Códigos copiados para a área de transferência.' : null}
        {copyState === 'error' ? 'Não foi possível copiar. Selecione os códigos à mão ou baixe o arquivo.' : null}
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-small text-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-info">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-cta outline-none"
        />
        <span className="font-medium">Guardei os códigos em um lugar seguro.</span>
      </label>

      <button
        type="button"
        disabled={!saved}
        onClick={onContinue}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-cta text-body font-bold text-on-cta transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
      >
        {continueLabel}
      </button>
    </section>
  );
}
