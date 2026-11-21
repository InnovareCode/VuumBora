/**
 * Segredos obrigatórios que, ausentes, deixam parte da API em 503 SEM derrubar o processo (falha fechada): a identidade dos
 * apps (`AUTH_PEPPER`, `AUTH_JWT_SECRET`) e o segundo fator do admin (`ADMIN_TOTP_ENCRYPTION_KEY`, sem a qual dono e
 * financeiro não entram). Só nomes e motivos — nunca valores. Usado pelo boot (`server.ts`) para avisar alto e, com
 * `REQUIRE_SECRETS=true`, recusar subir.
 */
import { authConfigProblems } from './auth-config.js';

export function bootSecretProblems(source: NodeJS.ProcessEnv = process.env): string[] {
  const problems = authConfigProblems(source);
  if (!source['ADMIN_TOTP_ENCRYPTION_KEY']?.trim()) problems.push('ADMIN_TOTP_ENCRYPTION_KEY:missing');
  return problems;
}
