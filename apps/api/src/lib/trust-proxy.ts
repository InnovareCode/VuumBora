/**
 * Interpreta `TRUST_PROXY`. O Fastify aceita `true` ("confie em todo salto"),
 * e com `true` o `request.ip` vira a entrada MAIS À ESQUERDA do
 * `X-Forwarded-For` — que é a que o próprio cliente escreve. Resultado: todo
 * rate limit por IP e o IP da auditoria passam a ser forjáveis (achado A-1 da
 * revisão S1). Por isso este módulo NUNCA devolve `true`:
 *
 *  - ausente ou `true`  -> 1 salto (o proxy de borda do Easypanel/Traefik).
 *                          `true` é aceito só porque é o valor que já está
 *                          publicado; vira 1 salto, não "confie em tudo".
 *  - `false` ou `0`      -> não confia em nenhum proxy (IP = socket).
 *  - inteiro 1..10       -> número de proxies à frente da API (ex.: 2 com CDN).
 *  - lista de IP/CIDR    -> só esses proxies são confiáveis (`10.0.0.0/8,172.16.0.0/12`).
 */
import { isIP } from 'node:net';

/** Mesma assinatura de `TrustProxyFunction` do Fastify: `hop` 0 é o vizinho direto (o socket). */
export type TrustProxyHops = (address: string, hop: number) => boolean;

export type TrustProxySetting = false | TrustProxyHops | string[];

/** Confia nos `hops` primeiros saltos (o Fastify tipa só boolean/string/lista/função, mas o comportamento é este). */
function trustHops(hops: number): TrustProxyHops {
  return (_address, hop) => hop < hops;
}

const MAX_HOPS = 10;

function isIpOrCidr(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || !address) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

/** Lança `Error` com mensagem curta (sem ecoar o valor) quando o formato é inválido. */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? '').trim();
  if (value === '' || value.toLowerCase() === 'true') return trustHops(1);
  if (value.toLowerCase() === 'false' || value === '0') return false;

  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops < 1 || hops > MAX_HOPS) throw new Error(`TRUST_PROXY: número de saltos deve ficar entre 1 e ${MAX_HOPS}`);
    return trustHops(hops);
  }

  const entries = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (entries.length === 0 || !entries.every(isIpOrCidr)) {
    throw new Error('TRUST_PROXY: use false, um número de saltos (ex.: 1) ou uma lista de IP/CIDR separada por vírgula');
  }
  return entries;
}
