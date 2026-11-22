import type { DriverApplication, DriverApplicationDecision, DriverApplicationListResult, DriverApplicationStatus, DriverApplicationSummary } from './types';

/**
 * Validação das respostas de candidatura de motorista — mesmo padrão (e mesma independência de arquivo) de
 * `authResponses.ts`: tudo que vem da rede chega como `unknown` e só vira tipo do app se passar por aqui.
 * FALHA FECHADA — formato fora do contrato (docs/plano-sistema.md) nunca vira um item exibido, vira
 * `contract_mismatch` (ver `createHttpDriverApplicationAdapter`).
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

type Obj = Readonly<Record<string, unknown>>;

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

const STATUSES: readonly DriverApplicationStatus[] = ['pending', 'approved', 'rejected'];

function isRecord(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is DriverApplicationStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function typeOf(value: unknown): string {
  if (value === undefined) return 'ausente';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'lista';
  if (value === '') return 'texto vazio';
  return typeof value === 'string' ? 'texto' : typeof value;
}

function text(source: Obj, name: string): Parsed<string> {
  const value = source[name];
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "${name}": esperado texto, veio ${typeOf(value)}`);
}

/** `null` é um valor válido para os três opcionais (`alreadyDrivesForApp`/`hasOwnVehicle`/`decidedAt`/`decisionReason`). */
function nullableText(source: Obj, name: string): Parsed<string | null> {
  const value = source[name];
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'string' ? ok(value) : fail(`campo "${name}": esperado texto ou null, veio ${typeOf(value)}`);
}

function nullableBool(source: Obj, name: string): Parsed<boolean | null> {
  const value = source[name];
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'boolean' ? ok(value) : fail(`campo "${name}": esperado booleano ou null, veio ${typeOf(value)}`);
}

function requireObject(raw: unknown, what: string): Parsed<Obj> {
  return isRecord(raw) ? ok(raw) : fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
}

function parseDecidedBy(source: Obj, what: string): Parsed<{ readonly id: string; readonly name: string } | null> {
  const value = source['decidedBy'];
  if (value === null || value === undefined) return ok(null);
  const decidedBy = requireObject(value, `${what}: campo "decidedBy"`);
  if (!decidedBy.ok) return decidedBy;
  const id = text(decidedBy.value, 'id');
  if (!id.ok) return fail(`${what}: campo "decidedBy.${id.reason}"`);
  const name = text(decidedBy.value, 'name');
  if (!name.ok) return fail(`${what}: campo "decidedBy.${name.reason}"`);
  return ok({ id: id.value, name: name.value });
}

function parseApplication(source: Obj, what: string): Parsed<DriverApplication> {
  const id = text(source, 'id');
  if (!id.ok) return fail(`${what}: ${id.reason}`);
  const name = text(source, 'name');
  if (!name.ok) return fail(`${what}: ${name.reason}`);
  const email = text(source, 'email');
  if (!email.ok) return fail(`${what}: ${email.reason}`);
  const phone = text(source, 'phone');
  if (!phone.ok) return fail(`${what}: ${phone.reason}`);
  const city = text(source, 'city');
  if (!city.ok) return fail(`${what}: ${city.reason}`);
  const state = text(source, 'state');
  if (!state.ok) return fail(`${what}: ${state.reason}`);
  const alreadyDrivesForApp = nullableBool(source, 'alreadyDrivesForApp');
  if (!alreadyDrivesForApp.ok) return fail(`${what}: ${alreadyDrivesForApp.reason}`);
  const hasOwnVehicle = nullableBool(source, 'hasOwnVehicle');
  if (!hasOwnVehicle.ok) return fail(`${what}: ${hasOwnVehicle.reason}`);
  const status = source['status'];
  if (!isStatus(status)) return fail(`${what}: campo "status": valor desconhecido (${typeOf(status)})`);
  const source_ = text(source, 'source');
  if (!source_.ok) return fail(`${what}: ${source_.reason}`);
  const createdAt = text(source, 'createdAt');
  if (!createdAt.ok) return fail(`${what}: ${createdAt.reason}`);
  const decidedAt = nullableText(source, 'decidedAt');
  if (!decidedAt.ok) return fail(`${what}: ${decidedAt.reason}`);
  const decidedBy = parseDecidedBy(source, what);
  if (!decidedBy.ok) return decidedBy;
  const decisionReason = nullableText(source, 'decisionReason');
  if (!decisionReason.ok) return fail(`${what}: ${decisionReason.reason}`);

  return ok({
    id: id.value,
    name: name.value,
    email: email.value,
    phone: phone.value,
    city: city.value,
    state: state.value,
    alreadyDrivesForApp: alreadyDrivesForApp.value,
    hasOwnVehicle: hasOwnVehicle.value,
    status,
    source: source_.value,
    createdAt: createdAt.value,
    decidedAt: decidedAt.value,
    decidedBy: decidedBy.value,
    decisionReason: decisionReason.value,
  });
}

