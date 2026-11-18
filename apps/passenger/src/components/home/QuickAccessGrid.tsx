import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MockBadge, SurfaceRaised, theme, textStyle } from '@vuumbora/ui';

export interface QuickAccessItem {
  readonly key: string;
  readonly label: string;
  readonly subtitle: string;
  readonly icon: ReactNode;
  readonly onPress?: () => void;
  /** `true` quando o atalho ainda não existe de verdade (ex.: Agendar) — mostra `MockBadge`. */
  readonly mock?: boolean;
}

export interface QuickAccessGridProps {
  readonly items: readonly QuickAccessItem[];
}

const NARROW_BREAKPOINT = 375;

/**
 * Linha de atalhos (Casa, Trabalho, Favoritos, Agendar...).
 *
 * Direção de arte §6/§9 item 5: em 4 colunas a 320pt sobram ~64pt por atalho e o
 * subtítulo trunca (é o que acontece hoje). Abaixo de 375pt o layout vira grade 2×2
 * com o ícone ao lado do texto (mais largura disponível por item); a partir de 375pt
 * continua 1 linha de 4 colunas com ícone em cima, como já era.
 */
export const QuickAccessGrid = memo(function QuickAccessGrid({ items }: QuickAccessGridProps) {
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_BREAKPOINT;

  if (!narrow) {
    return (
      <View style={styles.row}>
        {items.map(({ key, ...item }) => (
          <QuickAccessButton key={key} narrow={false} {...item} />
        ))}
      </View>
    );
  }

  const rows: (readonly QuickAccessItem[])[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0]?.key ?? Math.random()} style={styles.row}>
          {row.map(({ key, ...item }) => (
            <QuickAccessButton key={key} narrow {...item} />
          ))}
        </View>
      ))}
    </View>
  );
});

function QuickAccessButton({ label, subtitle, icon, onPress, mock, narrow }: Omit<QuickAccessItem, 'key'> & { readonly narrow: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={mock ? `${label}, recurso de demonstração` : label}
      style={styles.pressable}
    >
      {({ pressed }) => (
        <SurfaceRaised style={[styles.card, narrow && styles.cardNarrow, pressed && styles.cardPressed]}>
          <View style={narrow ? styles.iconNarrow : styles.icon}>{icon}</View>
          <View style={narrow ? styles.textBlockNarrow : undefined}>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
            {/* 2 linhas (não 1) em QUALQUER largura: medido (Playwright, fonte real) que
                "Centro, Natal"/"Ponta Negra"/"Meus destinos"/"Escolha data e hora" precisam
                de 2 linhas mesmo na grade 2×2 (< 375pt) — "Escolha data e hora" (110px)
                não cabe em 1 linha mesmo com mais largura por card (80px de texto). */}
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
            {/* Narrow: o badge fica EMPILHADO dentro da coluna de texto, nunca ao lado
                dela — colocado como irmão flexível na mesma linha (marginLeft:'auto'),
                ele disputava largura com um texto já apertado e cortava "Agendar" para
                "A." (medido no navegador a 320pt, achado real, não hipotético). */}
            {mock && narrow ? (
              <View style={styles.mockTagInline}>
                <MockBadge label="demo" />
              </View>
            ) : null}
          </View>
          {mock && !narrow ? (
            <View style={styles.mockTag}>
              <MockBadge label="demo" />
            </View>
          ) : null}
        </SurfaceRaised>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { gap: theme.spacing['2'] },
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  pressable: { flex: 1 },
  card: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2). Fundo: item 6
    // (`gradient.surface.raised`, ver SurfaceRaised).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['1'],
    alignItems: 'center',
    gap: 4,
  },
  // Grade 2×2 (< 375pt): ícone ao lado do texto, não em cima — direção de arte §6.
  cardNarrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['2'],
    paddingHorizontal: theme.spacing['3'],
  },
  cardPressed: { opacity: 0.85 },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  iconNarrow: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  textBlockNarrow: { flex: 1 },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption') },
  subtitle: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  mockTag: { marginTop: 2 },
  mockTagInline: { marginTop: 2, alignSelf: 'flex-start' },
});
