import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SurfaceRaised, theme, textStyle } from '@vuumbora/ui';

export interface QuickActionItem {
  readonly key: string;
  readonly label: string;
  readonly subtitle: string;
  readonly icon: ReactNode;
  readonly onPress?: () => void;
}

export interface QuickActionsRowProps {
  readonly items: readonly QuickActionItem[];
}

/** Três atalhos (Navegar, Histórico, Suporte) — ações de navegação, não dado fabricado (sem MockBadge). */
export const QuickActionsRow = memo(function QuickActionsRow({ items }: QuickActionsRowProps) {
  return (
    <View style={styles.row}>
      {items.map(({ key, label, subtitle, icon, onPress }) => (
        <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${subtitle}`} style={styles.flexFill}>
          {({ pressed }) => (
            <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>
              <View style={styles.icon}>{icon}</View>
              <Text style={styles.label} numberOfLines={1}>
                {label}
              </Text>
              {/* 2 linhas (não 1): medido (Playwright, 320px) que "Ajuda e contato"
                  (89px) não cabia nos 80px de conteúdo do card mais estreito (3
                  colunas) — mesmo ajuste já usado no QuickAccessGrid do passageiro. */}
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            </SurfaceRaised>
          )}
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  flexFill: { flex: 1 },
  card: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2) — mesmo tratamento do
    // QuickAccessGrid do passageiro, trocando a borda flat que este card ainda usava.
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingVertical: theme.spacing['3'],
    paddingHorizontal: theme.spacing['1'],
    alignItems: 'center',
    gap: 4,
  },
  cardPressed: { opacity: 0.85 },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption'), textAlign: 'center' },
  subtitle: { color: theme.role.textMuted, ...textStyle('regular', 'caption'), textAlign: 'center' },
});
