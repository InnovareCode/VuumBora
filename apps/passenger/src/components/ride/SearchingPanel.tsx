import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Car, Circle, MapPin } from 'lucide-react-native';
import { SLOW_DRIVER_SEARCH_SECONDS, type Place } from '@vuumbora/domain';
import type { FareQuote, RideCategory } from '@vuumbora/api-client/passenger';
import { InlineAlert, LinkButton, MockBadge, MoneyText, PrimaryButton, SurfaceRaised, theme, textStyle, tabularNums, tokens } from '@vuumbora/ui';
import { RouteSummaryRow } from '../confirmation/RouteSummaryRow';
import { categoryName } from '../../utils/rideQuoteFormatting';
import { formatElapsedClock } from '../../utils/time';

export type SearchingPanelStatus = 'searching' | 'failed' | 'cancelled';

export interface SearchingPanelProps {
  readonly status: SearchingPanelStatus;
  readonly origin?: Place | undefined;
  readonly destination?: Place | undefined;
  /** A cotação de fato pedida (preço fechado, D-06). */
  readonly quote?: FareQuote | undefined;
  /** Nomes das categorias do servidor (`GET /v1/categories`); vazio → catálogo de exibição local. */
  readonly categoryInfo?: readonly RideCategory[];
  readonly elapsedSeconds: number;
  readonly driverCancelledNotice: boolean;
  readonly onRetry: () => void;
  readonly onBackHome: () => void;
  readonly testID?: string;
}

/**
 * Painel da P07 (ficha §2/§5/§7) — busca de motorista, com os 3 desfechos possíveis:
 * `searching` (padrão/demorada), `failed` ("nenhum motorista") e `cancelled` (cancelada por
 * terceiros). O pulso sobre o mapa é desenhado por quem chama (`corrida.tsx`), não aqui —
 * este componente é só o conteúdo do painel (sheet).
 *
 * "Cancelar pedido" NÃO mora aqui no estado `searching` — `corrida.tsx` o renderiza no rodapé
 * fixo (`FooterActions`), igual à P08 (achado da Íris, onda 4: ficava abaixo da dobra em
 * 320px). Nos desfechos `failed`/`cancelled` o CTA continua dentro do painel — são telas
 * curtas, sem o problema.
 */
export const SearchingPanel = memo(function SearchingPanel({
  status,
  origin,
  destination,
  quote,
  categoryInfo = [],
  elapsedSeconds,
  driverCancelledNotice,
  onRetry,
  onBackHome,
  testID,
}: SearchingPanelProps) {
  if (status === 'failed') {
    return (
      <View style={styles.outcome} testID={testID}>
        <Text style={styles.outcomeTitle} accessibilityRole="header">
          Nenhum motorista disponível agora
        </Text>
        <Text style={styles.outcomeSupport}>Tente de novo em alguns minutos.</Text>
        <PrimaryButton label="Tentar de novo" onPress={onRetry} accessibilityLabel="Tentar pedir corrida de novo" testID="retry-request-button" />
        <LinkButton label="Voltar ao início" onPress={onBackHome} accessibilityLabel="Voltar para a tela inicial" testID="back-home-link" />
      </View>
    );
  }

  if (status === 'cancelled') {
    return (
      <View style={styles.outcome} testID={testID}>
        <Text style={styles.outcomeTitle} accessibilityRole="header">
          Seu pedido foi cancelado.
        </Text>
        <PrimaryButton label="Voltar ao início" onPress={onBackHome} accessibilityLabel="Voltar para a tela inicial" testID="back-home-button" />
      </View>
    );
  }

  const slow = elapsedSeconds >= SLOW_DRIVER_SEARCH_SECONDS;

  return (
    <View style={styles.content} testID={testID}>
      <Text style={styles.title} accessibilityRole="header">
        Procurando motorista
      </Text>
      <Text style={styles.support}>
        {slow ? 'Está demorando mais que o normal. Você pode continuar esperando ou cancelar.' : 'Avisamos assim que alguém aceitar.'}
        {'  ·  '}
        <Text style={tabularNums}>há {formatElapsedClock(elapsedSeconds)}</Text>
      </Text>

      {driverCancelledNotice ? (
        <InlineAlert tone="info" message="O motorista cancelou. Estamos procurando outro." testID="driver-cancelled-alert" />
      ) : null}

      <SurfaceRaised style={styles.card} testID="searching-summary-card">
        <RouteSummaryRow
          icon={<Circle size={14} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} />}
          label="Origem"
          value={origin?.address ?? 'Sua localização atual'}
          testID="searching-origin"
        />
        <View style={styles.divider} />
        <RouteSummaryRow
          icon={<MapPin size={16} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} />}
          label="Destino"
          value={destination?.address ?? 'Não definido'}
          testID="searching-destination"
        />
        {quote ? (
          <>
            <View style={styles.divider} />
            <View style={styles.categoryRow}>
              <Car size={20} color={theme.role.textSecondary} strokeWidth={1.75} />
              <Text style={styles.categoryName} numberOfLines={1}>
                {categoryName(quote.categorySlug, categoryInfo)}
              </Text>
              <MoneyText value={quote.priceCents / 100} label="Preço" size="body" testID="searching-price" />
            </View>
          </>
        ) : null}
      </SurfaceRaised>
      <MockBadge label="busca de motorista simulada" testID="searching-mock-badge" />
    </View>
  );
});

const styles = StyleSheet.create({
  content: { gap: theme.spacing['3'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  support: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  divider: { height: 1, backgroundColor: theme.role.border },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  categoryName: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  outcome: { gap: theme.spacing['3'], alignItems: 'stretch' },
  outcomeTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  outcomeSupport: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
