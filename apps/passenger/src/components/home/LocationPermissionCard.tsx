import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LocateFixed, LocateOff } from 'lucide-react-native';
import { LinkButton, SecondaryButton, SurfaceRaised, theme, textStyle } from '@vuumbora/ui';

export interface LocationPermissionCardProps {
  /** `ask`: ainda dá para pedir (pré-permissão); `blocked`: a pessoa recusou de vez, só sobra digitar o endereço. */
  readonly variant: 'ask' | 'blocked';
  readonly onAllow: () => void;
  readonly onTypeAddress: () => void;
  readonly testID?: string;
}

/**
 * Pré-permissão da localização (ficha P03 §5, "Permissão negada"; pedido de componente C-06 `PermissionPrompt`, ainda
 * fora do `packages/ui` — local até existir). Explica o porquê ANTES de o sistema perguntar, e sempre oferece o caminho
 * sem localização ("Digitar endereço"): a corrida nunca depende de a pessoa aceitar.
 *
 * "Permitir" é `SecondaryButton`, não o CTA amarelo: na P03 o CTA é a pílula de destino (ficha §3, zero blocos amarelos).
 */
export const LocationPermissionCard = memo(function LocationPermissionCard({ variant, onAllow, onTypeAddress, testID }: LocationPermissionCardProps) {
  const blocked = variant === 'blocked';
  const Icon = blocked ? LocateOff : LocateFixed;
  return (
    <SurfaceRaised style={styles.card} testID={testID}>
      <View style={styles.header}>
        <Icon size={22} color={theme.role.textSecondary} strokeWidth={1.75} />
        <Text style={styles.text} accessibilityRole="header">
          {blocked
            ? 'A localização está bloqueada para o VuumBora. Para usar, libere nas configurações do navegador ou do aparelho.'
            : 'Para achar você no mapa, permita o acesso à localização enquanto usa o app.'}
        </Text>
      </View>
      {blocked ? null : (
        <SecondaryButton label="Permitir" onPress={onAllow} accessibilityLabel="Permitir acesso à localização" {...(testID ? { testID: `${testID}-allow` } : {})} />
      )}
      <LinkButton
        label="Digitar endereço"
        onPress={onTypeAddress}
        align="center"
        role="button"
        accessibilityLabel="Digitar o endereço de partida"
        testID={testID ? `${testID}-type-address` : undefined}
      />
    </SurfaceRaised>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['3'] },
  text: { flex: 1, color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
