import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { SurfaceRaised, theme, textStyle } from '@vuumbora/ui';

// Direção de arte §4/§9 item 4 — mesmo halo do card de categoria (RideCategoryCard).
const SELECTED_GLOW = theme.glow.selected;

export interface PaymentMethodOptionProps {
  readonly label: string;
  readonly description: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** Opção de forma de pagamento (P06) — seleção única, estilo radio-card. */
export const PaymentMethodOption = memo(function PaymentMethodOption({
  label,
  description,
  selected,
  onPress,
  testID,
}: PaymentMethodOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${label}, ${description}${selected ? ', selecionado' : ''}`}
      testID={testID}
    >
      {({ pressed }) => (
        <SurfaceRaised
          style={[styles.option, selected && styles.optionSelected, selected && { boxShadow: SELECTED_GLOW }, pressed && styles.optionPressed]}
        >
          <View style={styles.textBlock}>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.description} numberOfLines={1}>
              {description}
            </Text>
          </View>
          <View style={[styles.radio, selected && styles.radioSelected]}>
            {selected ? <Check size={14} color={theme.role.ctaText} strokeWidth={3} /> : null}
          </View>
        </SurfaceRaised>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    // Borda iluminada de cima (direção de arte §4/§9 item 2). Fundo: item 6
    // (`gradient.surface.raised`, ver SurfaceRaised).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingHorizontal: theme.spacing['4'],
    paddingVertical: theme.spacing['3'],
    gap: theme.spacing['3'],
  },
  // Selecionado: borda 2pt amarela (item 4) + halo (`boxShadow`, aplicado inline).
  optionSelected: {
    borderWidth: 2,
    borderTopColor: theme.role.ctaBackground,
    borderColor: theme.role.ctaBackground,
  },
  optionPressed: { opacity: 0.85 },
  textBlock: { flex: 1 },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.role.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: theme.role.ctaBackground, backgroundColor: theme.role.ctaBackground },
});
