import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly rightSlot?: ReactNode;
  readonly testID?: string;
}

/** Cabeçalho padrão de tela: voltar (opcional) + título/subtítulo + slot de ação. */
export const ScreenHeader = memo(function ScreenHeader({ title, subtitle, onBack, rightSlot, testID }: ScreenHeaderProps) {
  return (
    <View style={styles.row} testID={testID}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.backButton} />
      )}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightSlot}>{rightSlot}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: theme.layout.touchTarget, gap: theme.spacing['2'] },
  backButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    color: theme.role.textPrimary,
    fontSize: theme.typography.size.heading,
    fontWeight: theme.typography.weight.semibold,
  },
  titleBlock: { flex: 1 },
  title: { color: theme.role.textPrimary, fontSize: theme.typography.size.title, fontWeight: theme.typography.weight.bold },
  subtitle: { color: theme.role.textSecondary, fontSize: theme.typography.size.small, marginTop: theme.spacing['1'] },
  rightSlot: { minWidth: theme.layout.touchTarget, alignItems: 'flex-end' },
});
