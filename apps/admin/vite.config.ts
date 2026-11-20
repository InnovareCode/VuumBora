import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// SPA simples, sem SSR: admin é painel atrás de login (ver docs/plano-sistema.md §3,
// "SSR não agrega em painel atrás de login").
export default defineConfig(({ command, mode }) => {
  // Mesma regra de `createApi()` (src/api/index.ts): só "http" é http, qualquer
  // outra coisa (ausente, "mock", typo) resolve para mock.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiMode = env['VITE_API_MODE'] === 'http' ? 'http' : 'mock';

  // Guarda de deploy (apontada pelo Órion): o default silencioso de
  // `VITE_API_MODE` é "mock", o que é certo em dev (a API de admin ainda não
  // está no ar) mas seria um deploy mudo em produção — ninguém notaria que
  // publicou a vitrine de dados fictícios. Só verifica em `vite build`;
  // `vite`/`vite preview` continuam livres para rodar em mock.
  const failBuildOnMockApi: PluginOption = {
    name: 'fail-build-on-mock-api',
    buildStart() {
      if (command === 'build' && apiMode === 'mock') {
        this.error(
          "Build de produção abortado: VITE_API_MODE resolveu para 'mock' (ausente ou diferente de 'http'). " +
            'Defina VITE_API_MODE=http e VITE_API_BASE_URL (ver .env.example) antes de publicar — nunca builde o admin em modo demonstração.',
        );
      }
    },
  };

  return {
    plugins: [react(), tailwindcss(), failBuildOnMockApi],
    server: {
      port: 4310,
    },
  };
});
