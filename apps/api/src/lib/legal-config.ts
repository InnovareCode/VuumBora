/**
 * Configuração dos documentos legais (Termos e Política). Lê `process.env` direto, como `auth-config.ts`, e FALHA
 * FECHADO: sem a URL base dos textos a API NÃO consegue mostrar o que a pessoa aceita, então o cadastro, o
 * reaceite e `GET /v1/legal/current` respondem 503 `consent_unavailable` (login, renovação e o resto seguem).
 *
 * A versão vigente NÃO vem daqui: vem do banco (`legal_current_versions`, migração 0021), publicada pelo operador
 * (`npm run legal:publish`). Aqui só mora o que NÃO deve ficar numa linha imutável do banco: o endereço de onde os
 * textos são servidos (um host que muda não pode deixar versão publicada com URL velha) e o cache da resposta.
 */
import { z } from 'zod';
import type { AccountType } from '../domain/auth.js';
import type { LegalDocument } from '../domain/legal.js';

const schema = z.object({
  /**
   * Onde os textos publicados ficam hospedados. O arquivo de cada versão mora em
   * `<base>/<terms|privacy>/<passenger|driver>/<versão>` e é IMUTÁVEL (texto novo = versão nova). Sem valor padrão de
   * propósito: onde hospedar é decisão do dono e a API não inventa endereço.
   */
  LEGAL_DOCUMENTS_BASE_URL: z.string().trim().optional(),
  /** `Cache-Control: public, max-age=N` de `GET /v1/legal/current`. O 409 `consent_outdated` já traz a vigente: cache velho se corrige sozinho. */
  LEGAL_CACHE_MAX_AGE_SECONDS: z.coerce.number().int().min(0).max(86_400).default(60),
});

export interface LegalConfig {
  /** Sem barra no fim, sem query nem fragmento. */
  readonly baseUrl: string;
  readonly cacheMaxAgeSeconds: number;
}

/** Normaliza a URL base; `null` se faltar ou for inaceitável (https obrigatório em produção; credencial, query e fragmento nunca). */
function normalizeBaseUrl(raw: string | undefined, source: NodeJS.ProcessEnv): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const production = source['NODE_ENV'] === 'production';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !production)) return null;
  if (url.username || url.password || url.search || url.hash || !url.hostname) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Por que os documentos legais ficariam indisponíveis, SÓ com nome de variável e motivo (nunca o valor). Vazio = configuração válida. */
export function legalConfigProblems(source: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = schema.safeParse(source);
  if (!parsed.success) return [...new Set(parsed.error.issues.map((issue) => `${String(issue.path[0] ?? 'LEGAL_*')}:invalid`))];
  const raw = parsed.data.LEGAL_DOCUMENTS_BASE_URL;
  if (!raw) return ['LEGAL_DOCUMENTS_BASE_URL:missing'];
  return normalizeBaseUrl(raw, source) ? [] : ['LEGAL_DOCUMENTS_BASE_URL:invalid'];
}

/** `null` quando a configuração não permite mostrar os textos (as rotas respondem 503 `consent_unavailable`). */
export function loadLegalConfig(source: NodeJS.ProcessEnv = process.env): LegalConfig | null {
  const parsed = schema.safeParse(source);
  if (!parsed.success) return null;
  const baseUrl = normalizeBaseUrl(parsed.data.LEGAL_DOCUMENTS_BASE_URL, source);
  if (!baseUrl) return null;
  return { baseUrl, cacheMaxAgeSeconds: parsed.data.LEGAL_CACHE_MAX_AGE_SECONDS };
}

/** Endereço do arquivo de uma versão. A versão já passou pelo formato do banco (sem `/`, `..` nem espaço); o escape é só cinto e suspensório. */
export function documentUrl(config: LegalConfig, document: LegalDocument, audience: AccountType, version: string): string {
  return `${config.baseUrl}/${document}/${audience}/${encodeURIComponent(version)}`;
}
