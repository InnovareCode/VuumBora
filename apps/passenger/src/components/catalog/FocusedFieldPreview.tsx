import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/ui';

export interface FocusedFieldPreviewProps {
  readonly label: string;
  readonly value: string;
}

/**
 * Amostra ESTÁTICA do anel de foco do campo (borda `ctaBackground`), só para o print —
 * foco é um estado real do navegador/SO; só um elemento da página pode estar focado de
 * verdade por vez. Reaproveita o visual exato de `InputCore` quando `focused === true`.
 */
export function FocusedFieldPreview({ label, value }: FocusedFieldPreviewProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: theme.role.textSecondary,
    fontSize: theme.typography.size.small,
    fontWeight: theme.typography.weight.semibold,
    marginBottom: theme.spacing['1'],
  },
  field: {
    minHeight: theme.layout.inputHeight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing['3'],
    justifyContent: 'center',
    backgroundColor: theme.role.input,
    borderWidth: 2,
    borderColor: theme.role.ctaBackground,
  },
  value: { color: theme.role.textPrimary, fontSize: theme.typography.size.body },
});
