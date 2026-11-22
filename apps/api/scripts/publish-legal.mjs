#!/usr/bin/env node
/**
 * Publica uma versão dos Termos de Uso ou da Política de Privacidade (M-3, migração 0021). É assim que uma versão
 * "passa a valer": a versão vigente é a mais recente do catálogo `legal_document_versions`, e a API só LÊ dele.
 *
 * RODE COM A CREDENCIAL DONA DO BANCO (`MIGRATION_DATABASE_URL`), numa tarefa/terminal de operador: o papel da API
 * (`vuumbora_api`) não tem INSERT no catálogo, de propósito.
 *
 * Passos (docs/contrato-identidade-apps.md, "Publicação"):
 *   1. suba o arquivo da versão na URL dela (<LEGAL_DOCUMENTS_BASE_URL>/<terms|privacy>/<passenger|driver>/<versão>); depois disso ele não muda mais;
 *   2. rode este comando com o MESMO arquivo (o SHA-256 é dos bytes exatos: um espaço a mais muda o hash);
 *   3. confira: GET /v1/legal/current?audience=... — o `sha256` devolvido tem de bater com o do arquivo baixado da `url`.
 *
 *   npm run legal:publish -w @vuumbora/api -- --document=terms --audience=passenger,driver --version=2026-12-01 --file=./termos-2026-12-01.txt
 *   npm run legal:publish -w @vuumbora/api -- --document=privacy --audience=passenger,driver --version=2026-12-02 --sha256=<hex> --requires-reacceptance=false
 *
 * Reenviar a MESMA versão com o MESMO texto não muda nada; com texto DIFERENTE é erro (versão publicada é imutável:
 * publique a versão seguinte). Requer `dist/` construído (a lógica vive em src/lib/legal-publish.ts).
 * Não imprime credencial nem dado pessoal: só documento, perfil, versão e hash do texto (informação pública).
 */
import 'dotenv/config';
import pg from 'pg';
import { resolveOwnerDatabaseUrl } from './lib/owner-db-url.mjs';

async function main() {
  let lib;
  try {
    lib = await import('../dist/lib/legal-publish.js');
  } catch {
    console.error('[legal:publish] dist/ não encontrado: rode `npm run build` antes.');
    process.exit(1);
  }

  const parsed = lib.parsePublishArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[legal:publish] ${parsed.message}\n${lib.PUBLISH_USAGE}`);
    process.exit(1);
  }
  const { options } = parsed;

  let sha256 = options.sha256;
  if (options.file !== null) {
    try {
      sha256 = lib.sha256OfFile(options.file);
    } catch (err) {
      console.error(`[legal:publish] não consegui ler o arquivo (${err?.code ?? err?.message ?? 'erro'}).`);
      process.exit(1);
    }
  }
  const request = { ...options.request, sha256 };
  const where = `${request.document} · ${request.audiences.join(' + ')} · versão ${request.version}`;
  console.log(`[legal:publish] ${where} · sha256 ${sha256} · requer novo aceite: ${request.requiresReacceptance ? 'SIM (mudança material)' : 'não (correção editorial)'}`);

  if (options.dryRun) {
    console.log('[legal:publish] --dry-run: nada foi gravado (nem houve conexão com o banco).');
    return;
  }

  const pool = new pg.Pool({ connectionString: resolveOwnerDatabaseUrl('legal:publish'), max: 1 });
  try {
    const outcomes = await lib.publishLegalVersion(pool, request);
    for (const outcome of outcomes) {
      const status = outcome.status === 'published' ? 'PUBLICADA' : 'já estava publicada com este mesmo texto (nada mudou)';
      const current = outcome.isCurrent ? 'é a vigente' : `NÃO é a vigente (a vigente é ${outcome.currentVersion})`;
      console.log(`[legal:publish] ${outcome.audience}: ${status}; ${current}.`);
    }
    console.log('[legal:publish] agora confira GET /v1/legal/current?audience=... (o sha256 devolvido deve bater com o do arquivo baixado da url).');
  } catch (err) {
    if (err instanceof lib.PublishConflictError) {
      console.error(`[legal:publish] RECUSADO: ${err.message}.`);
    } else {
      // Sem err.message: pode ecoar trecho da connection string.
      console.error(`[legal:publish] falhou (${err?.code ?? err?.name ?? 'erro'}${err?.constraint ? `, ${err.constraint}` : ''}).`);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
