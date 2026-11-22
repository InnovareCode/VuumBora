import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { MockBadge } from './MockBadge';
import { textStyle } from './typography';

export interface SectionHeaderProps {
  readonly title: string;
  /** Ação opcional à direita do título (ex.: `LinkButton` "Ver tudo"). */
  readonly action?: ReactNode;
  /** `true`: mostra o `MockBadge` EMBAIXO do título (nunca na mesma linha — regra abaixo). */
  readonly mock?: boolean;
  readonly mockLabel?: string;
  readonly testID?: string;
}

/**
 * Título de seção + ação opcional + selo de mock EMBAIXO (C-07, `docs/padrao-premium-telas.md`
 * §15): a regra "selo nunca na linha do título" era violada em `destino.tsx` e
 * `confirmacao.tsx` (selo ao lado do título). Este componente torna a regra impossível de
 * quebrar — não existe prop para colocar o `MockBadge` ao lado.
 */
export const SectionHeader = memo(function SectionHeader({ title, action, mock = false, mockLabel, testID }: SectionHeaderProps) {
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.row}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {mock ? (
        <View style={styles.mockRow}>
          <MockBadge {...(mockLabel !== undefined ? { label: mockLabel } : null)} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['2'] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['3'] },
  title: { flex: 1, color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  action: { flexShrink: 0 },
  mockRow: { flexDirection: 'row' },
});
