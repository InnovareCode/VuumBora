/**
 * Adaptador `mock` da identidade: um "servidor" em memória que segue as MESMAS regras e os MESMOS códigos de erro do
 * contrato (docs/contrato-identidade-apps.md), para a UI poder ser construída e testada sem a API.
 *
 * Como garante "mesmos códigos": cada operação devolve uma resposta no formato do servidor (`status` + envelope) e
 * os erros passam por `apiErrorFromReply` — a MESMA função do adaptador `http`. Toda resposta sai com `origin: 'mock'`.
 *
 * O que reproduz: validações do cadastro (e-mail, senha 8-72 bytes, telefone, data de nascimento, 18 anos no fuso de
 * Natal, aceite), `email_taken` x substituição de conta não verificada, código de 6 dígitos com 5 tentativas
 * (`invalid_code` + `attemptsLeft`, `code_locked`, `code_expired`), teto de redefinição (`reset_locked`), login
 * (`invalid_credentials`, `email_not_verified`, espera progressiva `too_many_attempts` + `retryAfterSeconds`), tokens
 * rotativos (reuso do refresh revoga a família), `logout` idempotente, `logout-all`, `me`.
 * Termos e Política (M-2): `legalCurrent`, as versões exibidas no cadastro (`400 consent_required` se faltam,
 * `409 consent_outdated` + `error.current` se não são as vigentes), `consent` em `me` e o reaceite (`acceptConsents`).
 * O catálogo (`options.legal`) é o do MOCK: o cliente nunca o consulta por baixo dos panos, a tela tem de passar as
 * versões que renderizou. `sha256` (zeros) e `url` (`.invalid`) são fictícios: não há texto para baixar nem conferir.
 * O que NÃO reproduz: limites por IP/e-mail do servidor, e-mail de verdade, `503`, `requires_reacceptance=false`
 * (toda mudança de versão é material). O telefone é validado só pela contagem de dígitos (o servidor normaliza com
 * regras brasileiras).
 *
 * Código de verificação do mock: `123456` (configurável). Nunca é aceito pelo servidor real.
 */
import { apiErrorFromReply, type ServerReply } from './errors';
import { LEGAL_VERSION_PATTERN } from './legal';
import { failWith, succeed } from './result';
import type {
  AccountSummary,
  AccountType,
  AccountWithConsent,
  AuthenticatedSession,
  ConsentStatus,
  CurrentLegal,
  IdentityApi,
  LegalDocumentName,
  LegalDocumentView,
  RegisterOutput,
  ResendOutput,
  SessionTokens,
} from './types';
import type { Result } from '../index';

export interface MockIdentityOptions {
  /** Código de 6 dígitos que o "e-mail" do mock entrega. Padrão `123456`. */
  readonly verificationCode?: string;
  /** Atraso artificial por chamada, para a UI mostrar estados de carregamento. Padrão 0. */
  readonly latencyMs?: number;
  /** Relógio em ms (injetável nos testes). */
  readonly clock?: () => number;
  /**
   * Versões vigentes dos Termos e da Política NESTE mock (padrão `mock-1` nas duas). O mock lê o objeto a cada
   * chamada: para simular "o jurídico publicou uma versão nova", troque `terms`/`privacy` depois do cadastro e o
   * `me` passa a listar o aceite pendente.
   */
  readonly legal?: MockLegalVersions;
}

/** Mutável de propósito (ver `MockIdentityOptions.legal`). */
export interface MockLegalVersions {
  terms: string;
  privacy: string;
}

const LEGAL_DOCUMENTS: readonly LegalDocumentName[] = ['terms', 'privacy'];
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_ATTEMPTS = 5;
const RESET_FAILURE_CEILING = 10;
const RESET_LOCK_SECONDS = 24 * 60 * 60;
const MAX_LOGIN_DELAY_SECONDS = 900;
const NATAL_UTC_OFFSET_MS = -3 * 60 * 60 * 1000; // America/Fortaleza: UTC-3 o ano todo

