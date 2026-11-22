/**
 * Contrato de MODO da identidade (F02/B4) + stub que o bundler NUNCA deveria realmente carregar.
 *
 * `identityClient.ts` importa `./mode`, mas o `metro.config.js` deste app intercepta esse pedido
 * específico (`resolver.resolveRequest`) e o REDIRECIONA, em tempo de build, para `./mode.mock` ou
 * `./mode.http` — nunca os dois. A escolha depende do perfil do ambiente REAL (`VUUMBORA_BUILD_PROFILE`/
 * `NODE_ENV`), e em `development` pode ser forçada com `VUUMBORA_IDENTITY=http` (variável do ambiente real,
 * nunca de `.env`, mesma regra do resto do perfil de build).
 *
 * Por que a troca é de MÓDULO, e não um `if (mode === 'mock')` dentro de um arquivo só: um `if` assim deixa
 * o código das DUAS pernas no bundle (o branch morto não evapora: `identity.mode` só se resolve em runtime,
 * então nenhum minificador consegue provar que uma delas é inalcançável e cortá-la). Com a troca de módulo,
 * o arquivo que perde NUNCA ENTRA no grafo de dependências do Metro — não é uma questão de minificação, é o
 * bundler nem tentar resolver aquele arquivo. Isso é o que permite ao `mode.mock.ts` (com `mockLegal`, a
 * latência simulada etc.) sumir de verdade de `preview`/`production`, e ao CI provar isso com um grep no
 * bundle exportado (ver `VUUMBORA_MOCK_MODE_CANARY` em `mode.mock.ts`).
 *
 * Este arquivo (`mode.ts`) existe só para o TypeScript e o editor terem o que resolver estaticamente — o
 * Metro NUNCA deveria realmente bundlar o corpo abaixo. Se a função rodar de verdade, o resolver do
 * `metro.config.js` não interceptou o pedido (bug de configuração) ou alguém importou este arquivo direto
 * em vez de `./mode`.
 */
import type { MockIdentityOptions } from '@vuumbora/api-client/identity';

export type IdentityModeConfig =
  | { readonly mode: 'http'; readonly baseUrl: string; readonly allowInsecureHttp?: boolean }
  | { readonly mode: 'mock'; readonly mock?: MockIdentityOptions };

export function identityModeConfig(): IdentityModeConfig {
  throw new Error(
    'src/identity/mode.ts foi carregado diretamente — o metro.config.js deveria ter redirecionado "./mode" ' +
      'para "./mode.http" ou "./mode.mock" antes de chegar aqui. Confira `resolveIdentityModeTarget` e o ' +
      '`resolver.resolveRequest` do metro.config.js deste app.',
  );
}
