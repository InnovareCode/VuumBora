import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { BrandLogo, theme } from '@vuumbora/ui';

export interface HomeHeaderProps {
  readonly notificationCount?: number;
  readonly onPressNotifications?: () => void;
}

/** Cabeçalho da Home: marca + sino de notificações (contagem é UI de navegação, não dado de negócio). */
export const HomeHeader = memo(function HomeHeader({ notificationCount = 0, onPressNotifications }: HomeHeaderProps) {
  return (
    <View style={styles.row}>
      <BrandLogo size="sm" />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
