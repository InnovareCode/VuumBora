/**
 * Gerador do código de embarque (D-12) dos MOCKS de corrida. Neutro de perfil (mora em `trip/`)
 * porque os dois mocks criam corrida: o do passageiro no `request`, o do motorista no `offer`
 * quando a corrida ainda não tem código.
 *
 * **Só para o mock.** O código de verdade nasce no servidor (S4), com gerador criptográfico
 * (`crypto.randomInt` do Node). Aqui o código não protege nada real, e o mock roda no app (Hermes)
 * sem `crypto` garantido: usa `crypto.getRandomValues` quando existe e cai em `Math.random` quando
 * não existe. É o oposto da regra de `identity/installation-id.ts` (lá não há reserva, porque o id
 * vai para o servidor de verdade), e de propósito.
 *
 * Teste que precisa de valor conhecido injeta `nextPickupCode` nas opções do mock, ou chama
 * `control.setPickupCode` do motorista.
 */
import { isPickupCodeFormat, PICKUP_CODE_LENGTH } from '@vuumbora/domain';

const CODE_SPACE = 10 ** PICKUP_CODE_LENGTH;

/** Um código novo, uniforme em `0000`–`9999`. */
export function randomPickupCode(): string {
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: <T extends ArrayBufferView>(array: T) => T } }).crypto;
  let n: number;
  if (cryptoApi?.getRandomValues) {
    // 2^32 não é múltiplo de 10.000: descarta o resto do topo para não puxar os códigos baixos.
    const limit = Math.floor(0x1_0000_0000 / CODE_SPACE) * CODE_SPACE;
    const buffer = new Uint32Array(1);
    do {
      cryptoApi.getRandomValues(buffer);
    } while ((buffer[0] ?? limit) >= limit);
    n = (buffer[0] ?? 0) % CODE_SPACE;
  } else {
    n = Math.floor(Math.random() * CODE_SPACE);
  }
  return String(n).padStart(PICKUP_CODE_LENGTH, '0');
}

/**
 * Chama o gerador e confere o formato. Gerador injetado que devolve código fora do formato é erro
 * de quem configurou o teste, e falha alto aqui, na criação da corrida, em vez de virar um `start`
 * que nunca passa.
 */
export function generatePickupCode(next: () => string): string {
  const code = next();
  if (!isPickupCodeFormat(code)) {
    throw new TypeError(`nextPickupCode devolveu um código fora do formato (${PICKUP_CODE_LENGTH} algarismos): ${JSON.stringify(code)}`);
  }
  return code;
}
