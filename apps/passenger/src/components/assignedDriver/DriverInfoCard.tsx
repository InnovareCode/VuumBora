import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Car, Star } from 'lucide-react-native';
import { Avatar, StarRating, SurfaceRaised, theme, textStyle, tabularNums, type StarRatingIconProps } from '@vuumbora/ui';
import type { AssignedDriverInfo } from '../../data/mockDriverAssignment';

// Auditoria F3: estrela em ícone lucide (não mais o glifo ★/☆ do sistema).
const starIcon = ({ filled, size, color }: StarRatingIconProps) => (
  <Star size={size} color={color} fill={filled ? color : 'none'} strokeWidth={1.75} />
);

export interface DriverInfoCardProps {
  readonly driver: AssignedDriverInfo;
  /** `compact` é a versão reduzida usada na corrida em andamento (P09). */
  readonly variant?: 'full' | 'compact';
  readonly testID?: string;
}

/** Dados do motorista atribuído — reutilizado por P08 (completo) e P09 (compacto). */
export const DriverInfoCard = memo(function DriverInfoCard({ driver, variant = 'full', testID }: DriverInfoCardProps) {
  const compact = variant === 'compact';
  return (
    <SurfaceRaised style={[styles.card, compact && styles.cardCompact]} testID={testID}>
      {/* Escala do DS (fichas): P08 = 56, P09 = 40. Antes 'md' (44, fora da escala) e 'sm' (32). */}
      <Avatar name={driver.name} size={compact ? 40 : 56} {...(driver.photoUri !== undefined ? { imageUri: driver.photoUri } : {})} />
      <View style={styles.textBlock}>
        <Text style={styles.name} numberOfLines={1}>
          {driver.name}
        </Text>
        <View style={styles.ratingRow}>
          <StarRating value={driver.rating} size={compact ? 12 : 16} icon={starIcon} {...(testID !== undefined ? { testID: `${testID}-rating` } : {})} />
          <Text style={styles.ratingValue}>{driver.rating.toFixed(1)}</Text>
        </View>
        {!compact ? (
          // numberOfLines={2} (não 1): medido (Playwright, 320px) que "Chevrolet Onix •
          // Branco" não cabe numa linha só no card mais estreito — truncava o modelo.
          <Text style={styles.vehicle} numberOfLines={2}>
            {driver.vehicleModel} • {driver.vehicleColor}
          </Text>
        ) : null}
      </View>
      <View style={styles.plateBlock}>
        <Car size={compact ? 16 : 20} color={theme.role.textSecondary} strokeWidth={1.75} />
        <Text style={styles.plate} numberOfLines={1}>
          {driver.plate}
        </Text>
      </View>
    </SurfaceRaised>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2). Fundo: item 6
    // (`gradient.surface.raised`, ver SurfaceRaised) — era `theme.role.surface` chapado
    // com `theme.role.border` nos 4 lados (auditoria Apolo, item A1/E2).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
  },
  cardCompact: { paddingVertical: theme.spacing['2'] },
  textBlock: { flex: 1, gap: 2 },
  name: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['1'] },
  ratingValue: { color: theme.role.textSecondary, ...textStyle('medium', 'caption'), ...tabularNums },
  vehicle: { color: theme.role.textMuted, ...textStyle('regular', 'small') },
  plateBlock: { alignItems: 'center', gap: 2, maxWidth: 72 },
  // Placa: tabularNums obrigatório (regra do projeto) — dígitos não "dançam" de largura.
  plate: { color: theme.role.textPrimary, ...textStyle('bold', 'small'), ...tabularNums, letterSpacing: 1 },
});
