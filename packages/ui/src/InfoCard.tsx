import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { SurfaceRaised } from './SurfaceRaised';
import { textStyle } from './typography';

export interface InfoCardProps {
  readonly title: string;
  readonly description?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** Cartão de informação genérico (lista, atalho, resumo). Interativo só quando recebe `onPress`. */
export const InfoCard = memo(function InfoCard({
  title,
  description,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  testID,
}: InfoCardProps) {
  const content = (
    <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) {
    return (
      <SurfaceRaised style={styles.card} testID={testID}>
        {content}
      </SurfaceRaised>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} testID={testID}>
      {({ pressed }) => (
        <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>{content}</SurfaceRaised>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing['4'],
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2, "top-lit edge"): simula
    // luz vinda de cima, é o que separa o card do fundo sem precisar de gradiente forte.
    // Fundo: direção de arte §4/§9 item 6, `gradient.surface.raised` (ver SurfaceRaised).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
  },
  cardPressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  leading: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  title: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), marginTop: theme.spacing['1'] },
  trailing: { marginLeft: theme.spacing['2'] },
});
