import { StyleSheet, Text, View } from 'react-native';
import { textStyle, theme, withAlpha } from '@vuumbora/ui';

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
      ? { background: theme.role.ctaBackgroundPressed, text: theme.role.ctaText, borderColor: 'transparent', borderWidth: 0 }
      : variant === 'secondary'
        ? { background: theme.role.surface, text: theme.role.textPrimary, borderColor: theme.role.borderControl, borderWidth: 1.5 }
        : {
            // Danger agora é contorno (direção de arte §3.1) — "pressionado" só escurece
            // com opacity, igual ao `ButtonCore` real (não tem fundo próprio por estado).
            background: withAlpha(theme.role.dangerFill, 0.1),
            text: theme.role.danger,
            borderColor: theme.role.dangerFill,
            borderWidth: 1.5,
            opacity: 0.85,
          };

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: visual.background,
          borderColor: visual.borderColor,
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
  label: textStyle('semibold', 'body'),
});
