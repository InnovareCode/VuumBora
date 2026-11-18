import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { glyphStyle, textStyle } from './typography';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly testID?: string;
}

/** Vazio neutro (sem resultado, sem histórico) — distinto de `ErrorState`, que é falha. */
export const EmptyState = memo(function EmptyState({ title, description, action, testID }: EmptyStateProps) {
  return (
    <View style={styles.root} testID={testID} accessibilityRole="summary" accessibilityLabel={title}>
      <View style={styles.glyphCircle}>
        <Text style={styles.glyph}>○</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center', padding: theme.spacing['7'], gap: theme.spacing['2'] },
  glyphCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing['2'],
  },
  // Glifo (○): fonte do sistema de propósito — ver nota em typography.ts.
  glyph: { color: theme.role.textMuted, ...glyphStyle(theme.typography.weight.regular, 'title') },
  title: {
    color: theme.role.textPrimary,
    ...textStyle('semibold', 'subtitle'),
    textAlign: 'center',
  },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  action: { marginTop: theme.spacing['3'], width: '100%' },
});
