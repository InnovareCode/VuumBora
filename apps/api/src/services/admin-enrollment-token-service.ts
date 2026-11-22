/**
 * Token de enrolamento do 2FA (fora de banda). Formato legível `ABCDE-FGHIJ-KLMNO-PQRST`
 * (100 bits). O bruto só existe quando é emitido — quem emite entrega ao admin por um canal
 * que não é a API (terminal do servidor, repassado em mãos). Os scripts em `scripts/`
 * repetem a MESMA regra de normalização + sha256 (são .mjs e não importam TS): mudou aqui, mude lá.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { insertEnrollmentToken } from '../repositories/admin-enrollment-token-repository.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const ENROLLMENT_TOKEN_DEFAULT_TTL_HOURS = 48;
/**
 * Token do PRIMEIRO ACESSO (F07, `admin-user-service.ts::createAdminUser`) — mesmo mecanismo (tabela, formato,
 * uso único), finalidade diferente: em vez de liberar o enrolamento do 2FA, libera a troca da senha inicial
 * (nenhum admin criado pelo painel nasce com senha que alguém conhece). TTL mais longo que o do 2FA: é entregue
 * pelo dono a uma pessoa que ainda não tem acesso nenhum ao sistema, por um canal fora de banda — convém dar mais
 * folga que as 48h pensadas para quem já tem conta e só precisa reenrolar o 2FA.
 */
export const ACCOUNT_ACTIVATION_TTL_HOURS = 24 * 7;

export function normalizeEnrollmentToken(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function hashEnrollmentToken(input: string): string {
  return createHash('sha256').update(normalizeEnrollmentToken(input)).digest('hex');
}

export function generateEnrollmentToken(): string {
  const chars = Array.from(randomBytes(20), (byte) => ALPHABET[byte % 32]).join('');
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5)).join('-');
}

export async function issueEnrollmentToken(pool: Pool, adminId: string, ttlHours = ENROLLMENT_TOKEN_DEFAULT_TTL_HOURS): Promise<{ token: string; expiresAt: Date }> {
  const token = generateEnrollmentToken();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await insertEnrollmentToken(pool, adminId, hashEnrollmentToken(token), expiresAt);
  return { token, expiresAt };
}
