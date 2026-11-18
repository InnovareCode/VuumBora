import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { glyphStyle, textStyle } from './typography';

export interface MockBadgeProps {
  /** Texto curto — padrão cobre o caso mais comum ("dado de demonstração"). */
  readonly label?: string;
  readonly testID?: string;
}

/**
 * Selo para sinalizar dado/recurso de DEMONSTRAÇÃO (preço, ETA, promoção, nome,
 * "Agendar" etc.) que ainda não é regra de negócio real — nunca deve ser lido como
 * informação confiável. Ver especificacoes/PASSAGEIRO.md: "mockups são propostas,
 * não recursos implementados".
 */
export const MockBadge = memo(function MockBadge({ label = 'demonstração', testID }: MockBadgeProps) {
  return (
    <View style={styles.badge} accessibilityRole="text" accessibilityLabel={`Dado de ${label}, não é real`} testID={testID}>
      {/* Glifo (!): fonte do sistema de propósito — ver nota em typography.ts. */}
      <Text style={styles.glyph}>!</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['1'],
    paddingHorizontal: theme.spacing['2'],
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.role.warning,
    backgroundColor: theme.role.surfaceElevated,
    alignSelf: 'flex-start',
  },
  glyph: { color: theme.role.warning, ...glyphStyle(theme.typography.weight.bold, 'caption') },
  label: { color: theme.role.warning, ...textStyle('semibold', 'caption') },
});
