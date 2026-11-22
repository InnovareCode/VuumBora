import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Car, MapPin } from 'lucide-react-native';
import { AppShell, DangerButton, MockBadge, SurfaceRaised, theme, textStyle, tabularNums } from '@vuumbora/ui';
import { SearchingPulse } from '../../src/components/search/SearchingPulse';
import { rideCategoryName } from '../../src/data/rideCategoryDisplay';
import { formatQuotePrice } from '../../src/utils/rideQuoteFormatting';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

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
  // A categoria de fato PEDIDA (não a seleção atual, que pode ter mudado) — F08b.
  const category = useRideRequestStore((state) => state.requestedCategory);
  const cancelSearch = useRideRequestStore((state) => state.cancelSearch);

  useEffect(() => {
    if (phase === 'searching_driver') return;
    // O simulador (src/sim/rideSimulator.ts) continua avançando a fase em segundo plano
    // enquanto esta tela está montada — ao sair de 'searching_driver', segue pra tela
    // certa da fase atual em vez de mostrar um estado de busca já ultrapassado.
    if (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') {
      router.replace('/a-caminho');
      return;
    }
    if (phase === 'in_progress') {
      router.replace('/em-andamento');
      return;
    }
    if (phase === 'completed') {
      router.replace('/concluida');
      return;
    }
    // draft/quoted/requested/cancelled/failed: acesso direto à rota (deep link,
    // atualização de página) sem um pedido em andamento — volta para a Home.
    router.replace('/');
  }, [phase]);

  function handleCancel() {
    cancelSearch();
    router.replace('/');
  }

  if (phase !== 'searching_driver') {
    return <AppShell testID="searching-screen-redirecting">{null}</AppShell>;
  }

  return (
    <AppShell glow>
      <View style={styles.content}>
        <View style={styles.mockTag}>
          <MockBadge label="busca de motorista simulada" />
        </View>

        <View style={styles.center}>
          <SearchingPulse />
          <Text style={styles.title}>Procurando o motorista mais próximo...</Text>
        </View>

        {/* Card com destino/categoria (auditoria Apolo S3): no lugar da tela quase vazia
            atrás do pulso, algo que o passageiro pode conferir enquanto espera. */}
        <SurfaceRaised style={styles.infoCard} testID="searching-info-card">
          {destination ? (
            <View style={styles.infoRow}>
              <MapPin size={14} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />
              <Text style={styles.infoText} numberOfLines={2}>
                {destination.address}
              </Text>
            </View>
          ) : null}
          {destination && category ? <View style={styles.infoDivider} /> : null}
          {category ? (
            <View style={styles.infoRow}>
              <Car size={18} color={theme.role.textSecondary} strokeWidth={2} />
              <Text style={styles.infoText} numberOfLines={1}>
                {rideCategoryName(category.categoryId)}
              </Text>
              <Text style={styles.infoPrice} numberOfLines={1}>
                {formatQuotePrice(category)}
              </Text>
            </View>
          ) : null}
        </SurfaceRaised>

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
  // Borda iluminada de cima + gradiente de superfície (direção de arte §4/§9 itens 2/6)
  // — auditoria Apolo item S3: card novo, não existia antes (a tela só tinha decoração).
  infoCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  infoText: { flex: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  infoPrice: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), ...tabularNums },
  infoDivider: { height: 1, backgroundColor: theme.role.edgeBottom },
});
