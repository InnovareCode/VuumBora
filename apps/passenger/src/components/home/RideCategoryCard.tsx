import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Car, Check, Clock } from 'lucide-react-native';
import { SurfaceRaised, VehicleIllustration, theme, textStyle, tabularNums, type VehicleIllustrationVariant } from '@vuumbora/ui';

// Direção de arte §4/§9 item 4: halo do card selecionado. `boxShadow` com cor é a
// única forma de um glow colorido no RN (elevation/shadow* nativo não aceita cor no
// Android) — ver nota de validação em ButtonCore.tsx (mesma pendência de prova em Android).
const SELECTED_GLOW = theme.glow.selected;

// Direção de arte §6/§9 item 5: abaixo de 375pt, 3 cards lado a lado não cabem com
// legibilidade ("Vuum Econômico" quebra em 2 linhas) — vira lista vertical (1 card por
// linha, ícone ao lado do texto, padrão P05). Item 8 (pedido nesta sessão): a partir de
// 360pt o card mostra a ilustração do veículo em vez do ícone genérico — vale tanto na
// grade (sempre ≥375, logo sempre com ilustração) quanto na lista (zona 360–374pt).
const LIST_BREAKPOINT = 375;
const VEHICLE_ART_BREAKPOINT = 360;

export interface RideCategoryCardProps {
  readonly name: string;
  readonly vehicleVariant: VehicleIllustrationVariant;
  /** Faixa de tempo estimada (ex.: "4–6 min") — DEMONSTRAÇÃO, sinalizada pelo chamador. */
  readonly etaLabel: string;
  /** Preço estimado (ex.: "R$ 23,90") — DEMONSTRAÇÃO, sinalizada pelo chamador. */
  readonly priceLabel: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

/** Categoria de veículo (Econômico/Comfort/Plus). Específico do passageiro — não é transversal. */
export const RideCategoryCard = memo(function RideCategoryCard({
  name,
  vehicleVariant,
  etaLabel,
  priceLabel,
  selected,
  onPress,
}: RideCategoryCardProps) {
  const { width } = useWindowDimensions();
  const list = width < LIST_BREAKPOINT;
  const showVehicleArt = width >= VEHICLE_ART_BREAKPOINT;

  const accessibilityLabel = `${name}, estimativa ${etaLabel}, preço estimado ${priceLabel}${selected ? ', selecionado' : ''}`;

  const art = showVehicleArt ? (
    <VehicleIllustration variant={vehicleVariant} width={list ? 88 : 72} />
  ) : (
    <View style={styles.iconBox}>
      <Car size={24} color={selected ? theme.role.ctaBackground : theme.role.textSecondary} strokeWidth={1.75} />
    </View>
  );

  if (list) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel}
      >
        <SurfaceRaised style={[styles.listCard, selected && styles.cardSelected, selected && { boxShadow: SELECTED_GLOW }]}>
          {art}
          <View style={styles.listTextBlock}>
            <Text style={[styles.name, styles.nameListAlign]} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.etaRow}>
              <Clock size={12} color={theme.role.textMuted} strokeWidth={2} />
              <Text style={styles.eta} numberOfLines={1}>
                {etaLabel}
              </Text>
            </View>
          </View>
          <View style={styles.listTrailing}>
            <Text style={styles.price} numberOfLines={1}>
              {priceLabel}
            </Text>
            {selected ? (
              <View style={styles.checkBadgeInline}>
                <Check size={13} color={theme.role.ctaText} strokeWidth={3} />
              </View>
            ) : null}
          </View>
        </SurfaceRaised>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel} style={styles.pressable}>
      <SurfaceRaised style={[styles.card, selected && styles.cardSelected, selected && { boxShadow: SELECTED_GLOW }]}>
        {selected ? (
          <View style={styles.checkBadge}>
            <Check size={13} color={theme.role.ctaText} strokeWidth={3} />
          </View>
        ) : null}
        {art}
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
      </SurfaceRaised>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  card: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    // Borda iluminada de cima (direção de arte §4/§9 item 2).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['1'],
    alignItems: 'center',
    gap: 4,
  },
  // Lista vertical (< 375pt, direção de arte §6/§9 item 5): 1 card por linha, ilustração/
  // ícone à esquerda, texto ao centro (flex:1), preço + selo de selecionado à direita.
  listCard: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingVertical: theme.spacing['2'],
    paddingHorizontal: theme.spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
  },
  // Selecionado: borda 2pt amarela (item 4) + halo (`boxShadow`, aplicado inline).
  // Fundo continua `gradient.surface.raised` (SurfaceRaised é opaco; backgroundColor
  // aqui não apareceria por baixo do gradiente).
  cardSelected: {
    borderWidth: 2,
    borderTopColor: theme.role.ctaBackground,
    borderColor: theme.role.ctaBackground,
  },
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
  checkBadgeInline: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.role.ctaBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  // Caixa de ícone 48pt (direção de arte §6, "padrão P05") — substitui a ilustração do
  // veículo abaixo de 360pt, onde ela não cabe com legibilidade.
  iconBox: {
    width: theme.spacing['9'],
    height: theme.spacing['9'],
    borderRadius: theme.radius.md,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextBlock: { flex: 1, gap: 2 },
  listTrailing: { alignItems: 'flex-end', gap: 2 },
  name: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption'), marginTop: 2, textAlign: 'center' },
  nameListAlign: { textAlign: 'left', marginTop: 0 },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eta: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  price: { color: theme.role.textPrimary, ...textStyle('bold', 'small'), ...tabularNums },
});
