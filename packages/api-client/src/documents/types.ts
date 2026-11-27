/**
 * Tipos de DOCUMENTO DO MOTORISTA que o app do motorista e o painel veem iguais (M3, fatia K0 do
 * `docs/plano-m3-m4.md` §3). Mora num caminho neutro (nem `driver` nem `passenger`) porque o painel
 * (`./admin`) também usa; o app do motorista recebe tudo por `@vuumbora/api-client/driver`.
 *
 * Os estados (`VerificationStatus`, `DriverDocumentStatus`) e as regras puras moram em
 * `@vuumbora/domain/driver`.
 */
import type { DriverDocumentStatus } from '@vuumbora/domain/driver';

/**
 * Motivo de recusa, do catálogo fechado `document_rejection_reasons` (N2). `text` é o que o motorista
 * lê. A nota livre do revisor (`internalNote`) é interna e NUNCA sai para o app.
 */
export interface DocumentRejection {
  readonly code: string;
  readonly text: string;
}

/** O documento mais recente de um tipo, como o app do motorista vê. */
export interface DriverDocumentSummary {
  readonly id: string;
  readonly status: DriverDocumentStatus;
  /** Só em `rejected`. */
  readonly rejection?: DocumentRejection;
  /** `AAAA-MM-DD`, o último dia válido. Só em documento com validade, depois de aprovado. */
  readonly expiresOn?: string;
}

/**
 * Uma exigência da lista vigente (`document_requirements`, por cidade e versão: N1 — a lista é DADO).
 * A lista atual é provisória (mínimo federal + foto); a da STTU entra como versão nova, sem deploy.
 */
export interface DocumentRequirement {
  /** Código estável do tipo (ex.: `cnh`, `crlv`). O app não deve ter lista fixa destes códigos. */
  readonly typeCode: string;
  readonly label: string;
  readonly required: boolean;
  readonly hasExpiry: boolean;
  /** O documento mais recente deste tipo. Ausente = nunca enviado (ou só pediu a URL e não enviou). */
  readonly document?: DriverDocumentSummary;
}

/** Endereço da etapa 2. */
export interface DriverAddress {
  readonly street: string;
  readonly number: string;
  readonly complement?: string;
  readonly neighborhood: string;
  readonly city: string;
  /** UF com 2 letras maiúsculas (ex.: `RN`). */
  readonly state: string;
  /** CEP com 8 algarismos, sem traço. */
  readonly postalCode: string;
}

/** Categorias de CNH que dirigem carro. `A` sozinha (só moto) não existe aqui de propósito: é `400 invalid_body`. */
export type CnhCategory = 'B' | 'C' | 'D' | 'E' | 'AB' | 'AC' | 'AD' | 'AE';

export interface DriverCnh {
  readonly number: string;
  readonly category: CnhCategory;
  /** `AAAA-MM-DD`. */
  readonly expiresOn: string;
  /** "Exerce atividade remunerada" na CNH. Sem EAR: `422 cnh_without_ear` (Lei 12.587, art. 11-B). */
  readonly ear: boolean;
}

/** Veículo (`PUT /v1/driver/vehicle`). */
export interface DriverVehicleInput {
  /** Placa antiga ou Mercosul, com ou sem traço (`isValidPlate`, `@vuumbora/domain/driver`). */
  readonly plate: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number;
  readonly color: string;
}
