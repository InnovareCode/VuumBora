import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { BrandLogo, theme } from '@vuumbora/ui';

export interface DriverHeaderProps {
  readonly notificationCount?: number;
  readonly onPressNotifications?: () => void;
}

/**
 * Cabeçalho da Home do motorista: marca CENTRALIZADA no topo + sino de notificações
 * à direita (referência motorista-home-alvo.webp item 3 — antes a marca ficava
 * alinhada à esquerda). O sino fica numa `View` ABSOLUTA à direita (não mais
 * irmão em `justify-content: space-between`) para a logo centralizar de verdade em
 * relação à largura da tela, não à metade do espaço que sobra do sino.
 */
export const DriverHeader = memo(function DriverHeader({ notificationCount = 0, onPressNotifications }: DriverHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.logoSlot} pointerEvents="none">
        <BrandLogo variant="horizontal" size="sm" />
      </View>
      <Pressable
        onPress={onPressNotifications}
        accessibilityRole="button"
        accessibilityLabel={notificationCount > 0 ? `Notificações, ${notificationCount} não lidas` : 'Notificações'}
        hitSlop={8}
        style={styles.bellTarget}
      >
        <Bell size={22} color={theme.role.textPrimary} strokeWidth={1.75} />
        {notificationCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: theme.layout.touchTarget },
  logoSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bellTarget: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: theme.role.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: theme.role.textPrimary, fontSize: 10, lineHeight: 12, fontWeight: theme.typography.weight.bold },
});
