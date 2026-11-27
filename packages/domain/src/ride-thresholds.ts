/**
 * Prazos e distâncias de produto da corrida, num lugar só (decisão do Atlas em 23/11/2026 para a onda 4,
 * `docs/fichas-de-tela/README.md`, "Prazos de produto"). O dono pode mudar qualquer um aqui sem mexer em tela.
 *
 * Distâncias dependem de GPS de verdade: até o S4, as telas só as usam com posição simulada.
 */

/** P07: depois disto a busca mostra o aviso de busca demorada. */
export const SLOW_DRIVER_SEARCH_SECONDS = 2 * 60;

/** M07: a esta distância do embarque o motorista vê "chegando" e pode marcar que chegou. */
export const PICKUP_PROXIMITY_METERS = 200;

/** M09: finalizar a até esta distância do destino não pede confirmação extra. */
export const DESTINATION_PROXIMITY_METERS = 500;

/**
 * M08: espera mínima no local antes do "passageiro não apareceu". Sem taxa de cancelamento no lançamento
 * (decisão 15 do dono, 22/11/2026): a opção não gera cobrança.
 */
export const PASSENGER_NO_SHOW_WAIT_SECONDS = 5 * 60;
