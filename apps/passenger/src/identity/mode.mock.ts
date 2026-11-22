/**
 * Modo `mock` (F02/B4, restaurado por decisão do Atlas): o padrão de `development` — sem API nem banco de
 * pé. A F09 (portão de qualidade, regressão visual) e as baterias da Íris dependem de telas com dado de
 * demonstração; forçar `http` em todo lugar deixaria essas telas sem o que mostrar. Para testar contra uma
 * API local de verdade em desenvolvimento, use `VUUMBORA_IDENTITY=http` no ambiente real (nunca em `.env`).
 *
 * Este arquivo só entra no bundle quando o resolver do `metro.config.js` aponta `./mode` para cá — nunca em
 * `preview`/`production` (ver `./mode.ts` para o porquê disso ser uma troca de MÓDULO, não um `if` em
 * runtime). É esse desenho que torna `VUUMBORA_MOCK_MODE_CANARY`, abaixo, um canário de CI que presta: se
 * aparecer no export de produção, o resolver não redirecionou — bug real, não falso positivo de branch morto.
 */
import type { MockLegalVersions } from '@vuumbora/api-client/identity';
import type { IdentityModeConfig } from './mode';

/**
 * Marcador ÚNICO deste arquivo — não é lido por nada em runtime, só existe para o CI confirmar, com um
 * grep no bundle de `preview`/`production`, que este arquivo não entrou. Não reutilize este valor em
 * nenhum outro lugar do código.
 */
export const VUUMBORA_MOCK_MODE_CANARY = 'vuumbora-identity-mock-mode-canary-f02';

/** Atraso artificial: dá para ver o estado "carregando" (e testar o duplo toque) sem API. */
const MOCK_LATENCY_MS = 350;

/**
 * Catálogo de versões dos Termos/Política DO MOCK, mutável de propósito (o mock o lê a cada chamada): a
 * revisão troca `terms`/`privacy` pelo gancho `__vuumboraIdentity` (`identityClient.ts`) para simular "o
 * jurídico publicou uma versão nova" (409 no cadastro, aceite pendente no `me`). NÃO é versão do app: a tela
 * nunca lê isto — ela recebe as versões do `identity.legalCurrent()` e envia ESSAS (`src/legal/legalModel.ts`).
 */
const mockLegal: MockLegalVersions = { terms: 'mock-1', privacy: 'mock-1' };

export function identityModeConfig(): IdentityModeConfig {
  // Referenciar o marcador garante que ele não seja cortado como "export não usado" por um tree-shaking
  // futuro — sem efeito em runtime além de um log de depuração, só em desenvolvimento.
  if (__DEV__) console.log(`[identity] modo mock ativo (${VUUMBORA_MOCK_MODE_CANARY})`);
  return { mode: 'mock', mock: { latencyMs: MOCK_LATENCY_MS, legal: mockLegal } };
}
