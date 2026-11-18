/** Formatação de ETA (simulado nesta fase) — exibição apenas, sem lógica de roteirização. */
export function formatEtaMinutes(minutes: number): string {
  if (minutes <= 0) return 'Chegando agora';
  return `${minutes} min`;
}
