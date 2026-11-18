/**
 * Motorista atribuído de DEMONSTRAÇÃO (P08/P09) — sem `DriverMatchingPort` real
 * implementado ainda (pendência da Vega: o backend que de fato encontra e atribui um
 * motorista). Formato é PROVISÓRIO, não é contrato de backend: nome, nota, veículo e
 * placa aqui só preenchem a tela com algo plausível, sinalizado por `MockBadge` nas telas
 * que o consomem.
 */
export interface AssignedDriverInfo {
  readonly name: string;
  readonly rating: number;
  readonly vehicleModel: string;
  readonly vehicleColor: string;
  readonly plate: string;
  readonly photoUri?: string;
}

export const MOCK_ASSIGNED_DRIVER: AssignedDriverInfo = {
  name: 'Roberto Silva',
  rating: 4.8,
  vehicleModel: 'Chevrolet Onix',
  vehicleColor: 'Branco',
  plate: 'NTL4F27',
};
