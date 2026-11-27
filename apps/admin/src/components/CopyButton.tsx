import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './CopyButton.module.css';

/** Copia telefone/e-mail para contato (requisito do briefing). Estado 100% local: só este botão precisa saber se copiou. */
export function CopyButton({ value, label }: { readonly value: string; readonly label: string }) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'error'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleClick = useCallback(async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard indisponível');
      await navigator.clipboard.writeText(value);
      setFeedback('copied');
    } catch {
      setFeedback('error');
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFeedback('idle'), 2000);
  }, [value]);

  return (
    <button
      type="button"
      className={styles['button']}
      data-copied={feedback === 'copied'}
      onClick={handleClick}
      aria-label={`Copiar ${label}: ${value}`}
    >
      <span className={styles['value']}>{value}</span>
      {/* A ação fica à direita, com ícone e cor própria: antes "Copiar" vinha colado ao valor, no mesmo tom, e lia como
          parte do e-mail. */}
      <span className={styles['action']} aria-live="polite">
        {feedback === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {feedback === 'copied' ? 'Copiado!' : feedback === 'error' ? 'Não copiou' : 'Copiar'}
      </span>
    </button>
  );
}
