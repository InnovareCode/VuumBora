/**
 * Código de embarque (plano D-12). **Decisão do dono em 22/11/2026** (`docs/decisoes-do-dono.md`,
 * "Decisões do dono em 22/11/2026 (noite)"): PIN em TODAS as categorias. O passageiro diz o código
 * ao motorista, e a corrida só passa de `driver_arrived` para `in_progress` com ele.
 *
 * Mora na raiz do domínio (não em `./passenger` nem `./driver`) pelo mesmo motivo de
 * `trip-lifecycle.ts`: as duas pontas precisam da MESMA regra. O passageiro MOSTRA o código, o
 * motorista DIGITA o código, e o servidor confere os dois com o mesmo formato. Aqui só mora a
 * REGRA (formato e quando o passageiro vê). O valor nunca mora aqui, e quem gera é o servidor
 * (no S4, com gerador criptográfico), nunca o app.
 *
 * **Formato:** exatamente 4 algarismos ASCII (`0`–`9`), como texto. Zero à esquerda vale ("0482"),
 * por isso nunca é número. Sem espaço, sem traço, sem normalização: o app envia só os algarismos
 * (o `CodeInput` da M08 já filtra). 4 dígitos é o que as fichas P08 e M08 desenharam. Com as 5
 * tentativas por corrida e motorista antes do `429`, a chance de acertar no chute é 5 em 10.000.
 */
import type { TripStatus } from './index';

/** Quantidade de algarismos do código de embarque. */
export const PICKUP_CODE_LENGTH = 4;

const PICKUP_CODE_PATTERN = /^[0-9]{4}$/;

/**
 * `true` só para texto com exatamente {@link PICKUP_CODE_LENGTH} algarismos ASCII. Recebe
 * `unknown` de propósito: é a validação de entrada do `start` do motorista, e o corpo da
 * requisição não é confiável (pode faltar, vir número, vir com espaço).
 */
export function isPickupCodeFormat(value: unknown): value is string {
  return typeof value === 'string' && PICKUP_CODE_PATTERN.test(value);
}

/**
 * Fases em que o PASSAGEIRO vê o código: motorista atribuído, a caminho ou já no local. Antes
 * disso não há a quem dizer o código. Em `in_progress` ele já cumpriu o papel, e nas fases
 * terminais também: o código some, e o histórico nunca o guarda (minimização, PP-14).
 *
 * O MOTORISTA não vê o código em fase nenhuma (achado da conferência da Nova sobre a F08,
 * `docs/contratos/conferencia-f08-nova.md`, item (2)): ele PEDE o código ao passageiro, e é isso
 * que prova que o passageiro entrou no carro certo.
 */
export const PICKUP_CODE_VISIBLE_STATUSES: ReadonlySet<TripStatus> = new Set<TripStatus>([
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
]);

/** O snapshot do passageiro leva o código nesta fase? */
export function isPickupCodeVisible(status: TripStatus): boolean {
  return PICKUP_CODE_VISIBLE_STATUSES.has(status);
}
