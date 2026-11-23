import { Car, Package, PawPrint, UserRound, type LucideIcon } from 'lucide-react-native';
import type { VehicleIllustrationVariant } from '@vuumbora/ui';
import type { RideCategoryKey } from '../../data/rideCategoryDisplay';

/**
 * Como cada categoria CONHECIDA aparece no card (P05): as duas que são o próprio veículo mostram
 * a ilustração do carro; as demais, só o símbolo. Movido de `(app)/index.tsx` (onda 2) para aqui
 * na onda 3 — a Home não mostra mais categoria nenhuma (PP-2), então o helper pertence à tela que
 * de fato as lista agora. F08b continua valendo: isto é só APARÊNCIA — quais categorias existem
 * vem da cotação (`quoteCategories` da store), nunca desta lista; uma categoria que a cotação
 * devolver e não estiver aqui cai no ícone genérico (`DEFAULT_CATEGORY_ICON`), sem quebrar a tela.
 */
const CATEGORY_VISUALS: Partial<Record<RideCategoryKey, { readonly icon: LucideIcon; readonly vehicleVariant?: VehicleIllustrationVariant }>> = {
  vuumbora: { icon: Car, vehicleVariant: 'economico' },
  conforto: { icon: Car, vehicleVariant: 'comfort' },
  motorista_mulher: { icon: UserRound },
  entrega: { icon: Package },
  pet: { icon: PawPrint },
};
const DEFAULT_CATEGORY_ICON: LucideIcon = Car;

export function categoryVisual(categoryId: string): { readonly icon: LucideIcon; readonly vehicleVariant?: VehicleIllustrationVariant } {
  return CATEGORY_VISUALS[categoryId as RideCategoryKey] ?? { icon: DEFAULT_CATEGORY_ICON };
}
