import { memo, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput as RNTextInput, View } from 'react-native';
import { ArrowUpDown, ChevronRight, Circle, MapPin } from 'lucide-react-native';
import { theme, textStyle, tokens, focusRingStyle, useKeyboardFocusRing } from '@vuumbora/ui';

// O <input> web ganharia o anel padrão do navegador (retângulo branco por cima do texto) além
// do destaque próprio do campo — mesma técnica do `InputCore` (`packages/ui/src/InputCore.tsx`).
const WEB_NO_INNER_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

export interface RouteFieldProps {
  readonly value: string;
  readonly placeholder: string;
  readonly onChangeText: (text: string) => void;
  readonly onFocus: () => void;
  /** `false`: a linha mostra só texto (ex.: "Sua localização atual") — tocar nela chama `onPressLocked`. */
  readonly editable?: boolean;
  readonly onPressLocked?: () => void;
  readonly inputRef?: Ref<ComponentRef<typeof RNTextInput>>;
}

export interface RouteInputCardProps {
  readonly origin: RouteFieldProps;
  readonly destination: RouteFieldProps;
  readonly onSwap: () => void;
  readonly testID?: string;
}

/**
 * Cartão único de origem+destino (C-07/C-17 e pedido local da ficha P04, §4: "componente local
 * RouteInputCard"). Marcadores: origem = círculo `map.pickup` (verde), destino = pino
 * `map.destination` (vermelho) — nunca mais o disco amarelo/pino `warning` que a auditoria
 * apontou (`docs/padrao-premium-telas.md` §4, defeito de consistência).
 *
 * Não reaproveita `InputCore`/`TextInput` de propósito: aqueles têm rótulo próprio + 52pt de
 * campo cada um (dois blocos separados), e a ficha pede UM cartão com os dois campos dentro,
 * ligados por uma linha + botão de trocar — um arranjo visual que o campo genérico não cobre.
 */
export const RouteInputCard = memo(function RouteInputCard({ origin, destination, onSwap, testID }: RouteInputCardProps) {
  const { focusVisible: swapFocusVisible, focusProps: swapFocusProps } = useKeyboardFocusRing();

  return (
    <View style={styles.card} testID={testID}>
      <RouteFieldRow
        {...origin}
        icon={<Circle size={14} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} />}
        accessibilityLabel={origin.editable === false ? 'Origem: sua localização atual. Tocar para alterar' : 'Origem'}
        testID={testID ? `${testID}-origin` : undefined}
      />

      <View style={styles.connectorRow}>
        <View style={styles.connectorColumn}>
          <View style={styles.connectorLine} />
        </View>
        <Pressable
          {...swapFocusProps}
          onPress={onSwap}
          accessibilityRole="button"
          accessibilityLabel="Trocar origem e destino"
          hitSlop={8}
          style={[styles.swapButton, swapFocusVisible && FOCUS_RING]}
        >
          <ArrowUpDown size={16} color={theme.role.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <RouteFieldRow
        {...destination}
        icon={<MapPin size={16} color={tokens.color.map.destination} strokeWidth={2} />}
        accessibilityLabel="Destino"
        testID={testID ? `${testID}-destination` : undefined}
      />
    </View>
  );
});

function RouteFieldRow({
  value,
  placeholder,
  onChangeText,
  onFocus,
  editable = true,
  onPressLocked,
  inputRef,
  icon,
  accessibilityLabel,
  testID,
}: RouteFieldProps & { readonly icon: ReactNode; readonly accessibilityLabel: string; readonly testID?: string | undefined }) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();

  if (!editable) {
    return (
      <Pressable
        {...focusProps}
        onPress={onPressLocked}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.row, focusVisible && FOCUS_RING]}
        testID={testID}
      >
        <View style={styles.iconBox}>{icon}</View>
        {/* Sem texto fixo "Tocar para alterar" ao lado (bug_flex_fixo_espreme_texto_flex1_vizinho
            da memória: um irmão de largura fixa cortava "Sua localização atual" a partir de
            360pt). Um chevron (ícone pequeno, não encolhe) já é o sinal de toque; o rótulo fica
            com a largura inteira do cartão. */}
        <Text style={styles.lockedText} numberOfLines={1}>
          {value}
        </Text>
        <ChevronRight size={18} color={theme.role.textMuted} strokeWidth={2} />
      </Pressable>
    );
  }

  return <EditableRow {...{ value, placeholder, onChangeText, onFocus, inputRef, icon, accessibilityLabel, testID }} />;
}

/**
 * Campo de texto de verdade (separado do `locked`/ramo acima para isolar o `useState` de foco —
 * ele só existe enquanto o campo é editável). Destaque de foco: fundo muda para `role.input`
 * (igual ao `InputCore`), porque as linhas não têm borda própria (só o cartão inteiro tem) — um
 * anel por fora ficaria preso entre as duas linhas do cartão.
 */
function EditableRow({
  value,
  placeholder,
  onChangeText,
  onFocus,
  inputRef,
  icon,
  accessibilityLabel,
  testID,
}: Pick<RouteFieldProps, 'value' | 'placeholder' | 'onChangeText' | 'onFocus'> & {
  readonly inputRef?: RouteFieldProps['inputRef'] | undefined;
  readonly icon: ReactNode;
  readonly accessibilityLabel: string;
  readonly testID?: string | undefined;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.row, focused && styles.rowFocused]}>
      <View style={styles.iconBox}>{icon}</View>
      <RNTextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus();
        }}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={theme.role.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, WEB_NO_INNER_OUTLINE]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    </View>
  );
}

// Dentro do cartão: anel por FORA, sem cortar nas bordas do cartão (as linhas não têm padding próprio).
const FOCUS_RING = focusRingStyle('outside', theme.radius.md);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingHorizontal: theme.spacing['3'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    minHeight: 52,
    borderRadius: theme.radius.md,
    marginHorizontal: -theme.spacing['3'],
    paddingHorizontal: theme.spacing['3'],
  },
  rowFocused: { backgroundColor: theme.role.input },
  iconBox: { width: 24, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    color: theme.role.textPrimary,
    ...textStyle('regular', 'body'),
  },
  lockedText: { flex: 1, color: theme.role.textPrimary, ...textStyle('medium', 'body') },
  connectorRow: { flexDirection: 'row', alignItems: 'center', height: theme.spacing['5'] },
  connectorColumn: { width: 24, alignItems: 'center', height: '100%' },
  connectorLine: { width: 2, flex: 1, backgroundColor: theme.role.edgeBottom },
  swapButton: {
    marginLeft: 'auto',
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
