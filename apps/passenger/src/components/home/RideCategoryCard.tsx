import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Car, Check, Clock } from 'lucide-react-native';
import { theme, textStyle, tabularNums } from '@vuumbora/ui';

export interface RideCategoryCardProps {
  readonly name: string;
  /** Faixa de tempo estimada (ex.: "4–6 min") — DEMONSTRAÇÃO, sinalizada pelo chamador. */
  readonly etaLabel: string;
  /** Preço estimado (ex.: "R$ 23,90") — DEMONSTRAÇÃO, sinalizada pelo chamador. */
  readonly priceLabel: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

/** Categoria de veículo (Econômico/Comfort/Plus). Específico do passageiro — não é transversal. */
export const RideCategoryCard = memo(function RideCategoryCard({ name, etaLabel, priceLabel, selected, onPress }: RideCategoryCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}, estimativa ${etaLabel}, preço estimado ${priceLabel}${selected ? ', selecionado' : ''}`}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {selected ? (
        <View style={styles.checkBadge}>
          <Check size={13} color={theme.role.ctaText} strokeWidth={3} />
        </View>
      ) : null}
      <Car size={28} color={selected ? theme.role.ctaBackground : theme.role.textSecondary} strokeWidth={1.75} />
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      <View style={styles.etaRow}>
        <Clock size={12} color={theme.role.textMuted} strokeWidth={2} />
        <Text style={styles.eta} numberOfLines={1}>
          {etaLabel}
        </Text>
      </View>
      <Text style={styles.price} numberOfLines={1}>
        {priceLabel}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: theme.layout.touchTarget,
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.role.border,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['1'],
    alignItems: 'center',
    gap: 4,
  },
  cardSelected: { borderColor: theme.role.ctaBackground, backgroundColor: theme.role.surfaceElevated },
  checkBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.role.ctaBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption'), marginTop: 2, textAlign: 'center' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eta: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  price: { color: theme.role.textPrimary, ...textStyle('bold', 'small'), ...tabularNums },
});
