#!/usr/bin/env node
/**
 * Emite um NOVO código de ativação do 2FA (uso único, fora de banda) para
 * um admin de papel obrigatório (dono/financeiro) que ainda não enrolou, ou
 * cujo código venceu/foi perdido. Também é o primeiro passo do "break-glass" de
 * quem perdeu o celular E os códigos de recuperação (ver docs/break-glass-admin.md).
 *
 * Uso:
 *   node scripts/reissue-2fa-enrollment.mjs --email=dono@vuumbora.com.br
 *   node scripts/reissue-2fa-enrollment.mjs --email=... --reset-2fa   # APAGA o 2FA atual (celular perdido) e derruba as sessões
 *
 * Sem `--reset-2fa`, recusa admin que já tem 2FA confirmado. Registra a ação
 * em `admin_audit_log` (admin.2fa.enrollment_token_issued / admin.2fa.reset_by_operator),
 * com `target` no próprio admin e SEM o token. Exige a credencial DONA do banco
 * (MIGRATION_DATABASE_URL, como o `create-admin`: o papel restrito da API não emite token
 * de ativação — migração 0017), no terminal do serviço ou local via .env.
 */
import 'dotenv/config';
import pg from 'pg';
import { ENROLLMENT_TOKEN_TTL_HOURS, MANDATORY_2FA_ROLES, issueEnrollmentToken } from './lib/enrollment-token.mjs';
import { resolveOwnerDatabaseUrl } from './lib/owner-db-url.mjs';

const { Pool } = pg;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = /^--([a-zA-Z0-9-]+)(?:=([\s\S]*))?$/.exec(raw);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

async function main() {
  const databaseUrl = resolveOwnerDatabaseUrl('reissue-2fa');
  const args = parseArgs(process.argv.slice(2));
  const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  if (!email) {
    console.error('[reissue-2fa] informe --email=...');
    process.exit(1);
  }
  const reset = args['reset-2fa'] === true;

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id, role, deactivated_at FROM admin_users WHERE email = $1 FOR UPDATE`, [email]);
    const admin = found.rows[0];
    if (!admin || admin.deactivated_at !== null) {
      console.error('[reissue-2fa] admin não encontrado (ou desativado).');
      process.exit(1);
    }
    if (!MANDATORY_2FA_ROLES.includes(admin.role)) {
      console.error(`[reissue-2fa] o papel "${admin.role}" não exige o código de ativação (2FA opcional, ativado pela própria pessoa com a senha).`);
      process.exit(1);
    }

    const enrolled = await client.query(`SELECT 1 FROM admin_totp WHERE admin_id = $1 AND confirmed_at IS NOT NULL`, [admin.id]);
    if (enrolled.rowCount > 0 && !reset) {
      console.error('[reissue-2fa] este admin JÁ tem 2FA ativo. Se perdeu o celular e os códigos de recuperação, use --reset-2fa.');
      process.exit(1);
    }

    if (reset) {
      // Celular perdido: apaga o 2FA e TODAS as sessões (quem estiver logado cai).
      await client.query(`DELETE FROM admin_recovery_codes WHERE admin_id = $1`, [admin.id]);
      await client.query(`DELETE FROM admin_totp WHERE admin_id = $1`, [admin.id]);
      await client.query(`DELETE FROM admin_sessions WHERE admin_id = $1`, [admin.id]);
      await client.query(`DELETE FROM admin_login_challenges WHERE admin_id = $1`, [admin.id]);
    } else {
      // Segredo pendente antigo não deve sobreviver à reemissão.
      await client.query(`DELETE FROM admin_totp WHERE admin_id = $1 AND confirmed_at IS NULL`, [admin.id]);
    }

    const issued = await issueEnrollmentToken(client, admin.id);
    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, after, ip_address) VALUES ($1, $2, 'admin_user', $4, $3, NULL)`,
      [admin.id, reset ? 'admin.2fa.reset_by_operator' : 'admin.2fa.enrollment_token_issued', JSON.stringify({ via: 'script', ttlHours: ENROLLMENT_TOKEN_TTL_HOURS }), admin.id],
    );
    await client.query('COMMIT');

    console.log(`[reissue-2fa] ${reset ? '2FA anterior APAGADO e sessões derrubadas. ' : ''}Código de ativação para ${email} (uso único, vale ${ENROLLMENT_TOKEN_TTL_HOURS}h, não será mostrado de novo):`);
    console.log(`    ${issued.token}`);
    console.log('[reissue-2fa] Entregue por um canal seguro, só à própria pessoa. Os anteriores não valem mais.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[reissue-2fa] erro: ${err.message}`);
  process.exit(1);
});
