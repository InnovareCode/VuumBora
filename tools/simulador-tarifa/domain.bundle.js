"use strict";
var VuumboraDomain = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/domain/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    TRIP_TRANSITIONS: () => TRIP_TRANSITIONS,
    calculateFare: () => calculateFare,
    canTransitionTrip: () => canTransitionTrip,
    cancelTrip: () => cancelTrip,
    isTripCancellable: () => isTripCancellable,
    resolvePlatformFeeTier: () => resolvePlatformFeeTier,
    splitFare: () => splitFare,
    toApproximatePlace: () => toApproximatePlace,
    toTripRange: () => toTripRange,
    transitionTrip: () => transitionTrip
  });

  // packages/domain/src/trip-lifecycle.ts
  var TRIP_TRANSITIONS = {
    requested: ["searching_driver", "cancelled"],
    searching_driver: ["driver_assigned", "cancelled", "failed"],
    driver_assigned: ["driver_en_route", "cancelled", "searching_driver"],
    driver_en_route: ["driver_arrived", "cancelled", "searching_driver"],
    driver_arrived: ["in_progress", "cancelled"],
    in_progress: ["completed"],
    completed: [],
    cancelled: [],
    failed: []
  };
  function canTransitionTrip(from, to) {
    return TRIP_TRANSITIONS[from].includes(to);
  }
  function transitionTrip(from, to) {
    if (!canTransitionTrip(from, to)) {
      return { ok: false, from, to, reason: `Transi\xE7\xE3o de corrida inv\xE1lida: "${from}" \u2192 "${to}".` };
    }
    return { ok: true, state: to };
  }
  var CANCELLABLE_FROM = {
    passenger: ["requested", "searching_driver", "driver_assigned", "driver_en_route", "driver_arrived"],
    admin: ["requested", "searching_driver", "driver_assigned", "driver_en_route", "driver_arrived"],
    system: ["requested", "searching_driver", "driver_assigned", "driver_en_route", "driver_arrived"],
    driver: ["driver_assigned", "driver_en_route", "driver_arrived"]
  };
  function isTripCancellable(from, actor) {
    return CANCELLABLE_FROM[actor].includes(from);
  }
  function cancelTrip(from, actor) {
    if (!isTripCancellable(from, actor)) {
      return { ok: false, from, to: "cancelled", reason: `"${actor}" n\xE3o pode cancelar a corrida em "${from}".` };
    }
    const backToSearch = actor === "driver" && from !== "driver_arrived";
    return transitionTrip(from, backToSearch ? "searching_driver" : "cancelled");
  }

  // packages/domain/src/geo.ts
  var APPROX_DECIMALS = 2;
  function round(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
  function toApproximatePlace(place) {
    var _a;
    return {
      neighborhood: (_a = place.neighborhood) != null ? _a : "Bairro n\xE3o informado",
      approximatePoint: {
        latitude: round(place.point.latitude, APPROX_DECIMALS),
        longitude: round(place.point.longitude, APPROX_DECIMALS)
      }
    };
  }
  var TRIP_DISTANCE_RANGE_STEP_M = 1e3;
  var TRIP_DURATION_RANGE_STEP_S = 300;
  function toRange(value, step) {
    const min = Math.max(0, Math.floor(value / step) * step);
    return { min, max: min + step };
  }
  function toTripRange(distanceM, durationS) {
    return {
      distanceM: toRange(distanceM, TRIP_DISTANCE_RANGE_STEP_M),
      durationS: toRange(durationS, TRIP_DURATION_RANGE_STEP_S)
    };
  }

  // packages/domain/src/fare.ts
  function assertFinitePositive(value, label) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} precisa ser um n\xFAmero finito e n\xE3o-negativo (recebido: ${value})`);
    }
  }
  function calculateFare(rates, input) {
    assertFinitePositive(rates.baseCents, "baseCents");
    assertFinitePositive(rates.perKmCents, "perKmCents");
    assertFinitePositive(rates.perMinuteCents, "perMinuteCents");
    assertFinitePositive(rates.minimumFareCents, "minimumFareCents");
    assertFinitePositive(input.distanceKm, "distanceKm");
    assertFinitePositive(input.durationMinutes, "durationMinutes");
    if (!Number.isFinite(input.dynamicMultiplier) || input.dynamicMultiplier < 1) {
      throw new RangeError(
        `dynamicMultiplier precisa ser um n\xFAmero finito e >= 1 (recebido: ${input.dynamicMultiplier})`
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
      totalCents
    };
  }
  function resolvePlatformFeeTier(tiers, standing) {
    let best;
    for (const tier of tiers) {
      const qualifies = standing.daysActive >= tier.minDaysActive && standing.completedTrips >= tier.minCompletedTrips && standing.rating >= tier.minRating;
      if (!qualifies) continue;
      if (best === void 0 || tier.feePercent < best.feePercent) {
        best = tier;
      }
    }
    if (best === void 0) {
      throw new RangeError(
        "Nenhuma faixa de taxa da plataforma se aplica a este motorista \u2014 inclua uma faixa-base com minDaysActive=0, minCompletedTrips=0 e minRating=0."
      );
    }
    return best;
  }
  function splitFare(totalCents, platformFeePercent) {
    assertFinitePositive(totalCents, "totalCents");
    if (!Number.isFinite(platformFeePercent) || platformFeePercent < 0 || platformFeePercent > 100) {
      throw new RangeError(`platformFeePercent precisa estar entre 0 e 100 (recebido: ${platformFeePercent})`);
    }
    const platformCents = Math.round(totalCents * (platformFeePercent / 100));
    const driverPayoutCents = totalCents - platformCents;
    return { totalCents, platformFeePercent, platformCents, driverPayoutCents };
  }
  return __toCommonJS(index_exports);
})();
