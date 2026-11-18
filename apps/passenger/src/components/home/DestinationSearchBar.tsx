import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Search } from 'lucide-react-native';
import { theme, textStyle } from '@vuumbora/ui';

export interface DestinationSearchBarProps {
  readonly onPress?: () => void;
  /** Endereço de destino já escolhido (P04) — quando presente, substitui o convite padrão. */
  readonly destinationAddress?: string | undefined;
}

/**
 * Entrada de destino em destaque (amarelo) — ponto de partida do fluxo de busca (P04).
 * Botão de navegação (não campo de texto): a edição de verdade acontece na tela de destino.
 */
export const DestinationSearchBar = memo(function DestinationSearchBar({ onPress, destinationAddress }: DestinationSearchBarProps) {
  const hasDestination = Boolean(destinationAddress);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hasDestination ? `Destino: ${destinationAddress}. Tocar para alterar` : 'Para onde vamos? Informe seu destino'}
      style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
    >
      <View style={styles.iconCircle}>
        <Search size={20} color={theme.role.ctaText} strokeWidth={2.25} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {hasDestination ? destinationAddress : 'Para onde vamos?'}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {hasDestination ? 'Tocar para alterar o destino' : 'Informe seu destino'}
        </Text>
      </View>
      <ChevronRight size={22} color={theme.role.ctaText} strokeWidth={2.25} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    minHeight: theme.layout.touchTarget,
    backgroundColor: theme.role.ctaBackground,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing['4'],
    paddingVertical: theme.spacing['3'],
  },
  barPressed: { backgroundColor: theme.role.ctaBackgroundPressed },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.role.ctaBackgroundPressed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  title: { color: theme.role.ctaText, ...textStyle('bold', 'subtitle') },
  subtitle: { color: theme.role.ctaText, ...textStyle('medium', 'small'), marginTop: 2 },
});
