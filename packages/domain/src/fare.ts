/**
 * Cálculo de tarifa — módulo puro, pensado para servir dois consumidores:
 * 1. O simulador de tarifa do dono (`tools/simulador-tarifa`), para calibrar a decisão 7
 *    (`docs/decisoes-do-dono.md`, "Decisões do dono em 22/11/2026 (noite)" §Tarifa e gateway;
 *    `docs/plano-mestre.md` §6.1 linha 7).
 * 2. A cotação real do M4 (`docs/plano-sistema.md` §6.4), quando a decisão 7 estiver fechada —
 *    por isso a validação é estrita (lança, não clampa em silêncio): um valor negativo é sempre
 *    bug de quem chama, nunca dado válido de corrida.
 *
 * Dinheiro em centavos inteiros (mesma convenção de `Money`, ver `./index`). Nenhum valor aqui é
 * recomendação de preço — os números de exemplo vivem só no simulador, marcados como EXEMPLO.
 */

/** Tarifa de uma categoria: os componentes que a decisão 7 pede, todos em centavos. */
export interface FareRates {
  /** Tarifa base (a "bandeirada"), cobrada uma vez por corrida. */
  readonly baseCents: number;
  /** Valor por quilômetro rodado. */
  readonly perKmCents: number;
  /** Valor por minuto de duração. */
  readonly perMinuteCents: number;
  /** Preço mínimo da corrida — nunca cobra menos que isso, mesmo em trajeto muito curto. */
  readonly minimumFareCents: number;
}

export interface FareInput {
  /** Distância do trajeto, em quilômetros. Nunca negativa. */
  readonly distanceKm: number;
  /** Duração do trajeto, em minutos. Nunca negativa. */
  readonly durationMinutes: number;
  /**
   * Multiplicador de dinâmica (horário de pico, alta demanda). `1` é tarifa normal; valores acima
   * de `1` encarecem a corrida. Nunca menor que `1` — dinâmica não existe para baratear.
   */
  readonly dynamicMultiplier: number;
}

/**
 * Detalhamento do cálculo, componente a componente — é o que a decisão 7 exige para ser
 * auditável linha a linha (`docs/plano-sistema.md` §6.4) e o que o simulador mostra ao dono.
 */
