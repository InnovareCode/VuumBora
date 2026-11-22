import type { EmailSettings, EmailSettingsInput, EmailTestResult, StepUp } from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';
import { parseEmailSettingsResponse, parseEmailTestResultResponse } from './emailSettingsResponses';

/** Mesma regra de `auth.ts`: resposta fora do contrato nunca aparece como configuração válida — `contract_mismatch`. */
function contractMismatch(reason: string): { readonly ok: false; readonly error: { readonly kind: 'contract_mismatch' } } {
  console.error(`[admin] Resposta de configuração de e-mail incompatível com este painel (${reason}).`);
  return { ok: false, error: { kind: 'contract_mismatch' } };
}

/** Configuração SMTP do painel (só dono). Todas as mutações são POST — o CORS do admin só libera GET/POST. */
export interface EmailSettingsPort {
  get(): Promise<Result<EmailSettings>>;
  /**
   * Exige reautenticação (`stepUp`: senha atual + TOTP). Senha/código errados NÃO derrubam a sessão
   * (403 `password_invalid`, 401 `invalid_second_factor`, 429 `account_locked`/`two_factor_locked`).
   */
  save(input: EmailSettingsInput, stepUp: StepUp): Promise<Result<EmailSettings>>;
  /** Idempotente; mesma reautenticação de `save`. Remove só a senha gravada no painel (a da variável de ambiente não é tocada). */
  removeSavedPassword(stepUp: StepUp): Promise<Result<EmailSettings>>;
  /** Usa a configuração SALVA (não a do formulário). Sem `to`, o servidor manda para o e-mail do próprio dono. Não exige `stepUp`. */
  sendTest(to?: string): Promise<Result<EmailTestResult>>;
}

export function createHttpEmailSettingsAdapter(baseUrl: string): EmailSettingsPort {
  const request = createHttpRequester(baseUrl);
  async function getSettings(): Promise<Result<EmailSettings>> {
    const result = await request<unknown>({ path: '/v1/admin/settings/email' });
    if (!result.ok) return result;
    const parsed = parseEmailSettingsResponse(result.data);
    if (!parsed.ok) return contractMismatch(parsed.reason);
    return { ...result, data: parsed.value };
  }
  return {
    get: getSettings,
    async save(input, stepUp) {
      const result = await request<unknown>({
        path: '/v1/admin/settings/email',
        method: 'POST',
        body: { ...input, stepUp: { password: stepUp.password, code: stepUp.code } },
      });
      if (!result.ok) return result;
      const parsed = parseEmailSettingsResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async removeSavedPassword(stepUp) {
      const result = await request<unknown>({
        path: '/v1/admin/settings/email/password/remove',
        method: 'POST',
        body: { stepUp: { password: stepUp.password, code: stepUp.code } },
      });
      if (!result.ok) return result;
      const parsed = parseEmailSettingsResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async sendTest(to) {
      const result = await request<unknown>({ path: '/v1/admin/settings/email/test', method: 'POST', body: to ? { to } : {} });
      if (!result.ok) return result;
      const parsed = parseEmailTestResultResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
  };
}

/** Mock explícito: a configuração de e-mail só existe de verdade na API; em demonstração a tela diz isso em vez de fingir. */
export function createMockEmailSettingsAdapter(): EmailSettingsPort {
  const unavailable = async (): Promise<Result<never>> => ({
    ok: false,
    error: { kind: 'unknown', message: 'A configuração de e-mail só funciona com a API real (modo demonstração não a simula).' },
  });
  return { get: unavailable, save: unavailable, removeSavedPassword: unavailable, sendTest: unavailable };
}
