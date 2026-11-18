import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppShell, DangerButton, MockBadge, theme, textStyle } from '@vuumbora/ui';
import { SearchingPulse } from '../src/components/search/SearchingPulse';
import { useRideRequestStore } from '../src/store/useRideRequestStore';

/**
 * P07 — Buscando motorista. Sem mockup de referência (derivada do design system).
 *
 * Regra de domínio: "em corrida ativa, a navegação não pode voltar para a escolha de
 * destino". Por isso esta tela não tem botão de voltar no cabeçalho, e a P06 chega até
 * aqui com `router.replace` (não `push`) — a tela de confirmação sai da pilha de
 * navegação, então o botão "voltar" do navegador também não retorna a ela.
 *
 * Busca 100% simulada: nenhuma chamada de rede acontece aqui (sem `PassengerRidePort`
 * implementado ainda — pendência da Vega).
 */
export default function SearchingDriverScreen() {
  const phase = useRideRequestStore((state) => state.phase);
  const destination = useRideRequestStore((state) => state.destination);
  const cancelSearch = useRideRequestStore((state) => state.cancelSearch);

  useEffect(() => {
    // Acesso direto à rota (deep link, atualização de página) sem um pedido em
    // andamento: não há o que buscar, volta para a Home em vez de mostrar um estado inválido.
    if (phase !== 'searching_driver') {
      router.replace('/');
    }
  }, [phase]);

  function handleCancel() {
    cancelSearch();
    router.replace('/');
  }

  if (phase !== 'searching_driver') {
    return <AppShell testID="searching-screen-redirecting">{null}</AppShell>;
  }

  return (
    <AppShell>
      <View style={styles.content}>
        <View style={styles.mockTag}>
          <MockBadge label="busca de motorista simulada" />
        </View>

        <View style={styles.center}>
          <SearchingPulse />
          <Text style={styles.title}>Procurando o motorista mais próximo...</Text>
          {destination ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              Destino: {destination.address}
            </Text>
          ) : null}
        </View>

        <DangerButton
          label="Cancelar corrida"
          onPress={handleCancel}
          accessibilityLabel="Cancelar busca por motorista"
          testID="cancel-search-button"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: theme.spacing['4'] },
  mockTag: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing['4'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'body'), textAlign: 'center' },
});
