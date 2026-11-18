import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Search } from 'lucide-react-native';
import { theme, textStyle, gradientColors, gradientLocations } from '@vuumbora/ui';

export interface DestinationSearchBarProps {
  readonly onPress?: () => void;
  /** Endereço de destino já escolhido (P04) — quando presente, substitui o convite padrão. */
  readonly destinationAddress?: string | undefined;
}

const PILL_COLORS = gradientColors(theme.gradient.searchLight);
const PILL_LOCATIONS = gradientLocations(theme.gradient.searchLight);

/**
 * Entrada de destino em destaque — ponto de partida do fluxo de busca (P04).
 * Botão de navegação (não campo de texto): a edição de verdade acontece na tela de destino.
 *
 * Pílula CLARA (direção de arte §4/§9 item 1), não mais amarela: na referência medida, o
 * amarelo fica livre para o CTA e é a pílula de busca — o elemento mais "alto" da tela —
 * que carrega o contraste de elevação, por inversão (clara sobre fundo escuro).
 */
export const DestinationSearchBar = memo(function DestinationSearchBar({ onPress, destinationAddress }: DestinationSearchBarProps) {
  const hasDestination = Boolean(destinationAddress);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hasDestination ? `Destino: ${destinationAddress}. Tocar para alterar` : 'Para onde vamos? Informe seu destino'}
      style={({ pressed }) => [pressed && styles.barPressed]}
    >
      <LinearGradient colors={PILL_COLORS} locations={PILL_LOCATIONS} style={styles.bar}>
        <View style={styles.iconCircle}>
          <Search size={20} color={theme.role.textOnLight} strokeWidth={2.25} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {hasDestination ? destinationAddress : 'Para onde vamos?'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {hasDestination ? 'Tocar para alterar o destino' : 'Informe seu destino'}
          </Text>
        </View>
        <ChevronRight size={22} color={theme.role.textOnLight} strokeWidth={2.25} />
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    minHeight: theme.layout.searchHeight,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing['4'],
    paddingVertical: theme.spacing['3'],
  },
  barPressed: { opacity: 0.88 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(12,17,27,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  title: { color: theme.role.textOnLight, ...textStyle('bold', 'subtitle') },
  subtitle: { color: theme.role.textOnLightMuted, ...textStyle('medium', 'small'), marginTop: 2 },
});
