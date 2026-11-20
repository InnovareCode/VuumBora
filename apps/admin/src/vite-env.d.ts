/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem da API real. Ex.: "http://localhost:3000". Sem valor, o modo "http" não funciona. */
  readonly VITE_API_BASE_URL?: string;
  /**
   * "http" (padrão) ou "mock". Nunca cai em mock por falha de rede — é escolha
   * explícita de build/ambiente (ver src/api/index.ts e docs/plano-sistema.md §15).
   */
  readonly VITE_API_MODE?: 'http' | 'mock';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
