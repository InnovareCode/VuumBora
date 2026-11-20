/**
 * Camada de dados — leitura de `driver_applications` pelo painel admin.
 * Separado de `driver-application-repository.ts` (que só faz o INSERT do
 * formulário público) de propósito: público escreve, admin só lê — são
 * caminhos de acesso diferentes, mesmo falando da mesma tabela.
 */
import type { Pool } from 'pg';
import type { DecodedCursor } from '../domain/pagination.js';

export type DriverApplicationStatusFilter = 'pending' | 'approved' | 'rejected';

export interface DriverApplicationDecidedBy {
  readonly id: string;
  readonly name: string;
}

export interface DriverApplicationListItem {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly state: string;
  readonly alreadyDrivesForApp: boolean | null;
  readonly hasOwnVehicle: boolean | null;
  readonly status: string;
  readonly source: string;
  readonly createdAt: string;
  /** `null` enquanto `status === 'pending'`. Migração 0008. */
  readonly decidedAt: string | null;
  readonly decidedBy: DriverApplicationDecidedBy | null;
  readonly decisionReason: string | null;
}

interface DriverApplicationRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  already_drives_for_app: boolean | null;
  has_own_vehicle: boolean | null;
  status: string;
  source: string;
  created_at: string;
  decided_at: string | null;
  decided_by_id: string | null;
  decided_by_name: string | null;
  decision_reason: string | null;
  /**
   * `created_at` com precisão de microssegundo, como TEXTO — nunca passa
   * por `Date` do JS (que só guarda milissegundo). Usada SÓ para montar o
   * cursor da próxima página, nunca exposta no `DriverApplicationListItem`
   * público.
   *
   * Causa raiz do bug que isto evita: duas candidaturas inseridas no
   * mesmo `INSERT` (mesmo `now()` de transação) têm o MESMO `created_at`
   * até o microssegundo — bem comum em lote de teste/seed, e possível em
   * produção sob carga. Cursor com `created_at` truncado em milissegundo
   * (via `toISOString()`) ficava MENOR que o valor real armazenado,
   * fazendo `(created_at, id) < (cursor, ...)` descartar a página inteira
   * (inclusive linhas que deveriam aparecer) em vez de só a página já
   * vista. Provado batendo direto no Postgres: 3 linhas com
   * `created_at` idêntico ao microssegundo, paginando de 2 em 2 — a
   * segunda página vinha vazia no lugar da 1 linha restante.
   */
  created_at_cursor: string;
}

// `da` (driver_applications) e `d` (admin_users do decisor) precisam de
// alias — as duas tabelas têm coluna `id`/`name`, e sem alias o resultado
// colidiria silenciosamente. LEFT JOIN (não INNER): candidatura `pending`
// tem `decided_by` NULL e ainda assim precisa aparecer na lista/detalhe.
const SELECT_COLUMNS = `
  da.id, da.name, da.email, da.phone, da.city, da.state,
  da.already_drives_for_app, da.has_own_vehicle, da.status, da.source, da.created_at,
  da.decided_at, da.decision_reason,
  d.id AS decided_by_id, d.name AS decided_by_name,
  to_char(da.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_cursor
`;
const FROM_WITH_DECIDER_JOIN = `driver_applications da LEFT JOIN admin_users d ON d.id = da.decided_by`;

function mapRow(row: DriverApplicationRow): DriverApplicationListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
    alreadyDrivesForApp: row.already_drives_for_app,
    hasOwnVehicle: row.has_own_vehicle,
    status: row.status,
    source: row.source,
    createdAt: new Date(row.created_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    decidedBy: row.decided_by_id && row.decided_by_name ? { id: row.decided_by_id, name: row.decided_by_name } : null,
    decisionReason: row.decision_reason,
  };
}

export interface ListDriverApplicationsFilter {
  readonly status?: DriverApplicationStatusFilter | undefined;
  /** Busca livre em nome/e-mail/telefone/cidade — ILIKE, sem índice dedicado (volume baixo no MVP). */
  readonly q?: string | undefined;
  readonly cursor: DecodedCursor | null;
  readonly limit: number;
}

export interface ListDriverApplicationsResult {
  readonly items: readonly DriverApplicationListItem[];
  readonly hasMore: boolean;
  /** Valores (precisão completa) da última linha retornada — só o serviço usa isto para codificar `nextCursor`. */
  readonly lastCursorValues: { readonly createdAt: string; readonly id: string } | null;
}

/**
 * Pede `limit + 1` linhas para saber se há próxima página sem outra query
 * — se vier a linha extra, ela não entra no resultado, só confirma
 * `hasMore`.
 */
