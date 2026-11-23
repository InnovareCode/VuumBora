#!/usr/bin/env node
/**
 * Confere que os dois apps abrem o WhatsApp de atendimento no número oficial.
 *
 * Nasceu da reprovação da Íris na onda 5 (23/11/2026): o app do motorista tinha um "9" a mais
 * depois do DDD (`5584931132584`), com o comentário do arquivo citando o número certo. Revisão que
 * lê o comentário não pega; contar dígitos pega. Roda no `npm run check` (CI).
 *
 * Número oficial decidido pelo dono em 22/11/2026: o mesmo do site, (84) 3113-2584, para os dois apps
 * (`docs/decisoes-do-dono.md`). Mudou o número? Mude aqui e nos dois arquivos abaixo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL_WHATSAPP_DIGITS = '558431132584';

const FILES = ['apps/passenger/src/support/supportChannels.ts', 'apps/driver/src/support/openSupportChannel.ts'];

let failed = false;
for (const file of FILES) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const match = source.match(/WHATSAPP_DIGITS\s*=\s*'(\d+)'/);
  if (!match) {
    console.error(`[check-support-channels] ${file}: constante WHATSAPP_DIGITS não encontrada.`);
    failed = true;
    continue;
  }
  if (match[1] !== OFFICIAL_WHATSAPP_DIGITS) {
    console.error(
      `[check-support-channels] ${file}: WHATSAPP_DIGITS = '${match[1]}', esperado '${OFFICIAL_WHATSAPP_DIGITS}' ((84) 3113-2584).`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`[check-support-channels] ok: os dois apps abrem o WhatsApp oficial (${OFFICIAL_WHATSAPP_DIGITS}).`);
