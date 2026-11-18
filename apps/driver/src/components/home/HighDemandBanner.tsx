import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Zap } from 'lucide-react-native';
import { MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface HighDemandBannerProps {
  readonly onPress?: () => void;
}

/**
 * Aviso de alta demanda. Não existe motor de demanda/precificação real ainda — o
 * texto e o selo visual são conteúdo de DEMONSTRAÇÃO (mesma lógica das promoções do
 * passageiro: nenhum sinal real de oferta/demanda chega do servidor).
 */
export const HighDemandBanner = memo(function HighDemandBanner({ onPress }: HighDemandBannerProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Alta demanda na região. Mais solicitações e melhores ganhos agora."
      style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
      testID="high-demand-banner"
    >
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
        <MockBadge label="sinal de demanda ilustrativo" />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.role.ctaBackground,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['3'],
    gap: theme.spacing['2'],
  },
  bannerPressed: { backgroundColor: theme.role.ctaBackgroundPressed },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'], minHeight: theme.layout.touchTarget },
  textBlock: { flex: 1, gap: 2 },
  title: { color: theme.role.ctaText, ...textStyle('bold', 'small') },
  subtitle: { color: theme.role.ctaText, ...textStyle('regular', 'caption') },
  mockRow: { paddingLeft: 30 },
});
