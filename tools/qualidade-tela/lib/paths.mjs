// Caminhos centrais da ferramenta. Nada aqui lê nem escreve fora de
// tools/qualidade-tela/ — `APPS_SRC` só serve de `cwd` para `expo start --web`
// (dev-server.mjs); a ferramenta não gera mais `dist/` (ver docs/qualidade-tela.md,
// "por que Metro ao vivo e não export estático").

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const TOOL_DIR = path.join(HERE, '..');
export const REPO_ROOT = path.join(TOOL_DIR, '..', '..');

export const APPS_SRC = {
  passageiro: path.join(REPO_ROOT, 'apps', 'passenger'),
  motorista: path.join(REPO_ROOT, 'apps', 'driver'),
};

/**
 * Onde fica a linha de base (as ~260 PNGs aprovadas). Por padrão, uma pasta local
 * NÃO versionada dentro da própria ferramenta (ver .gitignore ao lado) — decisão
 * documentada em docs/qualidade-tela.md. Pode ser trocada por uma pasta de rede, um
 * bucket montado como disco, etc., via variável de ambiente, sem mudar código.
 */
export const BASELINE_DIR = process.env.QUALIDADE_TELA_BASELINE_DIR
  ? path.resolve(process.env.QUALIDADE_TELA_BASELINE_DIR)
  : path.join(TOOL_DIR, '.baseline');

/** Onde ficam capturas novas e relatórios de uma rodada (sempre local, sempre descartável). */
export const SAIDA_DIR = process.env.QUALIDADE_TELA_SAIDA_DIR
  ? path.resolve(process.env.QUALIDADE_TELA_SAIDA_DIR)
  : path.join(TOOL_DIR, '.saida');

export const PRANCHAS_DIR = path.join(REPO_ROOT, 'VuumBora_Claude_Design_System', 'referencias');
export const TOKENS_JSON = path.join(REPO_ROOT, 'VuumBora_Claude_Design_System', 'tokens', 'vuumbora.tokens.json');
