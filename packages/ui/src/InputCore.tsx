/**
 * InputCore — base interna de todo campo de texto do design system.
 * Não é exportada por `index.ts`: TextInput/PasswordInput/PhoneInput/SearchInput
 * são variações públicas desta mesma implementação (DRY, contrato único de estados).
 *
 * Estados cobertos: padrão, foco, desabilitado, carregando (bloqueia edição +
 * spinner) e erro (borda `dangerFill` + mensagem com ícone, `accessibilityRole="alert"`).
 * Borda de controle é sempre `theme.role.borderControl` (regra do DS: 3:1 garantido
 * nos quatro fundos; `border`/`borderEmphasis` são só decorativos).
 */
import { memo, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import { theme } from '@vuumbora/tokens';
import { glyphStyle, textStyle } from './typography';

/** O que `inputRef` entrega (`.focus()`, `.blur()`...): a instância do campo nativo. */
export type TextInputHandle = ComponentRef<typeof RNTextInput>;

export interface InputCoreProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: string;
  readonly helperText?: string;
  readonly secureTextEntry?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly autoCapitalize?: RNTextInputProps['autoCapitalize'];
  readonly autoComplete?: RNTextInputProps['autoComplete'];
  readonly maxLength?: number;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
  readonly leftAccessory?: ReactNode;
  readonly rightAccessory?: ReactNode;
  /** Avisa o pai quando o campo ganha/perde foco (ex.: destacar qual campo está ativo numa busca com vários campos). */
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  /**
   * Fluxo de teclado em formulário: `returnKeyType="next"` + `onSubmitEditing` que foca o próximo campo (via
   * `inputRef`), ou envia o formulário no último. `inputRef` aponta para o `<TextInput>` nativo (não para o wrapper).
   */
  readonly inputRef?: Ref<TextInputHandle>;
  readonly returnKeyType?: RNTextInputProps['returnKeyType'];
  readonly onSubmitEditing?: () => void;
  /** Dica de preenchimento automático do iOS (`oneTimeCode`, `emailAddress`...). No Android/web vale `autoComplete`. */
  readonly textContentType?: RNTextInputProps['textContentType'];
  /** `false` em e-mail, código e data: corretor ortográfico/autocorreção estragam o que a pessoa digitou. */
  readonly autoCorrect?: boolean;
}

/**
 * No web o <input> ganha o anel de foco padrão do navegador (retângulo branco DENTRO do campo). O indicador de foco
 * do design system é a borda de 2pt do `field` (`ctaBackground`), que já cobre o campo inteiro — dois anéis, um dentro
 * do outro, é ruído. O foco continua visível (pela borda do campo); só o anel interno do navegador sai.
 */
const WEB_NO_INNER_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/**
 * O react-native-web imita o RN: todo campo de uma linha com `onSubmitEditing` se DESFOCA depois do Enter
 * (`setTimeout(() => input.blur(), 0)`). No celular isso fecha o teclado, e é o certo; no web não há teclado para
 * fechar, e quem usa só o teclado perde o lugar (o foco cai no <body>, medido: Enter na senha de um login com erro).
 * No web o foco fica no campo. No nativo continua o padrão do RN (o teclado fecha ao enviar).
 */
const WEB_KEEP_FOCUS_ON_SUBMIT = Platform.OS === 'web' ? { blurOnSubmit: false } : null;

export const InputCore = memo(function InputCore({
  label,
  value,
  onChangeText,
  placeholder,
  disabled = false,
  loading = false,
  error = false,
  errorMessage,
  helperText,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  maxLength,
  accessibilityLabel,
  testID,
  leftAccessory,
  rightAccessory,
  onFocus,
  onBlur,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  textContentType,
  autoCorrect,
}: InputCoreProps) {
  const [focused, setFocused] = useState(false);
  const editable = !disabled && !loading;

  // Estado de destaque (foco/erro): borda uniforme nos 4 lados, é um indicador de
  // estado, não a luz ambiente do card. Estado padrão: borda iluminada de cima
  // (direção de arte §4/§9 item 2) — mesma técnica de InfoCard/RideCategoryCard.
  const highlighted = error || focused;
  const borderColor = error ? theme.role.dangerFill : focused ? theme.role.ctaBackground : theme.role.edgeBottom;
  const borderTopColor = highlighted ? borderColor : theme.role.edgeTop;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: disabled ? theme.role.surfaceElevated : theme.role.input,
            borderColor,
            borderTopColor,
            borderWidth: highlighted ? 2 : 1,
          },
        ]}
      >
        {leftAccessory ? <View style={styles.leftAccessory}>{leftAccessory}</View> : null}
        <RNTextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.role.textMuted}
          editable={editable}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          {...WEB_KEEP_FOCUS_ON_SUBMIT}
          textContentType={textContentType}
          autoCorrect={autoCorrect}
          spellCheck={autoCorrect}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[styles.input, WEB_NO_INNER_OUTLINE, { color: disabled ? theme.role.textMuted : theme.role.textPrimary }]}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled: !editable }}
          aria-invalid={error}
          aria-busy={loading}
          testID={testID}
        />
        {loading ? (
          <ActivityIndicator color={theme.role.textMuted} style={styles.rightAccessory} />
        ) : rightAccessory ? (
          <View style={styles.rightAccessory}>{rightAccessory}</View>
        ) : null}
      </View>
      {error && errorMessage ? (
        <View style={styles.helperRow} accessibilityRole="alert">
          <Text style={styles.errorGlyph}>✕</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  label: {
    color: theme.role.textSecondary,
    ...textStyle('semibold', 'small'),
    marginBottom: theme.spacing['1'],
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.layout.inputHeight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing['3'],
  },
  input: {
    flex: 1,
    // Sem isto o <input> web não encolhe abaixo da largura intrínseca do navegador (Firefox ~253px, WebKit ~246px;
    // o Chromium encolhe por conta própria): em linha flex o `min-width: auto` ganha do `flex: 1 1 0` e empurra o
    // acessório da direita ("Mostrar senha") para fora do campo, onde ele é cortado. No nativo é inofensivo.
    minWidth: 0,
    // Estica o campo nativo até a altura do `field` (52pt): sem isto o <TextInput> media 37pt e o toque nas faixas de
    // cima/baixo do campo não focava nada (alvo real abaixo dos 44pt do design system — medido no navegador).
    alignSelf: 'stretch',
    ...textStyle('regular', 'body'),
    paddingVertical: theme.spacing['2'],
  },
  leftAccessory: { marginRight: theme.spacing['2'] },
  rightAccessory: { marginLeft: theme.spacing['2'] },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['1'],
    marginTop: theme.spacing['1'],
  },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  errorGlyph: { color: theme.role.danger, ...glyphStyle(theme.typography.weight.bold, 'small') },
  errorText: { color: theme.role.danger, ...textStyle('regular', 'small'), flexShrink: 1 },
  helperText: { color: theme.role.textMuted, ...textStyle('regular', 'small'), marginTop: theme.spacing['1'] },
});
