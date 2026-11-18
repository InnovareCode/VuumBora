/**
 * Formas de pagamento de DEMONSTRAÇÃO — sem cadastro real de cartão/carteira ainda
 * (especificacoes/PASSAGEIRO.md: carteira depende de operação real). Sinalizado na
 * tela com `MockBadge` (feedback_marcar_dado_mock_visivelmente).
 */
export interface MockPaymentMethod {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export const MOCK_PAYMENT_METHODS: readonly MockPaymentMethod[] = [
  { id: 'pix', label: 'Pix', description: 'Pagamento instantâneo' },
  { id: 'credit-card', label: 'Cartão de crédito', description: 'Visa •••• 4242' },
  { id: 'cash', label: 'Dinheiro', description: 'Pagar direto ao motorista' },
];
