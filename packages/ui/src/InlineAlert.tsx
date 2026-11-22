/**
 * InlineAlert — aviso DENTRO da tela (formulário, passo de fluxo), com texto, glifo e, se preciso, ações.
 * Cor nunca é o único sinal: cada tom tem glifo próprio (✕ ! i ✓) e o texto diz o que houve.
 *
 * Anúncio para leitor de tela, por plataforma (nenhuma depende de a pessoa já estar olhando o aviso):
 *  - web: `role="alert"` (danger/warning) ou `role="status"` (info/success) — o navegador anuncia ao entrar no DOM;
 *  - Android: `accessibilityLiveRegion` (assertive/polite);
 *  - iOS: `AccessibilityInfo.announceForAccessibility` (o VoiceOver não anuncia role/região sozinho).
 * Um aviso IGUAL repetido (a pessoa erra a mesma senha duas vezes) não muda o DOM: quem renderiza troca a `key` a
 * cada tentativa para o aviso entrar de novo e ser anunciado de novo.
 *
 * Glifos em `Text` irmão, fora da fonte da marca — ver nota em typography.ts.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { withAlpha } from './colorAlpha';
import { glyphStyle, textStyle } from './typography';

export type InlineAlertTone = 'danger' | 'warning' | 'info' | 'success';

export interface InlineAlertProps {
  readonly tone: InlineAlertTone;
  readonly message: string;
  readonly title?: string | undefined;
  /** Ações abaixo do texto (botões/links). Ficam fora do anúncio. */
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

const TONE: Record<InlineAlertTone, { readonly glyph: string; readonly color: string; readonly border: string }> = {
  danger: { glyph: '✕', color: theme.role.danger, border: theme.role.dangerFill },
  warning: { glyph: '!', color: theme.role.warning, border: theme.role.warning },
  info: { glyph: 'i', color: theme.role.info, border: theme.role.borderControl },
  success: { glyph: '✓', color: theme.role.success, border: theme.role.success },
};

export const InlineAlert = memo(function InlineAlert({ tone, message, title, children, testID }: InlineAlertProps) {
  const assertive = tone === 'danger' || tone === 'warning';
  const spoken = title ? `${title}. ${message}` : message;

  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  const visual = TONE[tone];
  return (
    <View
      style={[styles.root, { borderColor: visual.border, backgroundColor: withAlpha(visual.border, 0.1) }]}
      testID={testID}
    >
      {/* Só texto + glifo ficam na região anunciada: contagem/ações que mudam abaixo não reanunciam o aviso. */}
      <View
        style={styles.row}
        role={assertive ? 'alert' : 'status'}
        accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      >
        <Text style={[styles.glyph, { color: visual.color }]}>{visual.glyph}</Text>
        <View style={styles.body}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.spacing['3'],
    gap: theme.spacing['2'],
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  glyph: { ...glyphStyle(theme.typography.weight.bold, 'body'), width: theme.spacing['4'], textAlign: 'center' },
  body: { flex: 1, gap: theme.spacing['1'] },
  title: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  message: { color: theme.role.textPrimary, ...textStyle('regular', 'small') },
  actions: { gap: theme.spacing['1'], alignItems: 'flex-start' },
});
