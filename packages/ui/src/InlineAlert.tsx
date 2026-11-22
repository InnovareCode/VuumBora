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
import { memo, useEffect, type ReactNode, type Ref } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View, type ViewInstance } from 'react-native';
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
  /**
   * Ref do aviso INTEIRO, para quem renderiza levar o foco até ele depois de um envio que falhou (`ref.current?.focus()`).
   * Com ela o aviso passa a aceitar foco por código (`tabIndex -1`: nunca entra na ordem do Tab nem muda o toque).
   * Sem ela nada muda. Por que existe: o botão que enviou fica indisponível durante o envio e o navegador joga o foco
   * no <body>; o aviso é onde está a explicação e as ações (`Pedir novo código`, `Entrar na minha conta`).
   * No nativo `focus()` num `View` não faz nada: lá o anúncio é a região viva / `announceForAccessibility` acima.
   */
  readonly focusRef?: Ref<ViewInstance>;
  /**
   * `false` = aviso ESTÁTICO: contexto que fica na tela (ex.: "a conta não é o cadastro de motorista"), não resposta a uma
   * ação. Sem `role`, sem região viva e sem `announceForAccessibility`: o leitor de tela o lê na ordem normal, uma vez,
   * em vez de interromper a pessoa a cada vez que a tela abre. Padrão `true` (o de sempre: erro/estado que acabou de surgir).
   */
  readonly announce?: boolean;
}

const TONE: Record<InlineAlertTone, { readonly glyph: string; readonly color: string; readonly border: string }> = {
  danger: { glyph: '✕', color: theme.role.danger, border: theme.role.dangerFill },
  warning: { glyph: '!', color: theme.role.warning, border: theme.role.warning },
  info: { glyph: 'i', color: theme.role.info, border: theme.role.borderControl },
  success: { glyph: '✓', color: theme.role.success, border: theme.role.success },
};

export const InlineAlert = memo(function InlineAlert({ tone, message, title, children, testID, focusRef, announce = true }: InlineAlertProps) {
  const assertive = tone === 'danger' || tone === 'warning';
  const spoken = title ? `${title}. ${message}` : message;

  useEffect(() => {
    if (announce && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken);
  }, [announce, spoken]);

  const visual = TONE[tone];
  return (
    <View
      ref={focusRef}
      {...(focusRef ? { tabIndex: -1 as const } : null)}
      style={[styles.root, { borderColor: visual.border, backgroundColor: withAlpha(visual.border, 0.1) }]}
      testID={testID}
    >
      {/* Só texto + glifo ficam na região anunciada: contagem/ações que mudam abaixo não reanunciam o aviso. */}
      <View
        style={styles.row}
        {...(announce
          ? { role: assertive ? ('alert' as const) : ('status' as const), accessibilityLiveRegion: assertive ? ('assertive' as const) : ('polite' as const) }
          : null)}
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
