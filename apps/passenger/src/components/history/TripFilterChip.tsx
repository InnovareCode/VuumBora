import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme, textStyle } from '@vuumbora/ui';

export interface TripFilterChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** Pílula de filtro (Todas/Mês atual/Anteriores, P11) — seleção única, estilo tab. */
export const TripFilterChip = memo(function TripFilterChip({ label, selected, onPress, testID }: TripFilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
    >
      {({ pressed }) => (
        <View style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected, pressed && styles.chipPressed]}>
          <Text style={[styles.label, selected ? styles.labelSelected : styles.labelUnselected]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
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
