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
 *
 * Visual neutro (chip tracejado, sem amarelo) — direção de arte §4/§9 item 1: o selo
 * amarelo competia com o CTA pelo único foco de amarelo da tela. Continua visível
 * (contraste de texto e borda preservados) e continua tendo `accessibilityLabel`
 * explícito — a honestidade do dado mock não depende da cor.
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
    minHeight: theme.layout.mockChipHeight,
    gap: theme.spacing['1'],
    paddingHorizontal: theme.spacing['2'],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.role.borderControl,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  glyph: { color: theme.role.textSecondary, ...glyphStyle(theme.typography.weight.bold, 'caption') },
  label: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
});