export interface FareBreakdown {
  readonly baseCents: number;
  readonly distanceCents: number;
  readonly durationCents: number;
  /** Soma dos três componentes acima, ANTES da dinâmica. */
  readonly subtotalCents: number;
  /** `subtotalCents` multiplicado pela dinâmica, já arredondado. */
  readonly dynamicCents: number;
  /** `true` quando o preço mínimo "segurou" o preço (ou seja, `dynamicCents < minimumFareCents`). */
  readonly minimumApplied: boolean;
  /** Preço final da corrida, em centavos: `max(dynamicCents, minimumFareCents)`. */
  readonly totalCents: number;
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} precisa ser um número finito e não-negativo (recebido: ${value})`);
  }
}

/**
 * Calcula o preço de uma corrida a partir das tarifas da categoria e do trajeto.
 *
 * Cada componente (base, distância, duração) é arredondado antes de somar — é o que o
 * detalhamento mostra ao dono, então o total precisa fechar com a soma visível das linhas, não
 * com uma conta "por baixo" que daria um centavo de diferença.
 */
export function calculateFare(rates: FareRates, input: FareInput): FareBreakdown {
  assertFinitePositive(rates.baseCents, 'baseCents');
  assertFinitePositive(rates.perKmCents, 'perKmCents');
  assertFinitePositive(rates.perMinuteCents, 'perMinuteCents');
  assertFinitePositive(rates.minimumFareCents, 'minimumFareCents');
  assertFinitePositive(input.distanceKm, 'distanceKm');
  assertFinitePositive(input.durationMinutes, 'durationMinutes');
  if (!Number.isFinite(input.dynamicMultiplier) || input.dynamicMultiplier < 1) {
    throw new RangeError(
      `dynamicMultiplier precisa ser um número finito e >= 1 (recebido: ${input.dynamicMultiplier})`,
    );
  }

  const baseCents = Math.round(rates.baseCents);
  const distanceCents = Math.round(rates.perKmCents * input.distanceKm);
  const durationCents = Math.round(rates.perMinuteCents * input.durationMinutes);
  const subtotalCents = baseCents + distanceCents + durationCents;
  const dynamicCents = Math.round(subtotalCents * input.dynamicMultiplier);
  const minimumFareCents = Math.round(rates.minimumFareCents);
  const totalCents = Math.max(dynamicCents, minimumFareCents);

  return {
    baseCents,
    distanceCents,
    durationCents,
    subtotalCents,
    dynamicCents,
    minimumApplied: dynamicCents < minimumFareCents,
    totalCents,
  };
}

/**
 * Uma faixa da taxa da plataforma (decisão 3 de `docs/decisoes-do-dono.md`, "Decisões do dono —
 * 22/11/2026 (manhã)"/22/11 noite: taxa entre 20% e 25%, por tempo de plataforma, corridas
 * concluídas e nota). Os cortes exatos (quantos dias, quantas corridas, qual nota) ainda não
 * foram fechados pelo dono — por isso o simulador recebe as faixas como entrada ajustável, nunca
 * como constante fixa neste módulo.
 */
export interface PlatformFeeTier {
  readonly id: string;
  readonly label: string;
  /** Percentual retido pela plataforma, de 0 a 100 (ex.: `22.5` = 22,5%). */
  readonly feePercent: number;
  /** Critérios mínimos para esta faixa — os TRÊS precisam ser atendidos ao mesmo tempo. */
  readonly minDaysActive: number;
  readonly minCompletedTrips: number;
  readonly minRating: number;
}

/** Situação de um motorista no momento em que a taxa é calculada. */
export interface DriverStanding {
  readonly daysActive: number;
  readonly completedTrips: number;
  readonly rating: number;
}

/**
 * Resolve qual faixa de taxa vale para um motorista: entre as faixas cujos TRÊS critérios são
 * atendidos, escolhe a de MENOR `feePercent` (a melhor para o motorista — "quanto melhor o
 * motorista, menor a taxa", leitura do Atlas em `docs/decisoes-do-dono.md` ainda não confirmada
 * pelo dono).
 *
 * Exige que ao menos uma faixa de `tiers` tenha os três limites em `0` (a faixa-base, para
 * motorista novo) — sem isso um motorista abaixo de todo limite não se encaixa em nenhuma faixa,
 * e esta função lança em vez de silenciosamente inventar uma taxa.
 */
export function resolvePlatformFeeTier(
  tiers: readonly PlatformFeeTier[],
  standing: DriverStanding,
): PlatformFeeTier {
  let best: PlatformFeeTier | undefined;
  for (const tier of tiers) {
    const qualifies =
      standing.daysActive >= tier.minDaysActive &&
      standing.completedTrips >= tier.minCompletedTrips &&
      standing.rating >= tier.minRating;
    if (!qualifies) continue;
    if (best === undefined || tier.feePercent < best.feePercent) {
      best = tier;
    }
  }
  if (best === undefined) {
    throw new RangeError(
      'Nenhuma faixa de taxa da plataforma se aplica a este motorista — inclua uma faixa-base com ' +
        'minDaysActive=0, minCompletedTrips=0 e minRating=0.',
    );
  }
  return best;
}

/** Como o preço de uma corrida se divide entre plataforma e motorista. */
export interface FareSplit {
  readonly totalCents: number;
  readonly platformFeePercent: number;
  readonly platformCents: number;
  readonly driverPayoutCents: number;
}

/**
 * Divide o preço total entre a taxa da plataforma e o repasse ao motorista.
 *
 * `platformCents` é arredondado e `driverPayoutCents` é o RESTO (`total - platform`), nunca um
 * segundo arredondamento independente — garante que as duas partes somem exatamente o total, sem
 * sobrar nem faltar um centavo por conta de arredondamento duplicado.
 */
export function splitFare(totalCents: number, platformFeePercent: number): FareSplit {
  assertFinitePositive(totalCents, 'totalCents');
  if (!Number.isFinite(platformFeePercent) || platformFeePercent < 0 || platformFeePercent > 100) {
    throw new RangeError(`platformFeePercent precisa estar entre 0 e 100 (recebido: ${platformFeePercent})`);
  }
  const platformCents = Math.round(totalCents * (platformFeePercent / 100));
  const driverPayoutCents = totalCents - platformCents;
  return { totalCents, platformFeePercent, platformCents, driverPayoutCents };
}
