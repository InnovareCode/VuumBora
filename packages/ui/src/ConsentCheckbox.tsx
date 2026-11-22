import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { LinkButton } from './LinkButton';
import { glyphStyle, textStyle } from './typography';

export interface ConsentCheckboxProps {
  /** A frase do aceite ("Li e aceito os Termos de Uso"). É o NOME acessível da caixa. */
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Texto do link que abre o documento ("Ler os Termos de Uso"). Sem `onPressLink`, não há link. */
  readonly linkLabel?: string;
  readonly onPressLink?: () => void;
  /**
   * Texto curto ao lado do link ("versão mock-2"): diz QUAL texto está sendo aceito. Fica FORA do link (que continua
   * uma linha só, com alvo de 44pt) e quebra para baixo dele quando não cabe (320pt). Só aparece com `linkLabel`.
   */
  readonly linkCaption?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: string;
  readonly testID?: string;
  readonly linkTestID?: string;
}

/**
 * Caixa de aceite (Termos, Política) com acesso ao texto. Duas peças IRMÃS, nunca aninhadas:
 *  1. a linha (caixa + frase) é UM alvo `checkbox` de 44pt+ de altura — tocar na frase também marca;
 *  2. o link do documento é um botão à parte (`LinkButton`, 44pt).
 * Um link dentro do rótulo do checkbox faz o toque no link também marcar a caixa (o evento sobe), e o leitor de
 * tela anuncia o link como parte do nome do checkbox. O aceite NUNCA nasce marcado (consentimento explícito).
 */
export const ConsentCheckbox = memo(function ConsentCheckbox({
  label,
  checked,
  onChange,
  linkLabel,
  onPressLink,
  linkCaption,
  disabled = false,
  error = false,
  errorMessage,
  testID,
  linkTestID,
}: ConsentCheckboxProps) {
  // No web, o Pressable só trata a tecla Espaço em role `button`/`menuitem` (react-native-web, PressResponder): um
  // `role="checkbox"` só marcaria com Enter, e quem usa teclado espera Espaço. Medido no navegador.
  const spaceKeyProps =
    Platform.OS === 'web'
      ? ({
          onKeyDown: (event: { key: string; preventDefault: () => void }) => {
            if (event.key === ' ' && !disabled) {
              event.preventDefault(); // não rola a página
              onChange(!checked);
            }
          },
        } as object)
      : {};

  return (
    <View style={styles.root}>
      <Pressable
        {...spaceKeyProps}
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        // `aria-*` e não `accessibilityState`: no web o `checked` de `accessibilityState` NÃO chega ao DOM (medido: o
        // <div role="checkbox"> saía sem `aria-checked` e o leitor de tela não anunciava marcado/desmarcado).
        aria-checked={checked}
        aria-disabled={disabled}
        aria-invalid={error}
        style={styles.row}
        testID={testID}
      >
        <View
          style={[
            styles.box,
            checked && styles.boxChecked,
            error && !checked && styles.boxError,
            disabled && styles.boxDisabled,
          ]}
        >
          {checked ? <Text style={styles.check}>✓</Text> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {linkLabel && onPressLink ? (
        <View style={styles.linkRow}>
          <LinkButton label={linkLabel} onPress={onPressLink} align="flex-start" disabled={disabled} testID={linkTestID} />
          {linkCaption ? (
            <Text style={styles.linkCaption} testID={linkTestID ? `${linkTestID}-caption` : undefined}>
              {linkCaption}
            </Text>
          ) : null}
        </View>
      ) : null}
      {error && errorMessage ? (
        <View style={styles.errorRow} role="alert">
          <Text style={styles.errorGlyph}>✕</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
});

const BOX_SIZE = theme.spacing['6'];

const styles = StyleSheet.create({
  root: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    minHeight: theme.layout.touchTarget,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.role.borderControl,
    backgroundColor: theme.role.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: theme.role.ctaBackground, borderColor: theme.role.ctaBackground },
  boxError: { borderColor: theme.role.dangerFill },
  boxDisabled: { backgroundColor: theme.role.surfaceElevated },
  // Glifo (✓): fonte do sistema de propósito — ver nota em typography.ts.
  check: { color: theme.role.ctaText, ...glyphStyle(theme.typography.weight.bold, 'body') },
  label: { flex: 1, color: theme.role.textPrimary, ...textStyle('regular', 'body') },
  // Alinha o link com o texto da frase (largura da caixa + vão), não com a borda da tela.
  linkRow: {
    paddingLeft: BOX_SIZE + theme.spacing['3'] - theme.spacing['2'],
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  // `marginLeft` = o respiro lateral do `LinkButton` (spacing 2): quando a legenda quebra para baixo do link, ela fica
  // alinhada ao TEXTO do link, e não à borda do alvo de toque.
  linkCaption: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), flexShrink: 1, marginLeft: theme.spacing['2'] },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['1'], marginTop: theme.spacing['1'] },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  errorGlyph: { color: theme.role.danger, ...glyphStyle(theme.typography.weight.bold, 'small') },
  errorText: { color: theme.role.danger, ...textStyle('regular', 'small'), flexShrink: 1 },
});
