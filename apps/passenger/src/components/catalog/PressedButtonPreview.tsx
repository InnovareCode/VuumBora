import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/ui';

export type PressedButtonVariant = 'primary' | 'secondary' | 'danger';

export interface PressedButtonPreviewProps {
  readonly variant: PressedButtonVariant;
  readonly label: string;
}

/**
 * Amostra ESTÁTICA do visual "pressionado" dos botões, só para o print do catálogo —
 * pressionado é um estado de interação real (`Pressable`), não dá pra "ligar" ele parado
 * na tela. Reaproveita exatamente as cores que `ButtonCore` usa nesse estado.
 */
export function PressedButtonPreview({ variant, label }: PressedButtonPreviewProps) {
  const visual =
    variant === 'primary'
      ? { background: theme.role.ctaBackgroundPressed, text: theme.role.ctaText, borderWidth: 0 }
      : variant === 'secondary'
        ? { background: theme.role.surface, text: theme.role.textPrimary, borderWidth: 1.5 }
        : { background: theme.role.dangerFill, text: theme.role.textPrimary, borderWidth: 0, opacity: 0.85 };

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: visual.background,
          borderColor: theme.role.borderControl,
          borderWidth: visual.borderWidth,
          opacity: 'opacity' in visual ? visual.opacity : 1,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.label, { color: visual.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing['6'],
  },
  label: { fontSize: theme.typography.size.body, fontWeight: theme.typography.weight.semibold },
});
