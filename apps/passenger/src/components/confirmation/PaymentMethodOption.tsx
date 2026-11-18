import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme, textStyle } from '@vuumbora/ui';

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
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.optionPressed]}
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
    </Pressable>
  );
});

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.layout.touchTarget,
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.role.border,
    paddingHorizontal: theme.spacing['4'],
    paddingVertical: theme.spacing['3'],
    gap: theme.spacing['3'],
  },
  optionSelected: { borderColor: theme.role.ctaBackground, backgroundColor: theme.role.surfaceElevated },
  optionPressed: { backgroundColor: theme.role.surfaceElevated },
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
