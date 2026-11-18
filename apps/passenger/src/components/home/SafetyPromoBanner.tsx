import { memo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Percent, ShieldCheck } from 'lucide-react-native';
import { MockBadge, SurfaceRaised, theme, textStyle } from '@vuumbora/ui';

const NARROW_BREAKPOINT = 375;

/**
 * Faixa de segurança + promoção. "Motoristas verificados", "suporte 24h" e "10% OFF" são
 * conteúdo de DEMONSTRAÇÃO (nenhuma verificação de motorista ou motor de cupom existe ainda —
 * ver especificacoes/PASSAGEIRO.md: "promoções... dependem de operação real").
 *
 * Direção de arte §6/§9 item 5: abaixo de 375pt o "10% OFF" não cabe ao lado da coluna
 * de segurança com legibilidade — as duas colunas empilham em vez de ficar lado a lado.
 */
export const SafetyPromoBanner = memo(function SafetyPromoBanner() {
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_BREAKPOINT;

  return (
    <SurfaceRaised style={styles.banner} testID="safety-promo-banner">
      <View style={styles.mockTag}>
        <MockBadge label="promoção fictícia" />
      </View>
      <View style={narrow ? styles.columnStack : styles.row}>
        <View style={styles.column}>
          <ShieldCheck size={22} color={theme.role.ctaBackground} strokeWidth={1.75} />
          {/* Encurtado: "Segurança e confiança em todas as viagens" precisava de 3
              linhas nos 134,5px da coluna a 360px (medido) — numberOfLines={2} cortava
              a 3ª. Esta versão cabe em 2 linhas sem truncar. */}
          <Text style={styles.title} numberOfLines={2}>
            Segurança em todas as viagens
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            Motoristas verificados e suporte 24h.
          </Text>
        </View>
        {narrow ? <View style={styles.dividerHorizontal} /> : <View style={styles.divider} />}
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
    </SurfaceRaised>
  );
});

const styles = StyleSheet.create({
  banner: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Direção de arte §4/§9 item 1: a borda amarela era mais um foco de amarelo
    // competindo com o CTA. Borda iluminada de cima (item 2) no lugar. Fundo: item 6
    // (`gradient.surface.raised`, ver SurfaceRaised).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingTop: theme.spacing['5'],
    paddingBottom: theme.spacing['3'],
    paddingHorizontal: theme.spacing['3'],
  },
  mockTag: { position: 'absolute', top: theme.spacing['2'], right: theme.spacing['2'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['3'] },
  columnStack: { gap: theme.spacing['3'] },
  column: { flex: 1, gap: 4 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.role.edgeBottom },
  dividerHorizontal: { height: 1, backgroundColor: theme.role.edgeBottom },
  title: { color: theme.role.ctaBackground, ...textStyle('bold', 'small') },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
});
