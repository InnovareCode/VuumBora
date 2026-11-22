import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { theme } from '@vuumbora/tokens';

/**
 * Página de verificação de infraestrutura — NÃO é tela de produto.
 * Prova que o Mapbox GL JS carrega de verdade no alvo web (é por onde a
 * equipe revisa telas). A camada de UI definitiva do mapa é outra missão;
 * este arquivo é descartável quando a prova deixar de ser necessária.
 */
const token = process.env['EXPO_PUBLIC_MAPBOX_TOKEN'] ?? '';

export default function MapboxCheckScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('carregando');

  useEffect(() => {
    if (!containerRef.current) return;
    if (!token) {
      setStatus('erro: EXPO_PUBLIC_MAPBOX_TOKEN ausente');
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-46.6333, -23.5505],
      zoom: 12,
    });

    map.on('load', () => setStatus('mapa carregado'));
    map.on('error', (event) => setStatus(`erro: ${event.error?.message ?? 'desconhecido'}`));

    return () => map.remove();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label} testID="mapbox-check-status">
        status: {status}
      </Text>
      <div ref={containerRef} data-testid="mapbox-check-map" style={{ flex: 1, width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.role.screen },
  label: { color: theme.role.textPrimary, padding: 12, fontSize: 12 },
});
