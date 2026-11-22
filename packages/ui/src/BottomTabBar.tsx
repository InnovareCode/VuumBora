import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@vuumbora/tokens';
import { textStyle } from './typography';
import { FOCUS_RING_WIDTH, useKeyboardFocusRing } from './useFocusRing';

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
      {items.map((item) => (
        <TabButton key={item.key} item={item} active={item.key === activeKey} />
      ))}
    </View>
  );
});

// Anel de foco da aba: um contorno 2pt DENTRO da caixa, recuado 2pt da borda, desenhado por uma camada própria por CIMA de
// tudo (último filho). Não é o `outline` do `Pressable` como nos outros alvos, por duas coisas que moram nas bordas da aba e
// que um contorno do próprio `Pressable` não cobre: a marca amarela da aba ATIVA (3pt colada na base, mesma cor do anel) e o
// contador de não-lidas (círculo vermelho no canto de cima). Por baixo deles o anel sumia nesses trechos (medido: 64% e 88% da
// borda); por cima, e recuado, é contínuo. Dentro da caixa, e não fora: as abas dividem a largura toda e a barra encosta na base.
const FOCUS_INSET = 2;
const FOCUS_RING_LAYER = {
  position: 'absolute',
  top: FOCUS_INSET,
  right: FOCUS_INSET,
  bottom: FOCUS_INSET,
  left: FOCUS_INSET,
  borderWidth: FOCUS_RING_WIDTH,
  borderColor: theme.role.ctaBackground,
  borderRadius: theme.radius.md,
  pointerEvents: 'none',
} as const;
// A camada substitui o contorno padrão do navegador (que ficaria por baixo dela, em dobro, no Chromium). Largura 0, e não
// `outlineStyle: 'none'`, que o tipo de estilo do RN não aceita.
const NO_BROWSER_OUTLINE = { outlineStyle: 'solid', outlineWidth: 0 } as const;

interface TabButtonProps {
  readonly item: BottomTabBarItem;
  readonly active: boolean;
}

/** Uma aba. Componente à parte: cada uma tem o próprio estado de foco de teclado, e trocar o foco não renderiza as outras. */
const TabButton = memo(function TabButton({ item, active }: TabButtonProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  const color = active ? theme.role.ctaBackground : theme.role.textMuted;
  return (
    <Pressable
      {...focusProps}
      onPress={item.onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      style={[styles.tab, focusVisible && NO_BROWSER_OUTLINE]}
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
      {focusVisible ? <View style={FOCUS_RING_LAYER} /> : null}
    </Pressable>
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
