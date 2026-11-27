/**
 * Rotina DIÁRIA de vencimento dos documentos do motorista (fatia D5, parte 2, do `docs/plano-m3-m4.md`).
 *
 *  1. Documento `approved` cuja validade passou no dia LOCAL da cidade do motorista vira `expired` (o gatilho da 0024
 *     confere de novo: só passa a `expired` o que venceu pelo relógio do banco, `city_today`).
 *  2. Aviso por e-mail 30 e 7 dias antes do vencimento, ao motorista, se o SMTP estiver configurado (painel ou ambiente).
 *     Sem SMTP: nenhum e-mail, só uma linha de log com CONTAGENS (sem e-mail, nome, documento nem id).
 *     Quem já enviou a versão nova (um documento do mesmo tipo em análise) não recebe o aviso.
 *
 * Quem roda: o operador, por `npm run documents:expiry -w @vuumbora/api` (cron diário do Easypanel, dentro do contêiner
 * da API, com a MESMA `DATABASE_URL` do serviço: o papel restrito basta). Ver `scripts/document-expiry.mjs`.
 * Por que script e não timer dentro da API: um timer rodaria em CADA réplica e a cada reinício (avisos repetidos), e
 * prenderia o envio de e-mail ao processo que atende requisições; o cron é visível no painel e roda uma vez.
 *
 * Um aviso por (documento, marco) por DIA: a rotina não guarda estado (o esquema não tem onde, e criar tabela agora
 * mexeria nas migrações). Consequências, assumidas: rodar duas vezes no mesmo dia manda o aviso de novo (a trava
 * consultiva só impede duas execuções AO MESMO TEMPO); um dia sem rodar perde os avisos daquele dia — recupere com
 * `--now=<o dia perdido>`. O vencimento (passo 1) não tem esse problema: é idempotente e alcança qualquer atraso.
 *
 * O relógio é injetável (`now`): os testes fixam o instante; o operador pode refazer um dia perdido.
 */
import type { Pool, PoolClient } from 'pg';
import { describeErrorForLog } from '../lib/safe-error.js';
import { EmailNotConfiguredError, type MailMessage } from './mailer.js';

/** Marcos do aviso, em dias antes do vencimento. */
export const EXPIRY_NOTICE_DAYS = [30, 7] as const;

export interface DocumentExpiryLog {
  info(obj: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>): void;
}

export interface DocumentExpiryDeps {
  readonly pool: Pool;
  /** `null` = nenhum envio possível (só log). */
  readonly mailer: { send(message: MailMessage): Promise<void> } | null;
  readonly log: DocumentExpiryLog;
}

export interface DocumentExpiryOptions {
  /** Instante de referência. Padrão: o relógio do banco (`now()`). */
  readonly now?: Date;
}

export interface DocumentExpiryReport {
  readonly ran: boolean;
  readonly expired: number;
  readonly noticesDue: number;
  readonly noticesSent: number;
  readonly noticesFailed: number;
  /** Avisos devidos e não enviados por falta de SMTP. */
  readonly noticesSkipped: number;
}

const LOCK_KEY = 'vuumbora:document-expiry';

interface DueNotice {
  readonly typeLabel: string;
  readonly expiresOn: string;
  readonly daysLeft: number;
  readonly email: string;
}

/** Passo 1. A data de referência E o relógio do banco: nunca pede ao gatilho um vencimento que ele recusaria. */
async function expireDocuments(client: PoolClient, now: Date | null): Promise<number> {
  const result = await client.query(
    `UPDATE driver_documents AS doc SET status = 'expired'
       FROM drivers d JOIN cities c ON c.code = d.city_code
      WHERE d.account_id = doc.driver_id AND doc.status = 'approved' AND doc.expires_on IS NOT NULL
        AND doc.expires_on < ((COALESCE($1::timestamptz, now())) AT TIME ZONE c.timezone)::date
        AND doc.expires_on < city_today(d.city_code)`,
    [now],
  );
  return result.rowCount ?? 0;
}

