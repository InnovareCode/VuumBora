import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, textStyle, tabularNums } from '@vuumbora/ui';

export interface ReceiptBreakdownRowProps {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
  readonly testID?: string;
}

/** Linha "rótulo — valor" do comprovante (P10). `emphasis` é usada só na linha de Total. */
export const ReceiptBreakdownRow = memo(function ReceiptBreakdownRow({ label, value, emphasis = false, testID }: ReceiptBreakdownRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.label, emphasis && styles.labelEmphasis]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, emphasis && styles.valueEmphasis]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  label: { flex: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  labelEmphasis: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  value: { color: theme.role.textPrimary, ...textStyle('medium', 'small'), ...tabularNums },
  valueEmphasis: { ...textStyle('bold', 'body'), ...tabularNums },
});
