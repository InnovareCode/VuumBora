import type { EmailEffectiveField, EmailFieldSource, EmailSettings, EmailTestResult } from './types';

/**
 * Validação das respostas de configuração de e-mail (SMTP) — mesmo padrão independente de arquivo de
 * `authResponses.ts`. FALHA FECHADA: formato fora do contrato (docs/contrato-admin-email.md) nunca aparece
 * como configuração na tela, vira `contract_mismatch` (ver `createHttpEmailSettingsAdapter`).
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

type Obj = Readonly<Record<string, unknown>>;

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

const FIELD_SOURCES: readonly EmailFieldSource[] = ['panel', 'env', 'unset'];

function isRecord(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldSource(value: unknown): value is EmailFieldSource {
  return typeof value === 'string' && (FIELD_SOURCES as readonly string[]).includes(value);
}

function typeOf(value: unknown): string {
  if (value === undefined) return 'ausente';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'lista';
  if (value === '') return 'texto vazio';
  return typeof value === 'string' ? 'texto' : typeof value;
}

function requireObject(raw: unknown, what: string): Parsed<Obj> {
  return isRecord(raw) ? ok(raw) : fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
}

function text(source: Obj, name: string): Parsed<string> {
  const value = source[name];
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "${name}": esperado texto, veio ${typeOf(value)}`);
}

function nullableText(source: Obj, name: string): Parsed<string | null> {
  const value = source[name];
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'string' ? ok(value) : fail(`campo "${name}": esperado texto ou null, veio ${typeOf(value)}`);
}

function nullableNumber(source: Obj, name: string): Parsed<number | null> {
  const value = source[name];
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'number' && Number.isFinite(value) ? ok(value) : fail(`campo "${name}": esperado número ou null, veio ${typeOf(value)}`);
}

function bool(source: Obj, name: string): Parsed<boolean> {
  const value = source[name];
  return typeof value === 'boolean' ? ok(value) : fail(`campo "${name}": esperado booleano, veio ${typeOf(value)}`);
}

function parseEffectiveField<T>(source: Obj, name: string, parseValue: (value: unknown) => Parsed<T | null>): Parsed<EmailEffectiveField<T>> {
  const fieldRaw = source[name];
  const field = requireObject(fieldRaw, `fields.${name}`);
  if (!field.ok) return field;
  const value = parseValue(field.value['value']);
  if (!value.ok) return fail(`fields.${name}.${value.reason}`);
  const fieldSource = field.value['source'];
  if (!isFieldSource(fieldSource)) return fail(`fields.${name}.source: valor desconhecido (${typeOf(fieldSource)})`);
  return ok({ value: value.value, source: fieldSource });
}

function parseStringOrNull(value: unknown): Parsed<string | null> {
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'string' ? ok(value) : fail(`campo "value": esperado texto ou null, veio ${typeOf(value)}`);
}

function parseNumberOrNull(value: unknown): Parsed<number | null> {
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'number' && Number.isFinite(value) ? ok(value) : fail(`campo "value": esperado número ou null, veio ${typeOf(value)}`);
}

export function parseEmailSettingsResponse(raw: unknown): Parsed<EmailSettings> {
  const body = requireObject(raw, 'configuração de e-mail');
  if (!body.ok) return body;

  const fieldsObj = requireObject(body.value['fields'], 'configuração de e-mail: campo "fields"');
  if (!fieldsObj.ok) return fieldsObj;
  const host = parseEffectiveField(fieldsObj.value, 'host', parseStringOrNull);
  if (!host.ok) return fail(`configuração de e-mail: ${host.reason}`);
  const port = parseEffectiveField(fieldsObj.value, 'port', parseNumberOrNull);
  if (!port.ok) return fail(`configuração de e-mail: ${port.reason}`);
  const user = parseEffectiveField(fieldsObj.value, 'user', parseStringOrNull);
  if (!user.ok) return fail(`configuração de e-mail: ${user.reason}`);
  const from = parseEffectiveField(fieldsObj.value, 'from', parseStringOrNull);
  if (!from.ok) return fail(`configuração de e-mail: ${from.reason}`);
  const passwordField = requireObject(fieldsObj.value['password'], 'configuração de e-mail: campo "fields.password"');
  if (!passwordField.ok) return passwordField;
  const passwordSaved = bool(passwordField.value, 'saved');
  if (!passwordSaved.ok) return fail(`configuração de e-mail: fields.password.${passwordSaved.reason}`);
  const passwordSource = passwordField.value['source'];
  if (!isFieldSource(passwordSource)) return fail(`configuração de e-mail: fields.password.source: valor desconhecido (${typeOf(passwordSource)})`);

  const panelObj = requireObject(body.value['panel'], 'configuração de e-mail: campo "panel"');
  if (!panelObj.ok) return panelObj;
  const panelHost = nullableText(panelObj.value, 'host');
  if (!panelHost.ok) return fail(`configuração de e-mail: panel.${panelHost.reason}`);
  const panelPort = nullableNumber(panelObj.value, 'port');
  if (!panelPort.ok) return fail(`configuração de e-mail: panel.${panelPort.reason}`);
  const panelUser = nullableText(panelObj.value, 'user');
  if (!panelUser.ok) return fail(`configuração de e-mail: panel.${panelUser.reason}`);
  const panelFrom = nullableText(panelObj.value, 'from');
  if (!panelFrom.ok) return fail(`configuração de e-mail: panel.${panelFrom.reason}`);
  const panelPasswordSaved = bool(panelObj.value, 'passwordSaved');
  if (!panelPasswordSaved.ok) return fail(`configuração de e-mail: panel.${panelPasswordSaved.reason}`);

  const configured = bool(body.value, 'configured');
  if (!configured.ok) return fail(`configuração de e-mail: ${configured.reason}`);
  const missing = body.value['missing'];
  if (!Array.isArray(missing) || !missing.every((item): item is string => typeof item === 'string')) {
    return fail(`configuração de e-mail: campo "missing": esperado lista de textos, veio ${typeOf(missing)}`);
  }
  const summary = nullableText(body.value, 'summary');
  if (!summary.ok) return fail(`configuração de e-mail: ${summary.reason}`);
  const updatedAt = nullableText(body.value, 'updatedAt');
  if (!updatedAt.ok) return fail(`configuração de e-mail: ${updatedAt.reason}`);
  const canStorePassword = bool(body.value, 'canStorePassword');
  if (!canStorePassword.ok) return fail(`configuração de e-mail: ${canStorePassword.reason}`);

  return ok({
    fields: {
      host: host.value,
      port: port.value,
      user: user.value,
      from: from.value,
      password: { saved: passwordSaved.value, source: passwordSource },
    },
    panel: {
      host: panelHost.value,
      port: panelPort.value,
      user: panelUser.value,
      from: panelFrom.value,
      passwordSaved: panelPasswordSaved.value,
    },
    configured: configured.value,
    missing,
    summary: summary.value,
    updatedAt: updatedAt.value,
    canStorePassword: canStorePassword.value,
  });
}

export function parseEmailTestResultResponse(raw: unknown): Parsed<EmailTestResult> {
  const body = requireObject(raw, 'resultado do teste de e-mail');
  if (!body.ok) return body;
  if (body.value['delivered'] !== true) {
    return fail(`resultado do teste de e-mail: campo "delivered": esperado true, veio ${typeOf(body.value['delivered'])}`);
  }
  const to = text(body.value, 'to');
  if (!to.ok) return fail(`resultado do teste de e-mail: ${to.reason}`);
  return ok({ delivered: true, to: to.value });
}