/** Passo 2: avisos devidos hoje (no dia LOCAL da cidade), a quem ainda não mandou a versão nova. */
async function dueNotices(client: PoolClient, now: Date | null): Promise<DueNotice[]> {
  const result = await client.query<{ label: string; expires_on: string; days_left: number; email: string }>(
    `SELECT t.label, to_char(doc.expires_on, 'YYYY-MM-DD') AS expires_on, (doc.expires_on - lt.local_today) AS days_left, acc.email
       FROM driver_documents doc
       JOIN drivers d ON d.account_id = doc.driver_id AND d.status <> 'deleted'
       JOIN accounts acc ON acc.id = doc.driver_id AND acc.status = 'active'
       JOIN cities c ON c.code = d.city_code
       JOIN document_types t ON t.code = doc.type_code
       CROSS JOIN LATERAL (SELECT ((COALESCE($1::timestamptz, now())) AT TIME ZONE c.timezone)::date AS local_today) lt
      WHERE doc.status = 'approved' AND doc.expires_on IS NOT NULL
        AND (doc.expires_on - lt.local_today) = ANY($2::int[])
        AND NOT EXISTS (
              SELECT 1 FROM driver_documents nxt
               WHERE nxt.driver_id = doc.driver_id AND nxt.type_code = doc.type_code
                 AND nxt.vehicle_id IS NOT DISTINCT FROM doc.vehicle_id AND nxt.status = 'submitted')
      ORDER BY doc.expires_on, doc.id`,
    [now, [...EXPIRY_NOTICE_DAYS]],
  );
  return result.rows.map((row) => ({ typeLabel: row.label, expiresOn: row.expires_on, daysLeft: row.days_left, email: row.email }));
}

/** `AAAA-MM-DD` → `DD/MM/AAAA` (texto; nunca `Date`, que deslocaria pelo fuso). */
function brazilianDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function expiryNoticeMessage(notice: DueNotice): MailMessage {
  const when = notice.daysLeft === 1 ? 'amanhã' : `em ${notice.daysLeft} dias`;
  return {
    to: notice.email,
    subject: `VuumBora: um documento do seu cadastro vence ${when}`,
    text: [
      'Olá!',
      '',
      `O documento "${notice.typeLabel}" do seu cadastro de motorista VuumBora vence em ${brazilianDate(notice.expiresOn)}.`,
      'Envie a versão atualizada pelo app antes dessa data: com um documento obrigatório vencido não é possível ficar online.',
      '',
      'Se você já enviou, desconsidere este aviso.',
      '',
      'Equipe VuumBora',
    ].join('\n'),
  };
}

export async function runDocumentExpiry(deps: DocumentExpiryDeps, options: DocumentExpiryOptions = {}): Promise<DocumentExpiryReport> {
  const now = options.now ?? null;
  const client = await deps.pool.connect();
  let locked = false;
  try {
    // Duas execuções ao mesmo tempo (cron atrasado + manual) mandariam o aviso em dobro: a segunda desiste.
    locked = (await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok`, [LOCK_KEY])).rows[0]!.ok;
    if (!locked) {
      deps.log.warn({ event: 'document_expiry_already_running' });
      return { ran: false, expired: 0, noticesDue: 0, noticesSent: 0, noticesFailed: 0, noticesSkipped: 0 };
    }

    const expired = await expireDocuments(client, now);
    const due = await dueNotices(client, now);
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let smtpMissing = deps.mailer === null;
    for (const notice of due) {
      if (smtpMissing) {
        skipped += 1;
        continue;
      }
      try {
        await deps.mailer!.send(expiryNoticeMessage(notice));
        sent += 1;
      } catch (err) {
        if (err instanceof EmailNotConfiguredError) {
          smtpMissing = true;
          skipped += 1;
          continue;
        }
        failed += 1;
        // Sem destinatário nem texto: só o nome/código do erro.
        deps.log.warn({ event: 'document_expiry_notice_failed', ...describeErrorForLog(err) });
      }
    }
    if (smtpMissing && skipped > 0) deps.log.warn({ event: 'document_expiry_notices_not_sent', reason: 'smtp_not_configured', count: skipped });

    const report = { ran: true, expired, noticesDue: due.length, noticesSent: sent, noticesFailed: failed, noticesSkipped: skipped };
    deps.log.info({ event: 'document_expiry_done', ...report });
    return report;
  } finally {
    if (locked) await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
