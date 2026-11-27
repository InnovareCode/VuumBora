import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MockBadge, SurfaceRaised, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

/** Anel de foco de teclado em volta do atalho (G-22), no raio do cartão. */
const TILE_FOCUS_RING = focusRingStyle('outside', theme.radius.lg);

export interface QuickAccessItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly onPress?: () => void;
  /** `true` quando o atalho ainda não existe de verdade — mostra `MockBadge`. */
  readonly mock?: boolean;
}

export interface QuickAccessGridProps {
  readonly items: readonly QuickAccessItem[];
}

/**
 * Linha de atalhos (Casa, Trabalho, Favoritos — ficha P03 §2/§11: a prancha tem 3, sem
 * subtítulo de endereço e sem "Agendar". 1 linha de N colunas em qualquer largura (320 a 430):
 * com 3 itens, 3 × ~90pt cabe até em 320pt (ficha: "3 colunas... cabe em 288"), diferente da
 * versão anterior com 4 itens + subtítulo, que precisava de grade 2×2 abaixo de 375pt.
 *
 * Sem endereço salvo: a ficha pede o rótulo mudar para "Salvar Casa"/"Salvar Trabalho" — isso
 * depende de uma fonte real de "lugar salvo" (API do usuário, ainda não existe) e por isso não
 * foi fabricado aqui; quem montar os `items` decide o rótulo que mostra hoje.
 */
export const QuickAccessGrid = memo(function QuickAccessGrid({ items }: QuickAccessGridProps) {
  return (
    <View style={styles.row}>
      {items.map(({ key, ...item }) => (
        <QuickAccessButton key={key} {...item} />
      ))}
    </View>
  );
});

function QuickAccessButton({ label, icon, onPress, mock }: Omit<QuickAccessItem, 'key'>) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={mock ? `${label}, recurso de demonstração` : label}
      style={[styles.pressable, focusVisible && TILE_FOCUS_RING]}
    >
      {({ pressed }) => (
        <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.icon}>{icon}</View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {mock ? (
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
  cardPressed: { opacity: 0.85 },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption') },
  mockTag: { marginTop: 2 },
});
