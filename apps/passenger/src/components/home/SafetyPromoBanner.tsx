import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Percent, ShieldCheck } from 'lucide-react-native';
import { MockBadge, theme, textStyle } from '@vuumbora/ui';

/**
 * Faixa de segurança + promoção. "Motoristas verificados", "suporte 24h" e "10% OFF" são
 * conteúdo de DEMONSTRAÇÃO (nenhuma verificação de motorista ou motor de cupom existe ainda —
 * ver especificacoes/PASSAGEIRO.md: "promoções... dependem de operação real").
 */
export const SafetyPromoBanner = memo(function SafetyPromoBanner() {
  return (
    <View style={styles.banner} testID="safety-promo-banner">
      <View style={styles.mockTag}>
        <MockBadge label="promoção fictícia" />
      </View>
      <View style={styles.row}>
        <View style={styles.column}>
          <ShieldCheck size={22} color={theme.role.ctaBackground} strokeWidth={1.75} />
          <Text style={styles.title} numberOfLines={2}>
            Segurança e confiança em todas as viagens
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            Motoristas verificados e suporte 24h.
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.column}>
          <Percent size={22} color={theme.role.ctaBackground} strokeWidth={1.75} />
          <Text style={styles.title} numberOfLines={1}>
            10% OFF
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            na sua 1ª corrida
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.role.ctaBackground,
    paddingTop: theme.spacing['5'],
    paddingBottom: theme.spacing['3'],
    paddingHorizontal: theme.spacing['3'],
  },
  mockTag: { position: 'absolute', top: theme.spacing['2'], right: theme.spacing['2'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['3'] },
  column: { flex: 1, gap: 4 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.role.border },
  title: { color: theme.role.ctaBackground, ...textStyle('bold', 'small') },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
});
