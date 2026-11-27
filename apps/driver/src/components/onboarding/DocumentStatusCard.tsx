import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import {
  StatusBadge,
  SurfaceRaised,
  focusRingStyle,
  theme,
  textStyle,
  useKeyboardFocusRing,
  type StatusBadgeVariant,
} from '@vuumbora/ui';

export interface DocumentStatusCardProps {
  readonly icon: ReactNode;
  /** Nome do item, como veio do contrato (a lista é dado, N1). Quebra linha quanto precisar. */
  readonly title: string;
  /** "Obrigatório" / "Opcional" — a exigência, embaixo do nome (ficha M03 §2). */
  readonly caption: string;
  readonly badgeVariant: StatusBadgeVariant;
  readonly badgeLabel: string;
  readonly onPress: () => void;
  /** Leitura completa do cartão: "CNH com EAR, obrigatório, aprovado. Toque para ver" (ficha M03 §8). */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * C-15 (`DocumentStatusCard`, local do app do motorista): um item do cadastro — etapa ou documento — com o estado.
 * O estado fica EMBAIXO do nome, nunca ao lado (ficha M03 §5, "fonte 200%"), e o selo é o `StatusBadge` do pacote,
 * já tingido. Ícone em `textSecondary` (D-30: a prancha usa amarelo; o amarelo é só da ação).
 */
export const DocumentStatusCard = memo(function DocumentStatusCard({
  icon,
  title,
  caption,
  badgeVariant,
  badgeLabel,
  onPress,
  accessibilityLabel,
  testID,
}: DocumentStatusCardProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={focusVisible ? FOCUS_RING : undefined}
      testID={testID}
    >
      {({ pressed }) => (
        <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.row}>
            <View style={styles.iconBox}>{icon}</View>
            <View style={styles.content}>
              {/* Sem limite de linhas: o nome é dado do servidor (N1) e cortar nome de documento esconde o que pedir. */}
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.caption}>{caption}</Text>
              <View style={styles.badgeRow}>
                <StatusBadge variant={badgeVariant} label={badgeLabel} />
              </View>
            </View>
            <ChevronRight size={20} color={theme.role.textMuted} strokeWidth={1.75} />
          </View>
        </SurfaceRaised>
      )}
    </Pressable>
  );
});

const FOCUS_RING = focusRingStyle('outside', theme.radius.lg);

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['3'],
  },
  cardPressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  caption: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  badgeRow: { flexDirection: 'row', marginTop: theme.spacing['1'] },
});