export async function listDriverApplications(
  pool: Pool,
  filter: ListDriverApplicationsFilter,
): Promise<ListDriverApplicationsResult> {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filter.status) {
    params.push(filter.status);
    conditions.push(`da.status = $${params.length}`);
  }

  if (filter.q) {
    params.push(`%${filter.q}%`);
    const paramIndex = params.length;
    conditions.push(`(da.name ILIKE $${paramIndex} OR da.email ILIKE $${paramIndex} OR da.phone ILIKE $${paramIndex} OR da.city ILIKE $${paramIndex})`);
  }

  if (filter.cursor) {
    params.push(filter.cursor.createdAt);
    const createdAtIndex = params.length;
    params.push(filter.cursor.id);
    const idIndex = params.length;
    conditions.push(`(da.created_at, da.id) < ($${createdAtIndex}::timestamptz, $${idIndex}::uuid)`);
  }

  params.push(filter.limit + 1);
  const limitIndex = params.length;

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<DriverApplicationRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM ${FROM_WITH_DECIDER_JOIN}
     ${where}
     ORDER BY da.created_at DESC, da.id DESC
     LIMIT $${limitIndex}`,
    params,
  );

  const hasMore = result.rows.length > filter.limit;
  const pageRows = result.rows.slice(0, filter.limit);
  const items = pageRows.map(mapRow);

  const lastRow = pageRows[pageRows.length - 1];
  const lastCursorValues = hasMore && lastRow ? { createdAt: lastRow.created_at_cursor, id: lastRow.id } : null;

  return { items, hasMore, lastCursorValues };
}

export async function getDriverApplicationById(pool: Pool, id: string): Promise<DriverApplicationListItem | null> {
  const result = await pool.query<DriverApplicationRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${FROM_WITH_DECIDER_JOIN} WHERE da.id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export type DriverApplicationDecisionAction = 'approved' | 'rejected';

export interface ApplyDriverApplicationDecisionInput {
  readonly id: string;
  readonly action: DriverApplicationDecisionAction;
  readonly decidedBy: string;
  readonly decisionReason: string | null;
  readonly idempotencyKey: string;
}

interface DecisionRow {
  status: string;
  decided_at: string;
  decision_reason: string | null;
}

/**
 * `UPDATE ... WHERE status = 'pending'` é a defesa real de concorrência e
 * idempotência: duas requisições simultâneas (dois cliques, um retry
 * automático) só deixam UMA mudar a linha — a outra recebe 0 linhas
 * afetadas (`null` aqui) e o SERVIÇO decide, a partir do estado atual, se
 * é um retry com a MESMA `Idempotency-Key` (replay: devolve a mesma
 * resposta de sucesso) ou uma transição inválida de verdade (409). Nenhum
 * `SELECT ... FOR UPDATE` + `UPDATE` separado é necessário — o `WHERE` já
 * faz o papel do lock, numa query só.
 */
export async function updateDriverApplicationStatus(pool: Pool, input: ApplyDriverApplicationDecisionInput): Promise<DecisionRow | null> {
  const result = await pool.query<DecisionRow>(
    `UPDATE driver_applications
     SET status = $2, decided_by = $3, decided_at = now(), decision_reason = $4, decision_idempotency_key = $5
     WHERE id = $1 AND status = 'pending'
     RETURNING status, decided_at, decision_reason`,
    [input.id, input.action, input.decidedBy, input.decisionReason, input.idempotencyKey],
  );
  return result.rows[0] ?? null;
}

export interface DriverApplicationDecisionState {
  readonly exists: boolean;
  readonly status: string;
  readonly decisionIdempotencyKey: string | null;
}

/** Só para o serviço decidir, após um `updateDriverApplicationStatus` que não afetou nenhuma linha, se é 404, replay idempotente ou 409. Nunca exposto por rota — não é o formato público. */
export async function getDriverApplicationDecisionState(pool: Pool, id: string): Promise<DriverApplicationDecisionState | null> {
  const result = await pool.query<{ status: string; decision_idempotency_key: string | null }>(
    `SELECT status, decision_idempotency_key FROM driver_applications WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { exists: true, status: row.status, decisionIdempotencyKey: row.decision_idempotency_key };
}

export interface DriverApplicationStatusCounts {
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
}

export async function countDriverApplicationsByStatus(pool: Pool): Promise<DriverApplicationStatusCounts> {
  const result = await pool.query<{ status: string; count: string }>(
    `SELECT status, count(*) AS count FROM driver_applications GROUP BY status`,
  );

  const counts: Record<DriverApplicationStatusFilter, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const row of result.rows) {
    if (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected') {
      counts[row.status] = Number(row.count);
    }
  }
  return counts;
}
