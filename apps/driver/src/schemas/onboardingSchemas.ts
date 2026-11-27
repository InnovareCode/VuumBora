import { z } from 'zod';
import { brazilianDateToIso } from '@vuumbora/ui';
import { isValidCpf } from '@vuumbora/domain';
import { isValidPlate } from '@vuumbora/domain/driver';

/**
 * Validação de FORMATO da etapa 2 (M02) e do veículo — espelha o `400 invalid_body` do contrato
 * (`DriverOnboardingPort.saveOnboarding`/`saveVehicle`, K0) para não haver ida e volta à toa com o que o próprio
 * aparelho já vê. O que é REGRA (CPF de verdade no servidor, CNH sem EAR, placa em uso, idade do veículo) quem decide é
 * o servidor, e cada recusa tem texto próprio em `src/onboarding/onboardingErrors.ts`. `isValidCpf`/`isValidPlate` são
 * as MESMAS funções puras que o servidor usa (`@vuumbora/domain`).
 */

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** CPF com a máscara 000.000.000-00 enquanto digita (só exibição). */
export function maskCpf(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** CEP com a máscara 00000-000 (só exibição). */
export function maskPostalCode(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 8);
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function onlyDigits(raw: string, max: number): string {
  return digitsOnly(raw).slice(0, max);
}

/** Placa em maiúsculas, sem espaço; aceita traço da placa antiga (só exibição). */
export function maskPlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
}

/** Categorias de CNH que dirigem carro (o contrato recusa `A` sozinha: só moto). */
export const CNH_CATEGORIES = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;

function brazilianDate(requiredMessage: string) {
  return z
    .string()
    .min(1, requiredMessage)
    .refine((value) => brazilianDateToIso(value) !== null, 'Data inválida. Use dia/mês/ano, por exemplo 15/05/1990.');
}

/** `true` se quem nasceu em `iso` (AAAA-MM-DD) tem 18 anos completos hoje — a mesma régua do servidor na etapa 2. */
export function isAdultOn(iso: string, today: Date = new Date()): boolean {
  const year = today.getFullYear() - 18;
  const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const limit = `${year}-${monthDay === '02-29' && !leap ? '02-28' : monthDay}`;
  return iso <= limit;
}

function text(requiredMessage: string, max: number) {
  return z.string().trim().min(1, requiredMessage).max(max, `Use no máximo ${max} caracteres.`);
}

export const driverProfileSchema = z.object({
  cpf: z
    .string()
    .min(1, 'Informe seu CPF.')
    .refine((value) => digitsOnly(value).length === 11, 'O CPF tem 11 números.')
    .refine((value) => isValidCpf(value), 'CPF inválido. Confira os 11 números.'),
  birthDate: brazilianDate('Informe sua data de nascimento.').refine((value) => {
    const iso = brazilianDateToIso(value);
    return iso === null || isAdultOn(iso);
  }, 'É preciso ter 18 anos ou mais.'),
  cnhNumber: z
    .string()
    .min(1, 'Informe o número da CNH.')
    .refine((value) => /^\d{11}$/.test(value), 'O número da CNH tem 11 algarismos (campo "Nº registro").'),
  cnhCategory: z
    .string()
    .trim()
    .min(1, 'Informe a categoria da CNH.')
    .refine(
      (value) => (CNH_CATEGORIES as readonly string[]).includes(value.toUpperCase().replace(/\s/g, '')),
      'Categoria que dirige carro: B, C, D, E, AB, AC, AD ou AE.',
    ),
  cnhExpiresOn: brazilianDate('Informe a validade da CNH.'),
  cnhEar: z.boolean(),
  postalCode: z
    .string()
    .min(1, 'Informe o CEP.')
    .refine((value) => digitsOnly(value).length === 8, 'O CEP tem 8 números.'),
  street: text('Informe a rua.', 120),
  number: text('Informe o número (ou "s/n").', 20),
  complement: z.string().trim().max(60, 'Use no máximo 60 caracteres.'),
  neighborhood: text('Informe o bairro.', 80),
  city: text('Informe a cidade.', 80),
  state: z
    .string()
    .trim()
    .min(1, 'Informe a UF.')
    .refine((value) => /^[A-Za-z]{2}$/.test(value), 'Use a sigla do estado, com 2 letras (ex.: RN).'),
});
export type DriverProfileFormValues = z.infer<typeof driverProfileSchema>;

export function vehicleSchema(currentYear: number) {
  return z.object({
    plate: z
      .string()
      .min(1, 'Informe a placa.')
      .refine((value) => isValidPlate(value), 'Placa inválida. Use o formato ABC1D23 (Mercosul) ou ABC-1234.'),
    brand: text('Informe a marca.', 40),
    model: text('Informe o modelo.', 60),
    year: z
      .string()
      .min(1, 'Informe o ano do veículo.')
      .refine((value) => /^\d{4}$/.test(value), 'Use o ano com 4 números.')
      .refine((value) => {
        const year = Number(value);
        return year >= 1950 && year <= currentYear + 1;
      }, `Ano fora do intervalo aceito (1950 a ${currentYear + 1}).`),
    color: text('Informe a cor.', 30),
  });
}
export type VehicleFormValues = z.infer<ReturnType<typeof vehicleSchema>>;
