/**
 * Balde de IP para limites de taxa (revisão S1 rodada 2, I-5d).
 *
 * Um endereço IPv4 é uma pessoa/conexão; um IPv6 de acesso doméstico ou de provedor recebe um /64
 * INTEIRO (2^64 endereços), então "um limite por IP" com o endereço completo não limita nada: o
 * atacante troca os últimos 64 bits a cada requisição. O balde de um IPv6 é o seu /64; o de um IPv4,
 * o próprio endereço; IPv4 mapeado em IPv6 (`::ffff:1.2.3.4`) volta a ser o IPv4.
 *
 * Usado na chave do limite por IP da identidade (HMAC do balde, nunca o IP em claro) e no `keyGenerator`
 * do `@fastify/rate-limit`. Endereço que não é IP válido devolve o texto como veio (balde próprio).
 *
 * Há também o balde GROSSO (`ipBucket48`, o /48 do IPv6) para o que protege recurso caro e escasso: a justiça da fila do
 * bcrypt e os limites por rota (revisão S1 rodada 3b, M-1). O limite global e os contadores do banco seguem no /64.
 */

function hex16(group: number): string {
  return group.toString(16).padStart(4, '0');
}

/** 8 grupos de 16 bits, ou `null` se não for um IPv6 bem formado. */
function expandIpv6(raw: string): number[] | null {
  const text = raw.split('%')[0]!; // remove o zone id (`fe80::1%eth0`)
  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    const pieces = part.split(':');
    for (const [index, piece] of pieces.entries()) {
      if (piece.includes('.')) {
        // IPv4 embutido só pode ser o último pedaço: vira dois grupos.
        const octets = piece.split('.').map(Number);
        if (index !== pieces.length - 1 || octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
        groups.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
        groups.push(parseInt(piece, 16));
      }
    }
    return groups;
  };

  const head = parseGroups(halves[0]!);
  const tail = halves.length === 2 ? parseGroups(halves[1]!) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

/** 16 bits por grupo: 4 grupos = /64, 3 grupos = /48. */
function bucketOf(ip: string, ipv6Groups: 3 | 4): string {
  const text = ip.trim();
  if (!text.includes(':')) return text; // IPv4 (ou lixo): o próprio endereço

  const groups = expandIpv6(text);
  if (!groups) return text;

  // ::ffff:a.b.c.d (IPv4 mapeado): é a conexão IPv4 de alguém, não um /64.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
  }
  return `${groups.slice(0, ipv6Groups).map(hex16).join(':')}::/${ipv6Groups * 16}`;
}

/** Balde de um IP: IPv4 = o endereço, IPv6 = o /64. */
export function ipBucket(ip: string): string {
  return bucketOf(ip, 4);
}

/**
 * Balde GROSSO (revisão S1 rodada 3b, M-1): IPv4 = o endereço, IPv6 = o /48. Um /48 gratuito (tunnel broker) dá 65 536
 * baldes /64 a partir de UMA máquina; com o /48 como chave, esse atacante volta a ser UM balde. Usado onde o que se
 * protege é um recurso caro e escasso (a fila do bcrypt e os limites por rota). O custo: quem divide um /48 (um provedor que
 * entrega /64 por assinante de um mesmo /48) divide também a cota; por isso o limite GLOBAL de 100 por minuto segue no /64.
 */
export function ipBucket48(ip: string): string {
  return bucketOf(ip, 3);
}

/** `keyGenerator` do limite GLOBAL do `@fastify/rate-limit`: um balde por conexão IPv4 e por /64 IPv6. */
export function rateLimitKey(request: { ip: string }): string {
  return ipBucket(request.ip);
}

/** `keyGenerator` dos limites POR ROTA (as que gastam recurso: cadastro, login, admin, formulários): IPv4 = o endereço, IPv6 = o /48. */
export function routeRateLimitKey(request: { ip: string }): string {
  return ipBucket48(request.ip);
}
