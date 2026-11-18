import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';

export type BrandLogoSize = 'sm' | 'md' | 'lg';

export interface BrandLogoProps {
  readonly size?: BrandLogoSize;
  readonly withWordmark?: boolean;
  readonly testID?: string;
}

const BADGE_SIZE: Record<BrandLogoSize, number> = { sm: 32, md: theme.layout.touchTarget, lg: 56 };
const WORDMARK_SIZE: Record<BrandLogoSize, keyof typeof theme.typography.size> = {
  sm: 'body',
  md: 'subtitle',
  lg: 'title',
};

/**
 * Selo + nome da marca, construído só com tokens (sem imagem bitmap — ícone/splash
 * seguem PENDENTES por app.config.ts até a Apolo entregar os assets definitivos).
 */
export const BrandLogo = memo(function BrandLogo({ size = 'md', withWordmark = true, testID }: BrandLogoProps) {
  const badge = BADGE_SIZE[size];
  return (
    <View style={styles.row} testID={testID} accessibilityRole="image" accessibilityLabel="VuumBora">
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: theme.radius.md }]}>
        <Text style={[styles.badgeGlyph, { fontSize: badge * 0.55 }]}>V</Text>
      </View>
      {withWordmark ? (
        <Text style={[styles.wordmark, { fontSize: theme.typography.size[WORDMARK_SIZE[size]] }]}>
          Vuum<Text style={styles.wordmarkAccent}>Bora</Text>
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  badge: { backgroundColor: theme.role.ctaBackground, alignItems: 'center', justifyContent: 'center' },
  badgeGlyph: { color: theme.role.ctaText, fontWeight: theme.typography.weight.bold },
  wordmark: { color: theme.role.textPrimary, fontWeight: theme.typography.weight.bold },
  wordmarkAccent: { color: theme.role.ctaBackground },
});
