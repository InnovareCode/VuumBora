import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { InputCore, type InputCoreProps } from './InputCore';
import { glyphStyle } from './typography';

export type SearchInputProps = Omit<InputCoreProps, 'secureTextEntry' | 'leftAccessory' | 'rightAccessory'>;

export const SearchInput = memo(function SearchInput({ value, onChangeText, ...rest }: SearchInputProps) {
  const handleClear = useCallback(() => onChangeText(''), [onChangeText]);
  const canClear = value.length > 0 && !rest.disabled && !rest.loading;

  return (
    <InputCore
      {...rest}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      placeholder={rest.placeholder ?? 'Buscar'}
      leftAccessory={<MagnifierGlyph />}
      rightAccessory={
        canClear ? (
          <Pressable onPress={handleClear} accessibilityRole="button" accessibilityLabel="Limpar busca" style={styles.clearTarget}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : undefined
      }
    />
  );
});

/** Lupa desenhada com Views (sem ícone/emoji/dependência extra) — só cor dos tokens. */
function MagnifierGlyph() {
  return (
    <View style={styles.magnifier} accessible={false}>
      <View style={styles.magnifierLens} />
      <View style={styles.magnifierHandle} />
    </View>
  );
}

const styles = StyleSheet.create({
  magnifier: { width: 18, height: 18 },
  magnifierLens: {
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.role.textMuted,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  // Cabo ancorado no ponto exato da borda do círculo (45° a partir do centro, raio 5.5)
  // e girado em torno desse mesmo ponto (transformOrigin no topo da barra) — por isso
  // encosta de verdade no círculo em vez de "flutuar" perto dele (medido no navegador).
  magnifierHandle: {
    width: 2,
    height: 6,
    backgroundColor: theme.role.textMuted,
    position: 'absolute',
    left: 8.4,
    top: 9.4,
    transformOrigin: ['50%', '0%', 0],
    transform: [{ rotate: '45deg' }],
  },
  // Alvo de toque >= 44px mesmo com o glifo pequeno (medido no navegador).
  clearTarget: {
    minHeight: theme.layout.touchTarget,
    minWidth: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  clear: { color: theme.role.textMuted, ...glyphStyle(theme.typography.weight.regular, 'body') },
});
