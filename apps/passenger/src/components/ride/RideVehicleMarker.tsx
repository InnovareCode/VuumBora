import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Car } from 'lucide-react-native';
import { theme } from '@vuumbora/ui';

/**
 * Carro do motorista sobre o mapa (P08/P09) — posição ESTÁTICA e decorativa: não existe
 * posição real nem interpolação (pendência da Vega/C-12, ver ficha P08 §9/§10). Quem ancora
 * este marcador num ponto do mapa é o CHAMADOR (`position: absolute` em volta dele).
 */
export const RideVehicleMarker = memo(function RideVehicleMarker() {
  return (
    <View style={styles.root} accessible={false} importantForAccessibility="no-hide-descendants">
      <Car size={18} color={theme.role.textPrimary} strokeWidth={2} />
    </View>
  );
});

const SIZE = 32;

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: theme.role.glassOnMap,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: theme.elevation['2'],
  },
});
