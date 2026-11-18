import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@vuumbora/tokens';
import { textStyle } from './typography';

export interface BottomTabBarItem {
  readonly key: string;
  readonly label: string;
  /** Ícone já resolvido pelo app (lib de ícone é decisão do app, não da `ui`). */
  readonly icon: (props: { readonly active: boolean; readonly color: string }) => ReactNode;
  /** Contagem de não-lidos (ex.: mensagens). Omitir quando não houver nada pendente. */
  readonly badgeCount?: number;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
}

export interface BottomTabBarProps {
  readonly items: readonly BottomTabBarItem[];
  readonly activeKey: string;
  readonly testID?: string;
}

/** Navegação inferior fixa de 4 abas (ou menos). Ícone é injetado pelo app consumidor. */
export const BottomTabBar = memo(function BottomTabBar({ items, activeKey, testID }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, theme.spacing['2']) }]} testID={testID}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const color = active ? theme.role.ctaBackground : theme.role.textMuted;
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            style={styles.tab}
          >
            <View style={styles.iconSlot}>
              {item.icon({ active, color })}
              {item.badgeCount && item.badgeCount > 0 ? (
                <View style={styles.badge} accessibilityLabel={`${item.badgeCount} não lidas`}>
                  <Text style={styles.badgeText}>{item.badgeCount > 9 ? '9+' : item.badgeCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {item.label}
            </Text>
            {active ? <View style={styles.activeMark} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    minHeight: theme.layout.bottomNavigationHeight,
    borderTopWidth: 1,
    // Direção de arte §4/§9 item 6: superfície translúcida (surface.tabBar) + sombra
    // para cima (elevation.3) + borda superior em edgeBottom (não edgeTop — a luz
    // vem do conteúdo acima, não da própria barra).
    borderTopColor: theme.role.edgeBottom,
    backgroundColor: theme.role.tabBarSurface,
    boxShadow: theme.elevation['3'],
    paddingTop: theme.spacing['2'],
  },
  tab: {
    flex: 1,
    minHeight: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconSlot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  label: textStyle('semibold', 'caption'),
  activeMark: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.role.ctaBackground,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: theme.role.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: theme.role.textPrimary, ...textStyle('bold', 'caption'), fontSize: 10, lineHeight: 12 },
});
