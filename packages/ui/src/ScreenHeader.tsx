import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { ChevronLeft } from 'lucide-react-native';
import { textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

export type ScreenHeaderAlign = 'center' | 'left';

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly rightSlot?: ReactNode;
  /**
   * `center` (padrão, C-17): título centralizado de verdade — a caixa da direita espelha a
   * largura da esquerda (`docs/padrao-premium-telas.md` §18.1, item 1), mesmo sem `rightSlot`.
   * `left`: título ao lado da seta, sem caixa reservada à direita quando não há `rightSlot`
   * (o comportamento de antes — telas em que o título precisa ficar perto da seta).
   */
  readonly align?: ScreenHeaderAlign;
  readonly testID?: string;
}

/** Cabeçalho padrão de tela: voltar (opcional) + título/subtítulo + slot de ação. */
export const ScreenHeader = memo(function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightSlot,
  align = 'center',
  testID,
}: ScreenHeaderProps) {
  // C-17: no modo center, a caixa da direita espelha a largura que a esquerda usa (0 sem
  // onBack, 44pt com ele) — é isso que coloca o título no centro de verdade, não só "ao
  // lado da seta". No modo left, a caixa da direita só existe quando há `rightSlot`
  // (achado da auditoria: reservá-la sempre empurrava o título para fora do centro visual
  // sem nunca centralizar de verdade).
  const leftWidth = onBack ? theme.layout.touchTarget : 0;
  const showRightBox = align === 'center' || Boolean(rightSlot);

  return (
    <View style={styles.row} testID={testID}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={styles.titleBlock}>
        <Text style={[styles.title, align === 'center' && styles.titleCentered]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, align === 'center' && styles.titleCentered]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showRightBox ? (
        <View style={[styles.rightSlot, align === 'center' && { minWidth: leftWidth }]}>{rightSlot}</View>
      ) : null}
    </View>
  );
});

// Dentro da caixa de 44pt: o ícone é pequeno e centrado, e o alvo encosta na borda da tela (um anel de fora seria cortado).
const FOCUS_RING = focusRingStyle('inside', theme.radius.md);

/** "Voltar": estado de foco próprio (componente à parte para o cabeçalho inteiro não renderizar a cada Tab). */
const BackButton = memo(function BackButton({ onPress }: { readonly onPress: () => void }) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      hitSlop={8}
      style={[styles.backButton, focusVisible && FOCUS_RING]}
    >
      <ChevronLeft size={24} color={theme.role.textPrimary} strokeWidth={1.75} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: theme.layout.touchTarget, gap: theme.spacing['2'] },
  backButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { flex: 1 },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  titleCentered: { textAlign: 'center' },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), marginTop: theme.spacing['1'] },
  rightSlot: { minWidth: theme.layout.touchTarget, alignItems: 'flex-end' },
});
