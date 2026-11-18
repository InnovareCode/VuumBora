import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, MapView } from '@rnmapbox/maps';
import { theme } from '@vuumbora/tokens';

/**
 * Página de verificação de infraestrutura — NÃO é tela de produto.
 * Prova que o SDK nativo do Mapbox está instalado, configurado e carrega um
 * mapa de verdade (iOS/Android, exige development build — ver docs/mapbox.md).
 * A camada de UI definitiva do mapa é outra missão; este arquivo é descartável
 * quando a prova deixar de ser necessária.
 */
const token = process.env['EXPO_PUBLIC_MAPBOX_TOKEN'] ?? '';
Mapbox.setAccessToken(token);

export default function MapboxCheckScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label} testID="mapbox-check-status">
        status: {token ? 'token presente, renderizando MapView nativo' : 'erro: EXPO_PUBLIC_MAPBOX_TOKEN ausente'}
      </Text>
      <MapView style={styles.map} testID="mapbox-check-map" styleURL={Mapbox.StyleURL.Dark}>
        <Camera zoomLevel={12} centerCoordinate={[-46.6333, -23.5505]} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.role.screen },
  label: { color: theme.role.textPrimary, padding: 12, fontSize: 12 },
  map: { flex: 1 },
});
