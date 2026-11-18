import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, textStyle } from '@vuumbora/ui';

export interface TripDetailRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly testID?: string;
}

/**
 * Linha "rótulo — valor" do comprovante (P11, `/historico-detalhe`). Parecida com
 * `RouteSummaryRow` (confirmation/P06), mas SEM limite de linhas no valor: endereço
 * completo de destino (ex.: "Shopping Central, Av. Senador Salgado Filho, 2234 -
 * Candelária, Natal - RN") truncava com reticências em `numberOfLines={2}` — medido
 * no navegador, violava "zero texto informativo truncado". Componente próprio em vez
 * de reaproveitar `RouteSummaryRow` para não arriscar mexer num componente que
 * `confirmacao.tsx` (tela "em uso") também consome.
 */
export const TripDetailRow = memo(function TripDetailRow({ icon, label, value, testID }: TripDetailRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
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
