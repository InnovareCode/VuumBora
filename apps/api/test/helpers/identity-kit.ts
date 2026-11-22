/**
 * Kit dos testes da identidade dos apps: e-mail FAKE (caixa de entrada em
 * memória), cliente HTTP e atalhos (cadastrar, verificar, entrar). Importar
 * `./auth-env.js` e `./setup.js` ANTES deste arquivo.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { MailMessage, MailPort } from '../../src/lib/mail-port.js';
import { drainBackgroundTasks } from '../../src/lib/background-tasks.js';
import { pool, startApp, type TestApp } from './harness.js';
import { BASELINE_VERSION } from './legal-kit.js';

export const PASSWORD = 'Senha-de-teste-123';
/**
 * Campos obrigatórios do cadastro além de nome/e-mail/senha: data de nascimento (18+), o aceite dos documentos e as
 * versões que o app EXIBIU (a baseline do catálogo de teste, publicada por `prepareDatabase`).
 */
export const REGISTER_EXTRAS = { birthDate: '1990-05-15', termsAccepted: true, privacyAccepted: true, termsVersion: BASELINE_VERSION, privacyVersion: BASELINE_VERSION } as const;
export const DEVICE = { installationId: 'instalacao-0001', platform: 'android', label: 'Aparelho de teste' };
export const PEPPER = 'pepper-de-teste-0123456789-0123456789-abcdef';
export const JWT_SECRET = 'jwt-de-teste-0123456789-0123456789-abcdefghi';

export class FakeMailbox implements MailPort {
  readonly sent: MailMessage[] = [];
  failing = false;
  async send(message: MailMessage): Promise<void> {
    if (this.failing) throw Object.assign(new Error(`falha simulada para ${message.to}`), { code: 'ECONNREFUSED' });
    this.sent.push(message);
  }
  to(email: string): MailMessage[] {
    return this.sent.filter((m) => m.to === email.toLowerCase());
  }
  /** Último código de 6 dígitos enviado para o e-mail. */
  lastCode(email: string): string {
    const last = this.to(email).at(-1);
    assert.ok(last, `nenhum e-mail enviado para ${email}`);
    const match = /\b(\d{6})\b/.exec(last.text);
    assert.ok(match, 'e-mail sem código de 6 dígitos');
    return match[1]!;
  }
}

export interface Harness {
  readonly t: TestApp;
  readonly mailbox: FakeMailbox;
}

export async function startIdentityApp(): Promise<Harness> {
  const mailbox = new FakeMailbox();
  const t = await startApp(undefined, { mail: mailbox });
  return { t, mailbox };
}

let counter = 0;
export function randomIp(): string {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
}
/**
 * Marca única POR EXECUÇÃO do processo. O banco de teste persiste entre execuções (nada zera `accounts`), e um contador que
 * recomeça em 1 gerava `pessoa1@...` de novo na 2ª execução: o cadastro respondia 409 `email_taken` e os testes de
 * B-1 e F4 do bcrypt-ceiling falhavam sem defeito nenhum no código (achado N2 da passada 4 da Íris).
 * Começa com LETRA de propósito: `FakeMailbox.lastCode` procura um número de 6 dígitos isolado (`\b\d{6}\b`) no texto do
 * e-mail, e uma marca só de dígitos poderia ser confundida com o código.
 */
const RUN_TAG = `x${randomBytes(4).toString('hex')}`;
export function uniqueEmail(label = 'pessoa'): string {
  counter += 1;
  return `${label}${counter}-${RUN_TAG}@teste.vuumbora.dev`;
}

export type AccountType = 'passenger' | 'driver';

export function makeClient(h: Harness) {
  async function call(method: 'GET' | 'POST', url: string, options: { body?: unknown; bearer?: string; ip?: string } = {}) {
    const response = await h.t.app.inject({
      method,
      url,
      headers: {
        'x-forwarded-for': options.ip ?? randomIp(),
        'user-agent': 'okhttp/4.12 (Android)',
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
      },
      ...(options.body !== undefined ? { payload: options.body as object } : {}),
    });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null, headers: response.headers };
  }

  /** Cadastra (SEM sessão). Devolve a resposta e o código enviado por e-mail. */
  async function register(email = uniqueEmail(), accountType: AccountType = 'passenger', options: { ip?: string; password?: string } = {}) {
    const response = await call('POST', '/v1/auth/register', {
      ...(options.ip ? { ip: options.ip } : {}),
      body: { accountType, fullName: 'Pessoa de Teste', email, password: options.password ?? PASSWORD, ...REGISTER_EXTRAS },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    await drainBackgroundTasks();
    return { email, accountType, response, account: response.body.data.account as { id: string; publicId: string }, code: h.mailbox.lastCode(email) };
  }

  /** Cadastra, confirma o e-mail e entra: devolve a sessão (account, accessToken, refreshToken...). */
  async function registerAndLogin(email = uniqueEmail(), accountType: AccountType = 'passenger', options: { ip?: string } = {}) {
    const created = await register(email, accountType, options);
    const verified = await call('POST', '/v1/auth/verify-email', { body: { accountType, identifier: email, code: created.code, password: PASSWORD } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const login = await call('POST', '/v1/auth/login', { body: { accountType, identifier: email, password: PASSWORD, device: DEVICE } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { email, accountType, ...login.body.data };
  }

  return { call, register, registerAndLogin };
}

/** "Envelhece" os códigos da conta: o intervalo mínimo de reenvio passa, a validade segue viva. */
export async function ageCodes(accountId: string, seconds = 120): Promise<void> {
  await pool.query(
    `UPDATE account_email_codes SET created_at = created_at - make_interval(secs => $2), expires_at = expires_at - make_interval(secs => $2)
      WHERE account_id = $1`,
    [accountId, seconds],
  );
}

export async function dumpTables(tables: string[]): Promise<string> {
  const parts = await Promise.all(tables.map((name) => pool.query(`SELECT t::text AS row FROM ${name} t`)));
  return parts.map((r) => r.rows.map((x) => x.row).join('\n')).join('\n');
}

/** O código de 6 dígitos aparece como token isolado (não como pedaço de hash/id/microssegundo)? */
export function containsCode(haystack: string, code: string): boolean {
  return new RegExp(`(?<![0-9A-Za-z.])${code}(?![0-9A-Za-z])`).test(haystack);
}
