/**
 * SHA-256 dos bytes, em hexadecimal minúsculo, pelo `expo-crypto` (nativo no iOS/Android; `crypto.subtle` no web, que
 * só existe em origem segura — fora dela rejeita, e `fetchVerifiedText` devolve `hash_unavailable`).
 *
 * Fino de propósito: a conversão para hexadecimal (`bytesToHex`) e a comparação ficam em `verifiedText.ts`, provadas por
 * unidade com vetores conhecidos. Este arquivo só liga o `expo-crypto`, que não roda sob `node --import tsx`.
 */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { bytesToHex } from './verifiedText';

export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await digest(CryptoDigestAlgorithm.SHA256, bytes));
}