type Outcome<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly reply: ServerReply };

function reject(status: number, code: string, message: string, extras: Record<string, unknown> = {}): Outcome<never> {
  return { ok: false, reply: { status, body: { ok: false, error: { code, message, ...extras } } } };
}
const accept = <T>(data: T): Outcome<T> => ({ ok: true, data });

const INVALID_BODY = (): Outcome<never> => reject(400, 'invalid_body', 'Corpo da requisição inválido.');

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CodeState {
  readonly code: string;
  attemptsLeft: number;
}

interface MockAccount {
  readonly id: string;
  readonly publicId: string;
  readonly fullName: string;
  readonly email: string;
  password: string;
  verified: boolean;
  verification: CodeState | null;
  reset: CodeState | null;
  resetFailures: number;
  /** Última versão aceita de cada documento (a do cadastro, ou a do último reaceite). */
  accepted: { terms: string; privacy: string };
}

interface Family {
  readonly id: string;
  readonly accountId: string;
  live: boolean;
}

interface RefreshRecord {
  readonly familyId: string;
  readonly expiresAt: number;
  rotated: boolean;
}

export function createMockIdentityApi(accountType: AccountType, options: MockIdentityOptions = {}): IdentityApi {
  const clock = options.clock ?? Date.now;
  const latencyMs = options.latencyMs ?? 0;
  const code = options.verificationCode ?? '123456';
  if (!/^[0-9]{6}$/.test(code)) throw new Error('createMockIdentityApi: verificationCode precisa ter 6 dígitos.');
  const legal: MockLegalVersions = options.legal ?? { terms: 'mock-1', privacy: 'mock-1' };
  for (const document of LEGAL_DOCUMENTS) {
    if (!LEGAL_VERSION_PATTERN.test(legal[document])) throw new Error(`createMockIdentityApi: legal.${document} não é uma versão válida.`);
  }
  const legalPublishedAt = new Date(clock()).toISOString();

  const accounts = new Map<string, MockAccount>();
  const families = new Map<string, Family>();
  const refreshTokens = new Map<string, RefreshRecord>();
  const accessTokens = new Map<string, { familyId: string; accountId: string; expiresAt: number }>();
  const loginFailures = new Map<string, { count: number; lastAt: number }>();
  let counter = 0;

  const nextId = (): number => {
    counter += 1;
    return counter;
  };

  function summary(account: MockAccount): AccountSummary {
    return { id: account.id, publicId: account.publicId, fullName: account.fullName, accountType };
  }

  function legalView(document: LegalDocumentName): LegalDocumentView {
    const version = legal[document];
    return {
      version,
      sha256: '0'.repeat(64), // fictício: o mock não tem texto
      publishedAt: legalPublishedAt,
      url: `https://textos.mock.invalid/${document}/${accountType}/${version}`,
    };
  }

  function currentLegal(): CurrentLegal {
    return { audience: accountType, terms: legalView('terms'), privacy: legalView('privacy') };
  }

  /** O que falta aceitar: os documentos cuja versão aceita não é a vigente, na ordem Termos, Política. */
  function consentOf(account: MockAccount): ConsentStatus {
    const pending = LEGAL_DOCUMENTS.filter((document) => account.accepted[document] !== legal[document]).map((document) => ({
      document,
      ...legalView(document),
    }));
    return { upToDate: pending.length === 0, pending };
  }

  const outdated = (): Outcome<never> =>
    reject(409, 'consent_outdated', 'Os Termos ou a Política mudaram. Leia a versão atual e aceite de novo.', { current: currentLegal() });

  function findByIdentifier(identifier: string): MockAccount | undefined {
    const trimmed = identifier.trim();
    const wanted = trimmed.includes('@') ? trimmed.toLowerCase() : trimmed.toUpperCase();
    for (const account of accounts.values()) {
      if (trimmed.includes('@') ? account.email === wanted : account.publicId === wanted) return account;
    }
    return undefined;
  }

  function newCode(): CodeState {
    return { code, attemptsLeft: CODE_ATTEMPTS };
  }

  /** Data de hoje no fuso de Natal, como [ano, mês, dia]. */
  function natalToday(): [number, number, number] {
    const shifted = new Date(clock() + NATAL_UTC_OFFSET_MS);
    return [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()];
  }

  function checkBirthDate(raw: string): Outcome<null> {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const invalid = () => reject(400, 'invalid_birth_date', 'Data de nascimento inválida. Use o formato AAAA-MM-DD.');
    if (!match) return invalid();
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number];
    const asDate = new Date(Date.UTC(year, month - 1, day));
    const real = asDate.getUTCFullYear() === year && asDate.getUTCMonth() === month - 1 && asDate.getUTCDate() === day;
    if (!real || year < 1900) return invalid();
    const [ty, tm, td] = natalToday();
    const today = Date.UTC(ty, tm - 1, td);
    if (asDate.getTime() > today) return invalid();
    // 18 anos completos: quem nasceu em 29/02 completa em 01/03 nos anos não bissextos (Date.UTC já rola o dia).
    if (Date.UTC(year + 18, month - 1, day) > today) {
      return reject(403, 'underage', 'É preciso ter 18 anos ou mais para criar uma conta.');
    }
    return accept(null);
  }

  /** Confere o código de 6 dígitos (verificação ou redefinição). Gasta uma tentativa por erro. */
  function checkCode(
    state: CodeState | null,
    given: string,
    rules: { readonly passwordOk?: boolean; readonly message?: string; readonly onWrong?: () => void } = {},
  ): Outcome<null> {
    if (!state) return reject(400, 'code_expired', 'Código expirado ou inexistente. Peça um novo código.');
    if (state.attemptsLeft <= 0) return reject(429, 'code_locked', 'Muitas tentativas com este código. Peça um novo código.');
    if (given === state.code && (rules.passwordOk ?? true)) return accept(null);
    state.attemptsLeft -= 1;
    rules.onWrong?.();
    return reject(400, 'invalid_code', rules.message ?? 'Código incorreto.', { attemptsLeft: state.attemptsLeft });
  }

  function loginWait(key: string): number {
    const record = loginFailures.get(key);
    if (!record) return 0;
    const delay = Math.min(2 ** (record.count - 1), MAX_LOGIN_DELAY_SECONDS);
    return Math.max(0, Math.ceil((record.lastAt + delay * 1000 - clock()) / 1000));
  }

  function issueTokens(familyId: string, accountId: string): SessionTokens {
    const now = clock();
    const n = String(nextId()).padStart(6, '0');
    const accessToken = `mock-access-token-${n}`;
    const refreshToken = `mock-refresh-token-${n}`;
    accessTokens.set(accessToken, { familyId, accountId, expiresAt: now + ACCESS_TTL_MS });
    refreshTokens.set(refreshToken, { familyId, expiresAt: now + REFRESH_TTL_MS, rotated: false });
    return {
      accessToken,
      accessTokenExpiresAt: new Date(now + ACCESS_TTL_MS).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: new Date(now + REFRESH_TTL_MS).toISOString(),
    };
  }

  function revokeAccount(accountId: string): number {
    let revoked = 0;
    for (const family of families.values()) {
      if (family.accountId === accountId && family.live) {
        family.live = false;
        revoked += 1;
      }
    }
    return revoked;
  }

  function authenticate(accessToken: string): Outcome<MockAccount> {
    const record = accessTokens.get(accessToken);
    const family = record ? families.get(record.familyId) : undefined;
    const account = record ? accounts.get(record.accountId) : undefined;
    if (!record || !family?.live || !account || record.expiresAt <= clock()) {
      return reject(401, 'unauthorized', 'Sessão inválida ou expirada.');
    }
    return accept(account);
  }

  const invalidRefresh = () => reject(401, 'invalid_refresh_token', 'Sessão expirada. Faça login novamente.');

  // ---- operações (síncronas; o invólucro abaixo põe latência e converte para Result) ----

  function register(raw: Record<string, unknown>): Outcome<RegisterOutput> {
    const { fullName, email, password, phone, birthDate, termsAccepted, privacyAccepted, termsVersion, privacyVersion } = raw;
    if (!isString(fullName) || fullName.trim().length < 1 || fullName.trim().length > 120) return INVALID_BODY();
    if (!isString(email) || !EMAIL_PATTERN.test(email.trim()) || email.trim().length > 254) {
      return reject(400, 'invalid_email', 'E-mail inválido.');
    }
    if (!isString(password) || password.length < 8 || utf8ByteLength(password) > 72) {
      return reject(400, 'invalid_password', 'A senha deve ter de 8 a 72 caracteres.');
    }
    if (phone !== undefined && !isString(phone)) return INVALID_BODY();
    if (!isString(birthDate) || birthDate.length > 10) {
      return reject(400, 'invalid_birth_date', 'Informe a data de nascimento no formato AAAA-MM-DD.');
    }
    if (termsAccepted !== true || privacyAccepted !== true) {
      return reject(400, 'consent_required', 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
    }
    // As versões que a tela EXIBIU: ausentes ou malformadas = o app não disse o que mostrou (como a API).
    if (!isString(termsVersion) || !isString(privacyVersion) || !LEGAL_VERSION_PATTERN.test(termsVersion) || !LEGAL_VERSION_PATTERN.test(privacyVersion)) {
      return reject(400, 'consent_required', 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
    }
    const age = checkBirthDate(birthDate);
    if (!age.ok) return age;
    if (isString(phone) && phone.trim() !== '' && !/^\d{10,13}$/.test(phone.replace(/\D/g, ''))) {
      return reject(400, 'invalid_phone', 'Telefone inválido.');
    }
    // Versão que não é a vigente: nada é criado e a resposta traz o que mostrar de novo (antes de qualquer limite).
    if (termsVersion !== legal.terms || privacyVersion !== legal.privacy) return outdated();

    const normalizedEmail = email.trim().toLowerCase();
    const existing = findByIdentifier(normalizedEmail);
    if (existing?.verified) return reject(409, 'email_taken', 'Este e-mail já está cadastrado.');
    if (existing) accounts.delete(existing.id); // conta pendente é SUBSTITUÍDA (ids novos), nunca editada

    const id = nextId();
    const account: MockAccount = {
      id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
      publicId: `VB${String(100000 + id)}`,
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      verified: false,
      verification: newCode(),
      reset: null,
      resetFailures: 0,
      accepted: { terms: termsVersion, privacy: privacyVersion },
    };
    accounts.set(account.id, account);
    return accept({
      account: summary(account),
      verification: { required: true, emailSent: true, resendAfterSeconds: 60 },
    });
  }

  function verifyEmail(raw: Record<string, unknown>): Outcome<{ readonly verified: true }> {
    const { identifier, code: given, password } = raw;
    if (!isString(identifier) || identifier.trim() === '' || identifier.length > 254) return INVALID_BODY();
    if (!isString(given) || !/^[0-9]{6}$/.test(given.trim())) return INVALID_BODY();
    if (!isString(password) || password.length < 1 || password.length > 256) return INVALID_BODY();
    const account = findByIdentifier(identifier);
    if (!account || account.verified) return reject(400, 'code_expired', 'Código expirado ou inexistente. Peça um novo código.');
    // Código OU senha errados: mesma resposta e a mesma contagem de tentativas.
    const checked = checkCode(account.verification, given.trim(), {
      passwordOk: password === account.password,
      message: 'Código ou senha incorretos.',
    });
    if (!checked.ok) return checked;
    account.verified = true;
    account.verification = null;
    return accept({ verified: true });
  }

  function resendVerification(raw: Record<string, unknown>): Outcome<ResendOutput> {
    const { identifier } = raw;
    if (!isString(identifier) || identifier.trim() === '' || identifier.length > 254) return INVALID_BODY();
    const account = findByIdentifier(identifier);
    if (account && !account.verified) account.verification = newCode();
    return accept({ resendAfterSeconds: 60 }); // igual exista a conta ou não
  }

  function forgotPassword(raw: Record<string, unknown>): Outcome<ResendOutput> {
    const { email } = raw;
    if (!isString(email) || !EMAIL_PATTERN.test(email.trim())) return INVALID_BODY();
    const account = findByIdentifier(email.trim());
    if (account?.verified && account.resetFailures < RESET_FAILURE_CEILING) account.reset = newCode();
    return accept({ resendAfterSeconds: 60 });
  }

  function resetPassword(raw: Record<string, unknown>): Outcome<{ readonly passwordChanged: true; readonly sessionsRevoked: true }> {
    const { email, code: given, newPassword } = raw;
    if (!isString(newPassword) || newPassword.length < 8 || utf8ByteLength(newPassword) > 72) {
      return reject(400, 'invalid_password', 'A senha deve ter de 8 a 72 caracteres.');
    }
    if (!isString(email) || !EMAIL_PATTERN.test(email.trim())) return INVALID_BODY();
    if (!isString(given) || !/^[0-9]{6}$/.test(given.trim())) return INVALID_BODY();
    const account = findByIdentifier(email.trim());
    if (!account?.verified) return reject(400, 'code_expired', 'Código expirado ou inexistente. Peça um novo código.');
    if (account.resetFailures >= RESET_FAILURE_CEILING) {
      return reject(429, 'reset_locked', 'Muitas tentativas de redefinição para esta conta. Tente novamente mais tarde ou fale com o suporte.', {
        retryAfterSeconds: RESET_LOCK_SECONDS,
      });
    }
    const checked = checkCode(account.reset, given.trim(), { onWrong: () => (account.resetFailures += 1) });
    if (!checked.ok) return checked;
    account.password = newPassword;
    account.reset = null;
    account.resetFailures = 0;
    revokeAccount(account.id);
    return accept({ passwordChanged: true, sessionsRevoked: true });
  }

  function login(raw: Record<string, unknown>): Outcome<AuthenticatedSession> {
    const { identifier, password, device } = raw;
    if (!isString(identifier) || identifier.trim() === '' || identifier.length > 254) return INVALID_BODY();
    if (!isString(password) || password.length < 1 || password.length > 256) return INVALID_BODY();
    if (device !== undefined) {
      const d = device as Record<string, unknown> | null;
      const platformOk = d !== null && typeof d === 'object' && ['android', 'ios', 'web'].includes(String(d['platform']));
      const idOk = d !== null && typeof d === 'object' && isString(d['installationId']) && d['installationId'].length >= 8 && d['installationId'].length <= 128;
      if (!platformOk || !idOk) return INVALID_BODY();
    }

    const key = identifier.trim().toLowerCase();
    const wait = loginWait(key);
    if (wait > 0) {
      return reject(429, 'too_many_attempts', 'Muitas tentativas. Aguarde um pouco antes de tentar de novo.', { retryAfterSeconds: wait });
    }
    const account = findByIdentifier(identifier);
    if (!account || account.password !== password) {
      const previous = loginFailures.get(key);
      loginFailures.set(key, { count: (previous?.count ?? 0) + 1, lastAt: clock() });
      return reject(401, 'invalid_credentials', 'E-mail/ID ou senha incorretos.');
    }
    if (!account.verified) return reject(403, 'email_not_verified', 'Confirme seu e-mail para entrar.');

    loginFailures.delete(key);
    const family: Family = { id: `family-${nextId()}`, accountId: account.id, live: true };
    families.set(family.id, family);
    return accept({ ...issueTokens(family.id, account.id), account: summary(account) });
  }

  function refresh(raw: Record<string, unknown>): Outcome<SessionTokens> {
    const { refreshToken } = raw;
    if (!isString(refreshToken) || refreshToken.length < 20 || refreshToken.length > 200) return INVALID_BODY();
    const record = refreshTokens.get(refreshToken);
    const family = record ? families.get(record.familyId) : undefined;
    if (!record || !family?.live) return invalidRefresh();
    if (record.rotated) {
      family.live = false; // reuso: derruba a FAMÍLIA inteira, como a API
      return invalidRefresh();
    }
    if (record.expiresAt <= clock()) return invalidRefresh();
    record.rotated = true;
    return accept(issueTokens(family.id, family.accountId));
  }

  function logout(raw: Record<string, unknown>): Outcome<undefined> {
    const { refreshToken } = raw;
    if (!isString(refreshToken) || refreshToken.length < 20 || refreshToken.length > 200) return INVALID_BODY();
    const family = families.get(refreshTokens.get(refreshToken)?.familyId ?? '');
    if (family) family.live = false;
    return accept(undefined); // idempotente
  }

  /** `POST /consents`: tudo ou nada; a versão enviada tem de ser a vigente; idempotente (reaceitar a mesma não muda nada). */
  function acceptConsents(account: MockAccount, raw: Record<string, unknown>): Outcome<ConsentStatus> {
    const { termsVersion, privacyVersion } = raw;
    const sent: Array<[LegalDocumentName, string]> = [];
    for (const [document, value] of [['terms', termsVersion], ['privacy', privacyVersion]] as const) {
      if (value === undefined) continue;
      if (!isString(value) || !LEGAL_VERSION_PATTERN.test(value)) {
        return reject(400, 'consent_required', 'Informe a versão dos Termos e/ou da Política que foi exibida.');
      }
      sent.push([document, value]);
    }
    if (sent.length === 0) return reject(400, 'consent_required', 'Informe a versão dos Termos e/ou da Política que foi exibida.');
    if (sent.some(([document, version]) => version !== legal[document])) return outdated();
    for (const [document, version] of sent) account.accepted[document] = version;
    return accept(consentOf(account));
  }

  // ---- invólucro: latência + conversão para Result ----

  async function respond<T>(operation: () => Outcome<T>): Promise<Result<T>> {
    if (latencyMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
    const outcome = operation();
    return outcome.ok ? succeed(outcome.data, 'mock') : failWith(apiErrorFromReply(outcome.reply, accountType));
  }

  const asBody = (input: unknown): Record<string, unknown> =>
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  return {
    legalCurrent: () => respond(() => accept(currentLegal())),
    register: (input) => respond(() => register(asBody(input))),
    verifyEmail: (input) => respond(() => verifyEmail(asBody(input))),
    resendVerification: (input) => respond(() => resendVerification(asBody(input))),
    forgotPassword: (input) => respond(() => forgotPassword(asBody(input))),
    resetPassword: (input) => respond(() => resetPassword(asBody(input))),
    login: (input, device) => respond(() => login({ ...asBody(input), device })),
    refresh: (refreshToken) => respond(() => refresh({ refreshToken })),
    logout: (refreshToken) => respond(() => logout({ refreshToken })),
    logoutAll: (accessToken) =>
      respond(() => {
        const auth = authenticate(accessToken);
        return auth.ok ? accept({ revokedSessions: revokeAccount(auth.data.id) }) : auth;
      }),
    me: (accessToken) =>
      respond((): Outcome<AccountWithConsent> => {
        const auth = authenticate(accessToken);
        return auth.ok ? accept({ ...summary(auth.data), consent: consentOf(auth.data) }) : auth;
      }),
    acceptConsents: (accessToken, input) =>
      respond(() => {
        const auth = authenticate(accessToken);
        return auth.ok ? acceptConsents(auth.data, asBody(input)) : auth;
      }),
  };
}
