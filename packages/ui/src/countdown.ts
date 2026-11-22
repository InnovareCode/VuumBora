/**
 * Contagem regressiva para esperas que o SERVIDOR decide (reenvio do código em 60 s, `retryAfterSeconds` do login).
 *
 * O estado verdadeiro é um INSTANTE (`until`, em ms desde a época), não "segundos restantes": o relógio de parede
 * segue correndo com o app em segundo plano ou a tela travada, então ao voltar a contagem já está certa e nunca
 * recomeça do 60. Quem guarda o instante (tela, store) decide quanto tempo ele vive; este hook só o lê.
 */
import { useEffect, useState } from 'react';

const TICK_MS = 500;

/** Segundos que faltam para `until` (arredondado para CIMA: "1 s" até o instante chegar). 0 quando passou ou `null`. */
export function useSecondsUntil(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return undefined;
    setNow(Date.now());
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [until]);

  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** "8 s", "1 min 5 s", "15 min", "1 h 30 min" — texto curto para o botão ou a mensagem. */
export function formatWait(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
