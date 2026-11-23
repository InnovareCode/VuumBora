import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Menu } from 'lucide-react-native';
import { BrandLogo, theme } from '@vuumbora/ui';

export interface HomeHeaderProps {
  readonly notificationCount?: number;
  readonly onPressNotifications?: () => void;
  readonly onPressMenu?: () => void;
}

/**
 * Cabeçalho da Home (PP-9/D-06, decidido: menu ☰ + logo + sino, sem barra de abas, conforme a
 * prancha de 22/11). A caixa da esquerda (☰) e a da direita (🔔) têm a MESMA largura
 * (`layout.touchTarget`), para a marca ficar centralizada de verdade — mesma técnica do
 * `ScreenHeader` (C-17), não só "perto do centro".
 */
export const HomeHeader = memo(function HomeHeader({ notificationCount = 0, onPressNotifications, onPressMenu }: HomeHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPressMenu}
        accessibilityRole="button"
        accessibilityLabel="Abrir menu"
        hitSlop={8}
        style={styles.sideTarget}
      >
        <Menu size={24} color={theme.role.textPrimary} strokeWidth={1.75} />
      </Pressable>
      <View style={styles.logoBox}>
        <BrandLogo size="sm" />
      </View>
      <Pressable
        onPress={onPressNotifications}
        accessibilityRole="button"
        accessibilityLabel={notificationCount > 0 ? `Notificações, ${notificationCount} não lidas` : 'Notificações'}
        hitSlop={8}
        style={styles.sideTarget}
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoBox: { flex: 1, alignItems: 'center' },
  sideTarget: {
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
