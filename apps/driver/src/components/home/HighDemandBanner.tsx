import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Zap } from 'lucide-react-native';
import { gradientColors, gradientLocations, theme, textStyle, MockBadge } from '@vuumbora/ui';

const BANNER_COLORS = gradientColors(theme.gradient.cta);
const BANNER_LOCATIONS = gradientLocations(theme.gradient.cta);

export interface HighDemandBannerProps {
  readonly onPress?: () => void;
}

/**
 * Aviso de alta demanda. Não existe motor de demanda/precificação real ainda — o
 * texto e o selo visual são conteúdo de DEMONSTRAÇÃO (mesma lógica das promoções do
 * passageiro: nenhum sinal real de oferta/demanda chega do servidor). Fundo é o
 * mesmo gradiente de marca do CTA (`gradient.cta`, `ButtonCore`) em vez de amarelo
 * chapado — acabamento premium consistente com o resto do app.
 */
export const HighDemandBanner = memo(function HighDemandBanner({ onPress }: HighDemandBannerProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Alta demanda na região. Mais solicitações e melhores ganhos agora."
      style={({ pressed }) => [pressed && styles.bannerPressed]}
      testID="high-demand-banner"
    >
      <LinearGradient colors={BANNER_COLORS} locations={BANNER_LOCATIONS} style={styles.banner}>
        <View style={styles.topRow}>
          <Zap size={22} color={theme.role.ctaText} strokeWidth={2} fill={theme.role.ctaText} />
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>
              Alta demanda na região!
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              Mais solicitações e melhores ganhos agora.
            </Text>
          </View>
          <ChevronRight size={20} color={theme.role.ctaText} strokeWidth={2.25} />
        </View>
        <View style={styles.mockRow}>
          {/* Selo sobre FUNDO CLARO (gradient.cta amarelo) — `onLight` troca
              textSecondary/borderControl (pensados pra fundo escuro) por ctaText
              (navy), senão o contraste cai pra ~1,17:1. Promovido a prop compartilhada
              do MockBadge nesta sessão — ver [[feedback_mockbadge_sem_variante_fundo_claro]]. */}
          <MockBadge label="sinal de demanda ilustrativo" onLight />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  banner: {
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['3'],
    gap: theme.spacing['2'],
  },
  bannerPressed: { opacity: 0.85 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'], minHeight: theme.layout.touchTarget },
  textBlock: { flex: 1, gap: 2 },
  title: { color: theme.role.ctaText, ...textStyle('bold', 'small') },
  subtitle: { color: theme.role.ctaText, ...textStyle('regular', 'caption') },
  mockRow: { paddingLeft: 30 },
});
