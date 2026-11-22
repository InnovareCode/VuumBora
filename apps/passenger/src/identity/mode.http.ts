/**
 * Modo `http` (F02/B4): `preview` e `production` SEMPRE caem aqui (resolver do `metro.config.js`);
 * `development` cai aqui só com `VUUMBORA_IDENTITY=http` no ambiente real. Fala com a API de verdade
 * (`docs/contrato-identidade-apps.md`). Ver `./mode.ts` para o porquê da troca ser de módulo, não de `if`.
 */
import type { IdentityModeConfig } from './mode';

/**
 * `EXPO_PUBLIC_API_URL` ausente é erro de configuração do perfil (desenvolvimento: `.env` deste app; preview/
 * produção: ambiente do perfil no EAS), não um estado válido do app — falha alto e explícito em vez do erro
 * genérico "mode http exige baseUrl" do pacote.
 */
function requiredApiBaseUrl(): string {
  const url = process.env['EXPO_PUBLIC_API_URL'];
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error(
      'EXPO_PUBLIC_API_URL não está definida. Em desenvolvimento, copie apps/passenger/.env.example para .env e preencha ' +
        '(ex.: http://localhost:3101); em preview/produção, defina-a (https) no ambiente do perfil no EAS.',
    );
  }
  return url;
}

export function identityModeConfig(): IdentityModeConfig {
  return {
    mode: 'http',
    baseUrl: requiredApiBaseUrl(),
    // SÓ desenvolvimento: `baseUrl` http: é recusado na montagem sem isto (B-8d). Preview/produção ficam com
    // `false` (o padrão do pacote) e a build já abortou antes se `EXPO_PUBLIC_API_URL` não fosse https
    // (`metro.config.js`, `assertApiUrlIsHttps`).
    allowInsecureHttp: __DEV__,
  };
}
