/**
 * Declarações mínimas de globais que o código-fonte de `@vuumbora/api-client/identity` referencia (`window`,
 * `document` em `client.ts`; o tipo `Crypto` em `installation-id.ts`) e que este app NÃO tem: o `tsconfig.json`
 * do passageiro usa `lib: ["ES2022"]` sem DOM de propósito, para o typecheck pegar uso de DOM em código nativo.
 *
 * Isto é um desvio local, não a solução: o certo é o próprio pacote declarar o que usa (ex.: `/// <reference
 * lib="dom" />` nos dois arquivos, ou um `.d.ts` dele), porque o app do motorista (B2) vai bater no mesmo erro.
 * Quando o pacote fizer isso, apague este arquivo. Só `unknown`/o mínimo: não dá acesso tipado ao DOM às telas.
 */
declare const window: unknown;
declare const document: unknown;

interface Crypto {
  randomUUID(): string;
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}
