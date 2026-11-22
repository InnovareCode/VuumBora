import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { Inbox } from 'lucide-react-native';
import { textStyle } from './typography';

export interface EmptyStateIconProps {
  readonly size: number;
  readonly color: string;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  /** Ícone dentro da pastilha de 56 (§8: 32pt). Sem a prop, usa `Inbox` do lucide (C-09). */
  readonly icon?: (props: EmptyStateIconProps) => ReactNode;
  readonly testID?: string;
}

const ICON_SIZE = 32;

/** Vazio neutro (sem resultado, sem histórico) — distinto de `ErrorState`, que é falha. */
export const EmptyState = memo(function EmptyState({ title, description, action, icon, testID }: EmptyStateProps) {
  const color = theme.role.textMuted;
  return (
    <View style={styles.root} testID={testID} accessibilityRole="summary" accessibilityLabel={title}>
      <View style={styles.glyphCircle}>
        {icon ? icon({ size: ICON_SIZE, color }) : <Inbox size={ICON_SIZE} color={color} strokeWidth={1.75} />}
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
  title: {
    color: theme.role.textPrimary,
    ...textStyle('semibold', 'subtitle'),
    textAlign: 'center',
  },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  action: { marginTop: theme.spacing['3'], width: '100%' },
});
