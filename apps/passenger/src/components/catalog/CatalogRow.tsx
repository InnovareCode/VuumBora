import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { textStyle, theme } from '@vuumbora/ui';

export interface CatalogRowProps {
  readonly label: string;
  readonly children: ReactNode;
  /** Empilha vertical em vez de lado a lado — para componentes largos (inputs, cartões). */
  readonly stacked?: boolean;
}

/** Uma amostra rotulada dentro de uma `CatalogSection` (ex.: "Padrão", "Desabilitado"). */
export function CatalogRow({ label, children, stacked = false }: CatalogRowProps) {
  return (
    <View style={stacked ? styles.stackedRow : styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={stacked ? styles.stackedContent : styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: theme.spacing['4'], flexWrap: 'wrap' },
  stackedRow: { width: '100%', gap: theme.spacing['2'] },
  label: {
    color: theme.role.textMuted,
    ...textStyle('semibold', 'caption'),
    width: 110,
    flexShrink: 0,
  },
  // `flex: 1` é o que faz o `flexWrap` valer: sem largura definida, o conteúdo só
  // cresce e é cortado pelo ScrollView em vez de quebrar linha (medido no navegador).
  // `minWidth: 0` é o reforço contra o item de flex nunca encolher abaixo do seu
  // próprio "min-content" (tamanho natural do conteúdo) — guarda de verdade contra
  // depender da métrica de fonte do sistema (pedido do Atlas, 18/11/2026).
  content: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'], flexWrap: 'wrap' },
  stackedContent: { width: '100%', maxWidth: 360, flexShrink: 1, minWidth: 0 },
});
