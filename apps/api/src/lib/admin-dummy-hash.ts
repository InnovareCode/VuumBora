/**
 * Hash descartável do boot do login do admin — ISOLADO de `admin-auth-service.ts` de propósito (achado Q7 da
 * passada 7 da Íris, `docs/veredito-iris-s1-passada-7.md`: mutante M8 sobrevivia).
 *
 * Antes, este hash nascia dentro de `admin-auth-service.ts`, que por isso tinha um motivo LEGÍTIMO para importar
 * `bcryptjs`. A rede estática (`test/bcrypt-static-scope.test.ts`) só varre QUAIS arquivos importam a biblioteca,
 * não cada chamada dentro deles — então um bypass do pool bem ali (comparar a senha com `bcrypt.compareSync`
 * direto, fora da pista de `lib/bcrypt-pool.ts`) não acrescentava import novo e passava pela rede sem ser
 * percebido. Isolado aqui, `admin-auth-service.ts` não tem mais NENHUM motivo para importar `bcryptjs`: qualquer
 * import novo da biblioteca ali É o bypass, e a rede estática o pega (ver `ALLOWED` do teste, que troca a entrada
 * do serviço por este arquivo).
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ADMIN_DUMMY_HASH_COST = 12;

/**
 * Hash válido, mas de uma senha aleatória que nunca autentica ninguém — gerado uma vez no load deste módulo
 * (síncrono, antes de aceitar requisição). Serve só para o `bcrypt.compare` do login do admin rodar com o MESMO
 * custo quando o e-mail não existe, para a resposta não ficar mensuravelmente mais rápida nesse caso (timing
 * attack de enumeração de e-mail).
 */
export const ADMIN_DUMMY_PASSWORD_HASH: string = bcrypt.hashSync(randomBytes(32).toString('hex'), ADMIN_DUMMY_HASH_COST);
