/**
 * Publicação de uma versão dos Termos ou da Política (M-3, migração 0021) — lógica do script `npm run legal:publish`
 * (`scripts/publish-legal.mjs`, que só chama daqui, como `retention-identity.mjs` chama `identity-retention.ts`).
 *
 * RODA SÓ COM A CREDENCIAL DONA (`MIGRATION_DATABASE_URL`): o papel `vuumbora_api` não tem INSERT em
 * `legal_document_versions`, de propósito (quem conseguisse SQL com a credencial da API não publicaria nem trocaria o texto
 * que as pessoas "aceitaram"). O banco garante o resto: versão imutável, `published_at` do relógio do banco e
 * estritamente crescente, hash do texto vazio recusado.
 *
 * Decisões:
 *  - UMA transação para todos os perfis do comando: ou os dois perfis entram, ou nenhum (texto igual para passageiro e
 *    motorista = duas linhas com o mesmo hash);
 *  - reenviar a MESMA versão com o MESMO hash não muda nada (idempotente); com hash DIFERENTE é ERRO ALTO: o banco
 *    ignoraria em silêncio (versão é imutável) e o operador ficaria achando que corrigiu o texto. Texto errado = versão nova;
 *  - `legal_document_versions_published_at_monotonic` (relógio do banco voltou) é o único erro que se repete sozinho.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import type { AccountType } from '../domain/auth.js';
import { LEGAL_AUDIENCES, LEGAL_DOCUMENTS, LEGAL_VERSION_FORMAT, toStoredDocument, type LegalDocument } from '../domain/legal.js';

/** SHA-256 do texto vazio: o banco o recusa (hash de pipe que falhou). Aqui se recusa antes, com mensagem útil. */
const EMPTY_TEXT_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const MAX_ATTEMPTS = 3;

export interface PublishRequest {
  readonly document: LegalDocument;
  /** Sem repetição, em ordem fixa (passageiro, motorista): duas publicações simultâneas nunca travam uma à outra. */
  readonly audiences: readonly AccountType[];
  readonly version: string;
  /** SHA-256 hex minúsculo do ARQUIVO EXATO que será servido na URL desta versão. */
  readonly sha256: string;
  readonly requiresReacceptance: boolean;
}

export interface PublishOptions {
  readonly request: Omit<PublishRequest, 'sha256'>;
  /** Exatamente um dos dois vem preenchido. */
  readonly file: string | null;
  readonly sha256: string | null;
  readonly dryRun: boolean;
}

export type ParsedArgs = { readonly ok: true; readonly options: PublishOptions } | { readonly ok: false; readonly message: string };

export const PUBLISH_USAGE = [
  'Uso: npm run legal:publish -w @vuumbora/api -- --document=terms|privacy --audience=passenger,driver --version=<versão> (--file=<arquivo> | --sha256=<hex>) [--requires-reacceptance=true|false] [--dry-run]',
  '  --document               terms (Termos de Uso) ou privacy (Política de Privacidade)',
  '  --audience               passenger, driver, ou passenger,driver (mesmo texto para os dois = duas linhas, mesmo hash)',
  '  --version                letras/dígitos e . _ : + - (até 64), a mesma do nome do arquivo subido na URL',
  '  --file                   o arquivo EXATO que será servido (o script calcula o SHA-256 dos bytes)',
  '  --sha256                 alternativa a --file: hash hex (64) do arquivo exato, calculado fora (sha256sum)',
  '  --requires-reacceptance  true (padrão: mudança material, quem já aceitou aceita de novo) ou false (correção editorial)',
  '  --dry-run                só confere os argumentos e mostra o hash; não conecta ao banco',
].join('\n');

const FLAGS = new Set(['document', 'audience', 'version', 'file', 'sha256', 'requires-reacceptance']);

