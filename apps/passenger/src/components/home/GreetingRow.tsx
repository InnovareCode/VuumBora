import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { User } from 'lucide-react-native';
import { Avatar, MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface GreetingRowProps {
  /** Nome exibido — dado de DEMONSTRAÇÃO enquanto não há sessão autenticada real. */
  readonly passengerName: string;
  readonly avatarUri?: string;
}

/** Avatar + saudação da Home. O nome ainda não vem de uma sessão real — ver `MockBadge`. */
export const GreetingRow = memo(function GreetingRow({ passengerName, avatarUri }: GreetingRowProps) {
  return (
    <View style={styles.row}>
      {avatarUri ? <Avatar name={passengerName} imageUri={avatarUri} size="md" /> : <Avatar name={passengerName} size="md" />}
      <View style={styles.textBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.greeting} numberOfLines={1}>
            Olá, {passengerName}!
          </Text>
          <MockBadge label="nome de exemplo" />
        </View>
        <View style={styles.roleRow}>
          <User size={14} color={theme.role.ctaBackground} strokeWidth={2} />
          <Text style={styles.role}>Passageira VuumBora</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  textBlock: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'], flexWrap: 'wrap' },
  greeting: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  role: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
