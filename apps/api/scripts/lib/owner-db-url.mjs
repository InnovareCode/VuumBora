/**
 * Credencial para scripts de OPERADOR que escrevem onde a API não escreve mais
 * (criar admin, emitir token de ativação, apagar lista de espera/candidatura,
 * retenção). Migração 0017 / revisão S1 rodada 2, I-3: o papel de runtime da API
 * (`vuumbora_api`) não tem INSERT/UPDATE/DELETE nessas tabelas.
 *
 * Usa `MIGRATION_DATABASE_URL` (a credencial DONA). Só cai em `DATABASE_URL` quando
 * ela não existe — caso de desenvolvimento local, onde as duas são a mesma — e AVISA.
 *
 * Em produção `MIGRATION_DATABASE_URL` NÃO deve estar no ambiente do contêiner da
 * API: rode estes scripts numa tarefa/terminal do Easypanel que tenha a variável
 * só para essa execução (ver docs/publicar-o-backend.md).
 */
export function resolveOwnerDatabaseUrl(tag) {
  const owner = process.env.MIGRATION_DATABASE_URL?.trim();
  if (owner) return owner;
  const fallback = process.env.DATABASE_URL?.trim();
  if (!fallback) {
    console.error(`[${tag}] defina MIGRATION_DATABASE_URL (credencial dona) ou, só em desenvolvimento, DATABASE_URL.`);
    process.exit(1);
  }
  console.warn(`[${tag}] AVISO: MIGRATION_DATABASE_URL ausente; usando DATABASE_URL. Com o papel restrito da API este comando falha — use a credencial dona.`);
  return fallback;
}
