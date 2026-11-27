/**
 * Adaptador `mock` da tarifa e da área no painel (M4, fatia K0 do `docs/plano-m3-m4.md` §3; telas do
 * G5). Só o papel `dono` passa (`403 forbidden` para os outros, antes de tudo).
 *
 * - Versão nunca é editada: `createFareTable` cria outra e fecha a vigente (`validTo`), N8.
 * - O simulador usa `calculateFare` e `splitFare` (`@vuumbora/domain`), os mesmos do simulador do dono.
 *   O arredondamento definitivo da cotação ("meio para cima, uma vez, no total") é a fatia G2.
 * - Idempotência de `createFareTable` por `idempotencyKey` (mesmo corpo = mesma versão; corpo
 *   diferente = `409 idempotency_key_reused`).
 */
import { calculateFare, splitFare, type ServiceArea } from '@vuumbora/domain';
import type { CursorPage, Result } from '../index';
import { catalogError, NETWORK_FAILURE } from '../server-error';
import { failWith, succeed } from '../trip/result';
import { createIdempotencyCache, fingerprint } from '../trip/idempotency';
import { MOCK_SERVICE_AREA, MOCK_TEST_FARE_VERSION } from '../geo/mock-data';
import {
  FARE_ADMIN_ERRORS,
  canManageFares,
  type AdminRole,
  type CategoryFareRates,
  type FareAdminErrorCode,
  type FareAdminPort,
  type FareSimulationInput,
  type FareSimulationResult,
  type FareSimulationRow,
  type FareTableDraft,
  type FareTableVersion,
} from './types';

export interface MockFareAdminOptions {
  /** Papel deste admin. Obrigatório: não há papel padrão. */
  readonly role: AdminRole;
  readonly clock?: () => number;
  readonly nextId?: () => string;
  /** Versões iniciais, mais antiga primeiro. Padrão: a versão de teste do mock. */
  readonly versions?: readonly FareTableVersion[];
  readonly serviceAreas?: readonly ServiceArea[];
}

export interface MockFareAdminControl {
  failNext(code: FareAdminErrorCode | 'network'): void;
  setRole(role: AdminRole): void;
}

export interface MockFareAdmin {
  readonly port: FareAdminPort;
  readonly control: MockFareAdminControl;
}

const SLUG_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_ROUTES = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isObjectBody(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRates(value: unknown): value is CategoryFareRates {
  if (!isObjectBody(value)) return false;
  const rates = value as Record<string, unknown>;
  return (
    typeof rates['categorySlug'] === 'string' &&
    SLUG_PATTERN.test(rates['categorySlug']) &&
    isNonNegativeInteger(rates['baseCents']) &&
    isNonNegativeInteger(rates['perKmCents']) &&
    isNonNegativeInteger(rates['perMinuteCents']) &&
    isNonNegativeInteger(rates['minimumFareCents'])
  );
}

/** Corpo de versão: ao menos uma categoria, sem slug repetido, valores inteiros ≥ 0, nota até 500. */
function isValidDraft(draft: unknown): draft is FareTableDraft {
  if (!isObjectBody(draft)) return false;
  const value = draft as Record<string, unknown>;
  const categories = value['categories'];
  const note = value['note'];
  if (typeof value['isTest'] !== 'boolean' || !Array.isArray(categories) || categories.length === 0) return false;
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) return false;
  if (!categories.every(isValidRates)) return false;
  return new Set(categories.map((rates: CategoryFareRates) => rates.categorySlug)).size === categories.length;
}

