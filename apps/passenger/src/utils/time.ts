/** Formatação de ETA (simulado nesta fase) — exibição apenas, sem lógica de roteirização. */
export function formatEtaMinutes(minutes: number): string {
  if (minutes <= 0) return 'Chegando agora';
  return `${minutes} min`;
}

/** "m:ss" tabular (P07 "há 0:42", P08 "Aguardando você há {m:ss}") — exibição apenas. */
export function formatElapsedClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Hora local "HH:mm" (P09 "Chegada ao destino, 10:36") — exibição apenas. */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
