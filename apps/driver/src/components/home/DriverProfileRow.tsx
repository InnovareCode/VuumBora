import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Car, Star } from 'lucide-react-native';
import { Avatar, MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface DriverProfileRowProps {
  /** Nome exibido — dado de DEMONSTRAÇÃO enquanto não há sessão autenticada real. */
  readonly driverName: string;
  /** Cadastro/documentação aprovados (MOTORISTA.md M04). Controla o selo abaixo. */
  readonly approved: boolean;
  readonly avatarUri?: string;
}

/**
 * Avatar + nome + selo de motorista. O selo (ícone de carro sobre círculo amarelo,
 * sobreposto ao avatar) só aparece quando `approved` é `true` — reflete a regra de
 * domínio ("não permitir online antes de cadastro e documentação aprovados"), não é
 * só decoração do mockup.
 */
export const DriverProfileRow = memo(function DriverProfileRow({ driverName, approved, avatarUri }: DriverProfileRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.avatarSlot}>
        {avatarUri ? <Avatar name={driverName} imageUri={avatarUri} size="md" /> : <Avatar name={driverName} size="md" />}
        {approved ? (
          <View style={styles.verifiedBadge} accessibilityRole="image" accessibilityLabel="Cadastro de motorista aprovado">
            <Car size={13} color={theme.role.ctaText} strokeWidth={2.25} />
          </View>
        ) : null}
      </View>
      <View style={styles.textBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {driverName}
          </Text>
          <MockBadge label="nome de exemplo" />
        </View>
        <View style={styles.roleRow}>
          <Star size={14} color={theme.role.ctaBackground} strokeWidth={2} />
          <Text style={styles.role}>Motorista VuumBora</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  avatarSlot: { position: 'relative' },
  verifiedBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.role.ctaBackground,
    borderWidth: 2,
    borderColor: theme.role.screen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'], flexWrap: 'wrap' },
  name: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  role: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
