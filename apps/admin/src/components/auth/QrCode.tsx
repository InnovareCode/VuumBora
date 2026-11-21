import { useEffect, useState } from 'react';

type QrState = { readonly status: 'loading' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly size: number; readonly path: string };

/**
 * QR do `otpauthUri`, desenhado como SVG por nós (a lib só calcula a matriz de
 * módulos — nada de `innerHTML`). Carregada sob demanda (`import()`): só quem
 * está ativando o 2FA paga o custo da lib. Fundo BRANCO com margem ("quiet
 * zone") de propósito, mesmo no painel só-escuro: leitor de QR precisa do
 * contraste escuro-sobre-claro; é o único elemento claro da tela.
 *
 * O URI contém o segredo do TOTP: fica só em props/estado de memória, nunca
 * em log, storage ou atributo de DOM (nem `title`/`aria-label` o repetem).
 */
export function QrCode({ value }: { readonly value: string }) {
  const [state, setState] = useState<QrState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    import('qrcode')
      .then((mod) => {
        const qr = mod.create(value, { errorCorrectionLevel: 'M' });
        const { size, data } = qr.modules;
        let path = '';
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
          }
        }
        if (!cancelled) setState({ status: 'ready', size, path });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className="mx-auto flex h-[196px] w-[196px] items-center justify-center rounded-xl bg-white p-3"
      data-testid="totp-qr"
    >
      {state.status === 'ready' ? (
        <svg
          role="img"
          aria-label="QR code para o app autenticador"
          viewBox={`0 0 ${state.size} ${state.size}`}
          shapeRendering="crispEdges"
          className="h-full w-full"
        >
          <path d={state.path} className="fill-navy" />
        </svg>
      ) : state.status === 'loading' ? (
        <span role="status" className="text-caption font-medium text-navy">
          Gerando QR…
        </span>
      ) : (
        <span role="alert" className="px-2 text-center text-caption font-medium text-navy">
          Não foi possível desenhar o QR. Use a chave ao lado.
        </span>
      )}
    </div>
  );
}
