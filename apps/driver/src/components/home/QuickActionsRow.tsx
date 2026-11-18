import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme, textStyle } from '@vuumbora/ui';

export interface QuickActionItem {
  readonly key: string;
  readonly label: string;
  readonly subtitle: string;
  readonly icon: ReactNode;
  readonly onPress?: () => void;
}

export interface QuickActionsRowProps {
  readonly items: readonly QuickActionItem[];
}

/** Três atalhos (Navegar, Histórico, Suporte) — ações de navegação, não dado fabricado (sem MockBadge). */
export const QuickActionsRow = memo(function QuickActionsRow({ items }: QuickActionsRowProps) {
  return (
    <View style={styles.row}>
      {items.map(({ key, label, subtitle, icon, onPress }) => (
        <Pressable
          key={key}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${subtitle}`}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.icon}>{icon}</View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  card: {
    flex: 1,
    minHeight: theme.layout.touchTarget,
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.role.border,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['1'],
    alignItems: 'center',
    gap: 4,
  },
  cardPressed: { backgroundColor: theme.role.surfaceElevated },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption') },
  subtitle: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
});
