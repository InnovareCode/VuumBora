import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Zap } from 'lucide-react-native';
import { gradientColors, gradientLocations, theme, textStyle, glyphStyle } from '@vuumbora/ui';

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
          <MockNoticeOnLight label="sinal de demanda ilustrativo" />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

/**
 * Selo de "não é real" sobre FUNDO CLARO (o gradiente de marca amarelo do banner) —
 * auditoria Apolo: o `MockBadge` compartilhado (`@vuumbora/ui`) é desenhado pra fundo
 * escuro (texto/borda em `theme.role.textSecondary`/`borderControl`) e sobre amarelo
 * media 1,17:1 de contraste, quase ilegível. Em vez de adicionar uma variante no
 * componente compartilhado sem combinar (ele é usado em outras 27 telas, quase todas
 * de fundo escuro), replico localmente o mesmo desenho (chip tracejado + glifo "!")
 * só com a cor invertida pra `theme.role.ctaText` (navy) — é a mesma regra que já
 * vale pra qualquer texto sobre amarelo no projeto (docs/identidade-visual.md §7).
 * Única tela com selo de mock sobre fundo claro hoje; se aparecer um segundo caso,
 * vale promover isto a uma prop `onLight` do `MockBadge` em vez de duplicar de novo.
 */
function MockNoticeOnLight({ label }: { readonly label: string }) {
  return (
    <View style={styles.mockBadgeLight} accessibilityRole="text" accessibilityLabel={`Dado de ${label}, não é real`}>
      <Text style={styles.mockGlyphLight}>!</Text>
      <Text style={styles.mockLabelLight} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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
  mockBadgeLight: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.layout.mockChipHeight,
    gap: theme.spacing['1'],
    paddingHorizontal: theme.spacing['2'],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.role.ctaText,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  mockGlyphLight: { color: theme.role.ctaText, ...glyphStyle(theme.typography.weight.bold, 'caption') },
  mockLabelLight: { color: theme.role.ctaText, ...textStyle('medium', 'caption') },
});
