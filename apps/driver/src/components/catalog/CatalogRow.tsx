import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { textStyle, theme } from '@vuumbora/ui';

export interface CatalogRowProps {
  readonly label: string;
  readonly children: ReactNode;
  /** Empilha vertical em vez de lado a lado — para componentes largos (inputs, cartões). */
  readonly stacked?: boolean;
}

/** Uma amostra rotulada dentro de uma `CatalogSection` (ex.: "Padrão", "Desabilitado"). */
export function CatalogRow({ label, children, stacked = false }: CatalogRowProps) {
  return (
    <View style={stacked ? styles.stackedRow : styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={stacked ? styles.stackedContent : styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: theme.spacing['4'], flexWrap: 'wrap' },
  stackedRow: { width: '100%', gap: theme.spacing['2'] },
  label: {
    color: theme.role.textMuted,
    ...textStyle('semibold', 'caption'),
    width: 110,
    flexShrink: 0,
  },
  content: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'], flexWrap: 'wrap' },
  stackedContent: { width: '100%', maxWidth: 360, flexShrink: 1, minWidth: 0 },
});
