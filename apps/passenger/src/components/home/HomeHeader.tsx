import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Menu } from 'lucide-react-native';
import { BrandLogo, focusRingStyle, theme, useKeyboardFocusRing } from '@vuumbora/ui';

// Anel de foco de teclado (G-22): sem ele, o Chromium pintava o `outline: auto` escuro do navegador sobre o fundo
// escuro — foco invisível (medido por Tab + getComputedStyle na fatia G6).
const SIDE_FOCUS_RING = focusRingStyle('outside', theme.layout.touchTarget / 2);

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
      <HeaderIconButton onPress={onPressMenu} accessibilityLabel="Abrir menu">
        <Menu size={24} color={theme.role.textPrimary} strokeWidth={1.75} />
      </HeaderIconButton>
      <View style={styles.logoBox}>
        <BrandLogo size="sm" />
      </View>
      <HeaderIconButton
        onPress={onPressNotifications}
        accessibilityLabel={notificationCount > 0 ? `Notificações, ${notificationCount} não lidas` : 'Notificações'}
      >
        <Bell size={22} color={theme.role.textPrimary} strokeWidth={1.75} />
        {notificationCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
          </View>
        ) : null}
      </HeaderIconButton>
    </View>
  );
});

function HeaderIconButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  readonly onPress?: (() => void) | undefined;
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
}) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.sideTarget, focusVisible && SIDE_FOCUS_RING]}
    >
      {children}
    </Pressable>
  );
}

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