/** Valida os argumentos SEM tocar em arquivo nem banco. */
export function parsePublishArgs(argv: readonly string[]): ParsedArgs {
  const values = new Map<string, string>();
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    const match = /^--([a-z0-9-]+)=([\s\S]*)$/.exec(arg);
    if (!match || !FLAGS.has(match[1]!)) return { ok: false, message: `argumento não reconhecido: ${arg.split('=')[0]}` };
    if (values.has(match[1]!)) return { ok: false, message: `--${match[1]} repetido` };
    values.set(match[1]!, match[2]!);
  }

  const document = values.get('document');
  if (!document || !(LEGAL_DOCUMENTS as readonly string[]).includes(document)) return { ok: false, message: '--document deve ser terms ou privacy' };

  const rawAudiences = (values.get('audience') ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (rawAudiences.length === 0 || rawAudiences.some((a) => !(LEGAL_AUDIENCES as readonly string[]).includes(a)) || new Set(rawAudiences).size !== rawAudiences.length) {
    return { ok: false, message: '--audience deve ser passenger, driver ou passenger,driver (sem repetir; não existe "todos")' };
  }
  const audiences = LEGAL_AUDIENCES.filter((audience) => rawAudiences.includes(audience));

  const version = values.get('version') ?? '';
  if (!LEGAL_VERSION_FORMAT.test(version)) return { ok: false, message: '--version inválida (letras/dígitos e . _ : + -, começando por letra ou dígito, até 64)' };

  const file = values.get('file') ?? null;
  const sha256 = values.get('sha256')?.toLowerCase() ?? null;
  if ((file === null) === (sha256 === null)) return { ok: false, message: 'informe exatamente um entre --file e --sha256' };
  if (file !== null && file === '') return { ok: false, message: '--file vazio' };
  if (sha256 !== null && !/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, message: '--sha256 deve ter 64 caracteres hexadecimais' };
  if (sha256 === EMPTY_TEXT_SHA256) return { ok: false, message: '--sha256 é o hash do texto vazio (o comando que gerou o hash falhou?)' };

  const reacceptance = values.get('requires-reacceptance') ?? 'true';
  if (reacceptance !== 'true' && reacceptance !== 'false') return { ok: false, message: '--requires-reacceptance deve ser true ou false' };

  return { ok: true, options: { request: { document: document as LegalDocument, audiences, version, requiresReacceptance: reacceptance === 'true' }, file, sha256, dryRun } };
}

/** SHA-256 dos BYTES do arquivo (o que o app confere ao baixar a URL). Arquivo vazio é recusado. */
export function sha256OfFile(path: string): string {
  const bytes = readFileSync(path);
  if (bytes.length === 0) throw new Error('o arquivo está vazio');
  return createHash('sha256').update(bytes).digest('hex');
}

/** A versão já existe com OUTRO texto: versão publicada é imutável; o texto corrigido precisa de versão nova. */
export class PublishConflictError extends Error {
  constructor(readonly audience: AccountType, readonly version: string) {
    super(`a versão ${version} (${audience}) já está publicada com OUTRO texto; versão publicada não se edita: publique a versão seguinte`);
  }
}

export interface PublishOutcome {
  readonly audience: AccountType;
  readonly status: 'published' | 'already_published';
  /** A versão desta linha é a vigente do par agora? (Reenviar uma versão antiga devolve `false`.) */
  readonly isCurrent: boolean;
  readonly currentVersion: string;
}

async function publishOnce(pool: Pool, request: PublishRequest): Promise<PublishOutcome[]> {
  const stored = toStoredDocument(request.document);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const outcomes: PublishOutcome[] = [];
    for (const audience of request.audiences) {
      const inserted = await client.query(
        `INSERT INTO legal_document_versions (document, audience, version, text_sha256, requires_reacceptance)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (document, audience, version) DO NOTHING
         RETURNING version`,
        [stored, audience, request.version, request.sha256, request.requiresReacceptance],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<{ text_sha256: string }>(
          `SELECT text_sha256 FROM legal_document_versions WHERE document = $1 AND audience = $2 AND version = $3`,
          [stored, audience, request.version],
        );
        if (existing.rows[0]?.text_sha256 !== request.sha256) throw new PublishConflictError(audience, request.version);
      }
      const current = await client.query<{ version: string }>(
        `SELECT version FROM legal_current_versions WHERE document = $1 AND audience = $2`,
        [stored, audience],
      );
      const currentVersion = current.rows[0]!.version;
      outcomes.push({ audience, status: inserted.rowCount === 0 ? 'already_published' : 'published', isCurrent: currentVersion === request.version, currentVersion });
    }
    await client.query('COMMIT');
    return outcomes;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Publica a versão para todos os perfis pedidos, numa transação. Repete sozinho só o erro de relógio do banco (3 tentativas). */
export async function publishLegalVersion(pool: Pool, request: PublishRequest): Promise<PublishOutcome[]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await publishOnce(pool, request);
    } catch (err) {
      const { code, constraint } = err as { code?: string; constraint?: string };
      const clockWentBack = code === '23514' && constraint === 'legal_document_versions_published_at_monotonic';
      if (!clockWentBack || attempt >= MAX_ATTEMPTS) throw err;
    }
  }
}
