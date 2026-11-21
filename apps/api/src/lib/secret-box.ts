/**
 * Cifra autenticada (AES-256-GCM) para segredos em repouso. Formato
 * `v1.<iv>.<tag>.<texto>` em base64url — o prefixo de versão deixa trocar
 * o algoritmo/chave depois sem adivinhar o que está gravado.
 *
 * `aad` amarra o texto cifrado ao dono (id do admin): copiar o segredo de
 * uma linha para outra não decifra.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export function parseEncryptionKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error('chave de cifra deve ter 32 bytes em base64');
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, key: Buffer, aad: string): string {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('formato de segredo cifrado desconhecido');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
