import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, textStyle } from '@vuumbora/ui';

export interface RouteSummaryRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly testID?: string;
}

/** Linha "Origem"/"Destino" do resumo da corrida (P06) — estático, sem ação de edição embutida. */
export const RouteSummaryRow = memo(function RouteSummaryRow({ icon, label, value, testID }: RouteSummaryRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['3'] },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  textBlock: { flex: 1 },
  label: { color: theme.role.textMuted, ...textStyle('semibold', 'caption') },
  value: { color: theme.role.textPrimary, ...textStyle('medium', 'body'), marginTop: 2 },
});
