/**
 * Trava de SSRF para o host SMTP digitado no painel. O host é entrada do
 * usuário: sem isto, "enviar e-mail de teste" vira varredura da rede interna
 * (loopback, rede privada do Easypanel/Docker, metadados de nuvem em
 * 169.254.169.254).
 *
 * Resolve o nome UMA vez e devolve o IP aprovado — quem conecta usa esse IP
 * (não o nome), então um DNS que muda entre a checagem e a conexão
 * (rebinding) não escapa. Todo endereço do nome precisa ser público.
 */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
const V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "esta rede"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT (inclui metadados da Alibaba, 100.100.100.200)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (metadados AWS/GCP/Azure)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado + broadcast
];
for (const [net, prefix] of V4) blocked.addSubnet(net, prefix, 'ipv4');
const V6: ReadonlyArray<readonly [string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // ULA (inclui fd00:ec2::254, metadados AWS em IPv6)
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96], // NAT64: embute um IPv4 arbitrário
  ['100::', 64],
];
for (const [net, prefix] of V6) blocked.addSubnet(net, prefix, 'ipv6');

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // não é IP: nunca aprova
  // IPv4 dentro de IPv6 (::ffff:10.0.0.1) cai nas regras IPv4 do BlockList.
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export class BlockedHostError extends Error {
  constructor() {
    super('host SMTP bloqueado: aponta para rede interna ou endereço reservado');
    this.name = 'BlockedHostError';
  }
}

export class UnresolvableHostError extends Error {
  constructor() {
    super('host SMTP não resolve');
    this.name = 'UnresolvableHostError';
  }
}

/** Resolve `host` e devolve um IP público. `allowPrivate` (flag de dev) pula só a checagem de faixa. */
export async function resolveSafeHost(host: string, allowPrivate: boolean): Promise<string> {
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    } catch {
      throw new UnresolvableHostError();
    }
  }
  const first = addresses[0];
  if (!first) throw new UnresolvableHostError();
  if (!allowPrivate && addresses.some(isBlockedAddress)) throw new BlockedHostError();
  return first;
}
