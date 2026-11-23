import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Car } from 'lucide-react-native';
import { SurfaceRaised, theme, textStyle, tabularNums, focusRingStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface DriverTripRowProps {
  readonly timeLabel: string;
  readonly routeLabel: string;
  /** Já formatado ("R$ 18,90") ou "—" quando a corrida terminou sem ganho (cancelada, decisão 15 em aberto). */
  readonly amountLabel: string;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * Linha do histórico do motorista (M12, 64pt): pastilha 40 com carro `textSecondary` (substituto
 * LOCAL do `VehicleIconBox`/C-11, que ainda não existe em `packages/ui` — pedido de componente
 * registrado na ficha, nunca construído porque é mudança de DS fora da zona desta fatia) + hora à
 * esquerda / valor à direita (ambos tabulares, D-36: nada de carro nem valor amarelo) + bairro→bairro
 * embaixo, em `textSecondary`.
 */
export const DriverTripRow = memo(function DriverTripRow({
  timeLabel,
  routeLabel,
  amountLabel,
  onPress,
  accessibilityLabel,
  testID,
}: DriverTripRowProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={focusVisible ? FOCUS_RING : undefined}
      testID={testID}
    >
      {({ pressed }) => (
        <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Car size={20} color={theme.role.textSecondary} strokeWidth={1.75} />
            </View>
            <View style={styles.content}>
              <View style={styles.topRow}>
                <Text style={styles.time} numberOfLines={1}>
                  {timeLabel}
                </Text>
                <Text style={styles.amount} numberOfLines={1}>
                  {amountLabel}
                </Text>
              </View>
              <Text style={styles.route} numberOfLines={1}>
                {routeLabel}
              </Text>
            </View>
          </View>
        </SurfaceRaised>
      )}
    </Pressable>
  );
});

const FOCUS_RING = focusRingStyle('outside', theme.radius.lg);

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['3'],
  },
  cardPressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: theme.spacing['2'] },
  time: { flex: 1, color: theme.role.textSecondary, ...textStyle('medium', 'small'), ...tabularNums },
  amount: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), ...tabularNums },
  route: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