export function parseDriverApplicationResponse(raw: unknown): Parsed<DriverApplication> {
  const body = requireObject(raw, 'candidatura');
  if (!body.ok) return body;
  return parseApplication(body.value, 'candidatura');
}

export function parseDriverApplicationListResponse(raw: unknown): Parsed<DriverApplicationListResult> {
  const body = requireObject(raw, 'lista de candidaturas');
  if (!body.ok) return body;
  const items = body.value['items'];
  if (!Array.isArray(items)) return fail(`lista de candidaturas: campo "items": esperado lista, veio ${typeOf(items)}`);
  const parsedItems: DriverApplication[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = requireObject(items[i], `lista de candidaturas: items[${i}]`);
    if (!item.ok) return item;
    const parsed = parseApplication(item.value, `lista de candidaturas: items[${i}]`);
    if (!parsed.ok) return parsed;
    parsedItems.push(parsed.value);
  }
  const nextCursor = body.value['nextCursor'];
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    return fail(`lista de candidaturas: campo "nextCursor": esperado texto ou null, veio ${typeOf(nextCursor)}`);
  }
  return ok({ items: parsedItems, nextCursor });
}

export function parseDriverApplicationSummaryResponse(raw: unknown): Parsed<DriverApplicationSummary> {
  const body = requireObject(raw, 'resumo de candidaturas');
  if (!body.ok) return body;
  const counts: Record<DriverApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const status of STATUSES) {
    const value = body.value[status];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fail(`resumo de candidaturas: campo "${status}": esperado número, veio ${typeOf(value)}`);
    }
    counts[status] = value;
  }
  return ok(counts);
}

export function parseDriverApplicationDecisionResponse(raw: unknown): Parsed<DriverApplicationDecision> {
  const body = requireObject(raw, 'decisão de candidatura');
  if (!body.ok) return body;
  const id = text(body.value, 'id');
  if (!id.ok) return fail(`decisão de candidatura: ${id.reason}`);
  const status = body.value['status'];
  if (!isStatus(status) || status === 'pending') return fail(`decisão de candidatura: campo "status": valor desconhecido (${typeOf(status)})`);
  const decidedAt = text(body.value, 'decidedAt');
  if (!decidedAt.ok) return fail(`decisão de candidatura: ${decidedAt.reason}`);
  const decidedBy = parseDecidedBy(body.value, 'decisão de candidatura');
  if (!decidedBy.ok) return decidedBy;
  if (!decidedBy.value) return fail('decisão de candidatura: campo "decidedBy": ausente');
  const decisionReasonRaw = body.value['decisionReason'];
  if (decisionReasonRaw !== undefined && typeof decisionReasonRaw !== 'string') {
    return fail(`decisão de candidatura: campo "decisionReason": esperado texto, veio ${typeOf(decisionReasonRaw)}`);
  }
  return ok({
    id: id.value,
    status,
    decidedAt: decidedAt.value,
    decidedBy: decidedBy.value,
    ...(decisionReasonRaw !== undefined ? { decisionReason: decisionReasonRaw } : {}),
  });
}
