import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { SecondaryButton } from './SecondaryButton';
import { glyphStyle, textStyle } from './typography';

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly testID?: string;
}

/** Falha (API, rede, carregamento) — `accessibilityRole="alert"` para leitores de tela. */
export const ErrorState = memo(function ErrorState({
  title = 'Algo deu errado',
  description,
  onRetry,
  retryLabel = 'Tentar novamente',
  testID,
}: ErrorStateProps) {
  return (
    <View
      style={styles.root}
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={`${title}${description ? `. ${description}` : ''}`}
    >
      <View style={styles.glyphCircle}>
        <Text style={styles.glyph}>✕</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {onRetry ? (
        <View style={styles.action}>
          <SecondaryButton label={retryLabel} onPress={onRetry} />
        </View>
      ) : null}
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
    borderWidth: 1.5,
    borderColor: theme.role.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing['2'],
  },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  glyph: { color: theme.role.danger, ...glyphStyle(theme.typography.weight.bold, 'title') },
  title: {
    color: theme.role.textPrimary,
    ...textStyle('semibold', 'subtitle'),
    textAlign: 'center',
  },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  action: { marginTop: theme.spacing['3'], width: '100%' },
});
