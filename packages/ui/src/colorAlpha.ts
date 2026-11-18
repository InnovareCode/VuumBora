/**
 * `withAlpha` — converte uma cor HEX já resolvida de `theme.role.*` (nunca um literal
 * escrito aqui, `scripts/check-boundaries.mjs` reprova HEX solto) para `rgba(...)`,
 * usado pelas variantes TINGIDAS (fundo em baixa opacidade sobre `surface`, texto/
 * borda na cor cheia) — direção de arte §9 item 1 / auditoria A2/A3.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
