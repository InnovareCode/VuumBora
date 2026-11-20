/**
 * Tipos do domínio do admin (painel interno) — login e leitura de
 * candidaturas. Espelha `admin_users`/`admin_sessions` (migrações 0003 e
 * 0005). Nenhuma mutação de candidatura nesta fatia (Admin v0): só
 * autenticação e consulta.
 */

/**
 * Papéis aprovados pelo dono em 20/11/2026 (docs/decisoes-do-dono.md →
 * "Proposta de papéis"). Substituem o conjunto provisório
 * `support`/`finance`/`superadmin` da migração 0003 — ver migração 0006.
 */
export type AdminRole = 'dono' | 'operacao' | 'revisor_documentos' | 'financeiro' | 'suporte';

/** Formato exposto ao cliente HTTP — nunca inclui `passwordHash`. */
export interface AdminUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
}

/** Linha completa de `admin_users`, só para a camada de autenticação. */
export interface AdminUserRecord extends AdminUser {
  readonly passwordHash: string;
  readonly deactivatedAt: string | null;
}

/**
 * Nome do cookie de sessão. Fixo no código (não é configuração de
 * ambiente/deploy) — trocar o nome não resolve nada, só quebraria sessões
 * ativas.
 */
export const ADMIN_SESSION_COOKIE = 'vb_admin_session';
