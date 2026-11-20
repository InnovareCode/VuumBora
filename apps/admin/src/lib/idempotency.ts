/**
 * Chave por TENTATIVA de ação crítica (aprovar/recusar) — gerada uma vez
 * quando o diálogo de confirmação abre e reaproveitada em qualquer retry
 * dentro da mesma sessão de diálogo, nunca uma nova a cada clique em
 * "confirmar": mesma chave + mesmo corpo é o que torna o retry seguro
 * (ver docs/plano-sistema.md §Idempotency-Key).
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback raro (contexto não seguro / navegador antigo) — só precisa ser
  // único o bastante para não colidir, não criptograficamente forte.
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
