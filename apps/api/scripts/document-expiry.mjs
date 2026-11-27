#!/usr/bin/env node
/**
 * Rotina DIÁRIA de vencimento dos documentos do motorista (fatia D5): documento aprovado e vencido passa a `expired` e o
 * motorista recebe aviso por e-mail 30 e 7 dias antes, se o SMTP estiver configurado (painel ou ambiente). Sem SMTP, só
 * uma linha de log com contagens. A lógica vive em src/services/document-expiry-service.ts (o cabeçalho de lá explica
 * as escolhas: script de operador e não timer da API; um aviso por marco por dia, sem estado guardado).
 *
 * COMO O OPERADOR RODA (Easypanel, serviço `vuumbora-backend`):
 *   - agendar UM cron diário, por exemplo às 09:00 de Natal (12:00 UTC), com o comando
 *       node scripts/document-expiry.mjs
 *     (ou `npm run documents:expiry`, SEM `-w`) no MESMO contêiner da API. Dentro da imagem a raiz é o próprio `apps/api` e
 *     `npm run documents:expiry -w @vuumbora/api` responde `No workspaces found` (achado do Vulcano, 27/11/2026,
 *     `docs/publicar-o-backend.md`); a forma com `-w` só serve no monorepo, depois de `npm run build -w @vuumbora/api`.
 *     Usa as variáveis do serviço: `DATABASE_URL` (o papel restrito `vuumbora_api` basta;
 *     NÃO precisa da credencial dona), `ADMIN_TOTP_ENCRYPTION_KEY` (lê a senha SMTP salva no painel) e, se o SMTP for
 *     do ambiente, `SMTP_*`/`EMAIL_FROM`.
 *   - uma vez por dia: rodar duas vezes no mesmo dia repete o aviso (duas execuções SIMULTÂNEAS não: a segunda desiste).
 *   - dia perdido (cron fora do ar): rode à mão para aquele dia, para recuperar os avisos dele:
 *       node scripts/document-expiry.mjs --now=2026-11-27T12:00:00Z
 *
 * Requer `dist/` construído (`npm run build`; a imagem Docker já traz). Não imprime dado pessoal: só contagens.
 * Sai com código 1 se a rotina falhar (o cron do Easypanel mostra a falha).
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

function parseNow(argv) {
  const flag = argv.find((arg) => arg.startsWith('--now='));
  if (!flag) return undefined;
  const raw = flag.slice('--now='.length);
  const now = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || Number.isNaN(now.getTime())) {
    console.error('[document-expiry] --now deve ser um instante ISO 8601, ex.: --now=2026-11-27T12:00:00Z');
    process.exit(1);
  }
  return now;
}

function jsonLog(level) {
  return (obj) => console[level === 'warn' ? 'warn' : 'log'](JSON.stringify({ level, ...obj }));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[document-expiry] defina DATABASE_URL (a mesma do serviço da API).');
    process.exit(1);
  }
  const now = parseNow(process.argv.slice(2));

  let expiry;
  let mailer;
  let secretBox;
  try {
    expiry = await import('../dist/services/document-expiry-service.js');
    mailer = await import('../dist/services/mailer.js');
    secretBox = await import('../dist/lib/secret-box.js');
  } catch {
    console.error('[document-expiry] dist/ não encontrado: rode `npm run build` antes.');
    process.exit(1);
  }

  const log = { info: jsonLog('info'), warn: jsonLog('warn') };
  let encryptionKey = null;
  const rawKey = (process.env.ADMIN_TOTP_ENCRYPTION_KEY ?? '').trim();
  if (rawKey) {
    try {
      encryptionKey = secretBox.parseEncryptionKey(rawKey);
    } catch {
      log.warn({ event: 'document_expiry_encryption_key_invalid' });
    }
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const smtp = mailer.createSmtpMailer({ pool, encryptionKey, log });
    const report = await expiry.runDocumentExpiry({ pool, mailer: smtp, log }, now ? { now } : {});
    console.log(`[document-expiry] ${JSON.stringify(report)}`);
  } catch (err) {
    // Sem err.message: pode ecoar trecho da connection string.
    console.error(`[document-expiry] falhou (${err?.code ?? err?.name ?? 'erro'}).`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
