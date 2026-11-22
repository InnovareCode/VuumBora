import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { CircleAlert } from 'lucide-react-native';
import { SecondaryButton } from './SecondaryButton';
import { textStyle } from './typography';

export interface ErrorStateIconProps {
  readonly size: number;
  readonly color: string;
}

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  /** Ícone dentro da pastilha de 56 (§8: 32pt). Sem a prop, usa `CircleAlert` do lucide (C-09). */
  readonly icon?: (props: ErrorStateIconProps) => ReactNode;
  readonly testID?: string;
}

const ICON_SIZE = 32;

/** Falha (API, rede, carregamento) — `accessibilityRole="alert"` para leitores de tela. */
export const ErrorState = memo(function ErrorState({
  title = 'Algo deu errado',
  description,
  onRetry,
  retryLabel = 'Tentar novamente',
  icon,
  testID,
}: ErrorStateProps) {
  const color = theme.role.danger;
  return (
    <View
      style={styles.root}
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={`${title}${description ? `. ${description}` : ''}`}
    >
      <View style={styles.glyphCircle}>
        {icon ? icon({ size: ICON_SIZE, color }) : <CircleAlert size={ICON_SIZE} color={color} strokeWidth={1.75} />}
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
  title: {
    color: theme.role.textPrimary,
    ...textStyle('semibold', 'subtitle'),
    textAlign: 'center',
  },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  action: { marginTop: theme.spacing['3'], width: '100%' },
});
