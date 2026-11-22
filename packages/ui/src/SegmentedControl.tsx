import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
}

export interface SegmentedControlProps {
  readonly options: readonly SegmentedControlOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Pílulas de filtro/período (C-16, `docs/padrao-premium-telas.md` §15/§18.1 item 3) — a
 * ativa em amarelo cheio com texto navy, único "bloco" amarelo permitido além do CTA
 * (seleção de um controle segmentado, §2). Promovido de
 * `apps/passenger/src/components/history/TripFilterChip.tsx` — Histórico (dos dois apps)
 * e Ganhos usam o mesmo controle.
 */
export const SegmentedControl = memo(function SegmentedControl({ options, value, onChange, accessibilityLabel, testID }: SegmentedControlProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} testID={testID}>
      {options.map((option) => (
        <SegmentedItem
          key={option.value}
          option={option}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
});

interface SegmentedItemProps {
  readonly option: SegmentedControlOption;
  readonly selected: boolean;
  readonly onPress: () => void;
}

// Hook de foco por item, fora do `.map` (bug_webkit_foco_invisivel_em_pressable_anel_compartilhado:
// "Hook não pode ficar dentro de .map" — os chips do passageiro eram um dos casos "ainda aberto").
const SegmentedItem = memo(function SegmentedItem({ option, selected, onPress }: SegmentedItemProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      style={focusVisible ? FOCUS_RING : undefined}
    >
      {({ pressed }) => (
        <View style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected, pressed && styles.chipPressed]}>
          <Text style={[styles.label, selected ? styles.labelSelected : styles.labelUnselected]} numberOfLines={1}>
            {option.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const FOCUS_RING = focusRingStyle('outside', theme.radius.pill);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  chip: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing['4'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: theme.role.ctaBackground, borderColor: theme.role.ctaBackground },
  chipUnselected: { backgroundColor: 'transparent', borderColor: theme.role.borderControl },
  chipPressed: { opacity: 0.85 },
  label: textStyle('semibold', 'small'),
  labelSelected: { color: theme.role.ctaText },
  labelUnselected: { color: theme.role.textSecondary },
});