export function createMockFareAdmin(options: MockFareAdminOptions): MockFareAdmin {
  const clock = options.clock ?? Date.now;
  let counter = 0;
  const nextId = options.nextId ?? (() => `fare-mock-${++counter}`);
  let role = options.role;
  let forcedFailure: FareAdminErrorCode | 'network' | undefined;
  const versions: FareTableVersion[] = [...(options.versions ?? [MOCK_TEST_FARE_VERSION])];
  const serviceAreas = options.serviceAreas ?? [MOCK_SERVICE_AREA];
  const createCache = createIdempotencyCache<Result<FareTableVersion>>();

  const fail = (code: FareAdminErrorCode) => failWith(catalogError(FARE_ADMIN_ERRORS, code));

  function guard(): { readonly ok: false; readonly error: ReturnType<typeof catalogError> } | undefined {
    const forced = forcedFailure;
    forcedFailure = undefined;
    if (forced === 'network') return failWith(NETWORK_FAILURE);
    if (forced !== undefined) return fail(forced);
    if (!canManageFares(role)) return fail('forbidden');
    return undefined;
  }

  async function fareTables(input: { readonly cursor?: string; readonly limit?: number } = {}): Promise<Result<CursorPage<FareTableVersion>>> {
    const blocked = guard();
    if (blocked) return blocked;
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return fail('invalid_body');
    const newestFirst = [...versions].reverse();
    let start = 0;
    if (input.cursor !== undefined) {
      const at = newestFirst.findIndex((version) => version.fareVersionId === input.cursor);
      if (at === -1) return fail('invalid_cursor');
      start = at + 1;
    }
    const items = newestFirst.slice(start, start + limit);
    const last = items[items.length - 1];
    return succeed({ items, ...(start + limit < newestFirst.length && last ? { nextCursor: last.fareVersionId } : {}) });
  }

  async function createFareTable(draft: FareTableDraft, idempotencyKey: string): Promise<Result<FareTableVersion>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0 || idempotencyKey.length > 200) return fail('invalid_body');
    if (!isValidDraft(draft)) return fail('invalid_body');
    const print = fingerprint(draft);
    const cached = createCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === print ? cached.result : fail('idempotency_key_reused');

    const now = new Date(clock()).toISOString();
    const current = versions[versions.length - 1];
    if (current && current.validTo === undefined) versions[versions.length - 1] = { ...current, validTo: now };
    const created: FareTableVersion = {
      fareVersionId: nextId(),
      isTest: draft.isTest,
      validFrom: now,
      ...(draft.note !== undefined ? { note: draft.note } : {}),
      categories: draft.categories.map((rates) => ({ ...rates })),
    };
    versions.push(created);
    const result = succeed(created);
    createCache.set(idempotencyKey, print, result);
    return result;
  }

  async function simulate(input: FareSimulationInput): Promise<Result<FareSimulationResult>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (!isObjectBody(input) || !isValidDraft(input.versionDraft) || !Array.isArray(input.routes)) return fail('invalid_body');
    const { routes } = input;
    if (routes.length === 0 || routes.length > MAX_ROUTES) return fail('invalid_body');
    if (!routes.every((route) => isObjectBody(route) && isNonNegativeNumber(route.distanceM) && isNonNegativeNumber(route.durationS))) {
      return fail('invalid_body');
    }
    const rows: FareSimulationRow[] = [];
    routes.forEach((route, routeIndex) => {
      for (const rates of input.versionDraft.categories) {
        const total = calculateFare(rates, {
          distanceKm: route.distanceM / 1000,
          durationMinutes: route.durationS / 60,
          dynamicMultiplier: 1,
        }).totalCents;
        rows.push({
          routeIndex,
          categorySlug: rates.categorySlug,
          passengerPriceCents: total,
          driverEarningsCents: { fee20: splitFare(total, 20).driverPayoutCents, fee25: splitFare(total, 25).driverPayoutCents },
        });
      }
    });
    return succeed({ rows });
  }

  async function serviceAreasRoute(): Promise<Result<readonly ServiceArea[]>> {
    const blocked = guard();
    if (blocked) return blocked;
    return succeed(serviceAreas);
  }

  return {
    port: { fareTables, createFareTable, simulate, serviceAreas: serviceAreasRoute },
    control: {
      failNext(code) {
        forcedFailure = code;
      },
      setRole(next) {
        role = next;
      },
    },
  };
}
