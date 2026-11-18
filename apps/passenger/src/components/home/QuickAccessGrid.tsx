import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MockBadge, theme, textStyle } from '@vuumbora/ui';

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

/** Linha de atalhos (Casa, Trabalho, Favoritos, Agendar...) — 4 cards de largura igual. */
export const QuickAccessGrid = memo(function QuickAccessGrid({ items }: QuickAccessGridProps) {
  return (
    <View style={styles.row}>
      {items.map(({ key, ...item }) => (
        <QuickAccessButton key={key} {...item} />
      ))}
    </View>
  );
});

function QuickAccessButton({ label, subtitle, icon, onPress, mock }: Omit<QuickAccessItem, 'key'>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={mock ? `${label}, recurso de demonstração` : label}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.icon}>{icon}</View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {/* 2 linhas (não 1): medido (Playwright, fonte real) que "Centro, Natal"/"Ponta
          Negra"/"Meus destinos"/"Escolha data e hora" todos precisam de 2 linhas nos
          66px de conteúdo do card a 360px — 1 linha cortava todos eles. */}
      <Text style={styles.subtitle} numberOfLines={2}>
        {subtitle}
      </Text>
      {mock ? (
        <View style={styles.mockTag}>
          <MockBadge label="demo" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  card: {
    flex: 1,
    minHeight: theme.layout.touchTarget,
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.role.border,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['1'],
    alignItems: 'center',
    gap: 4,
  },
  cardPressed: { backgroundColor: theme.role.surfaceElevated },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption') },
  subtitle: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  mockTag: { marginTop: 2 },
});
