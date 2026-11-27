import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DangerButton, MockBadge, SurfaceRaised, theme, textStyle, tabularNums } from '@vuumbora/ui';
import { DriverInfoCard } from '../assignedDriver/DriverInfoCard';
import { EmergencyCallRow } from './EmergencyCallRow';
import type { AssignedDriverInfo } from '../../data/mockDriverAssignment';
import { formatElapsedClock } from '../../utils/time';

export type AssignedDriverSubphase = 'driver_assigned' | 'driver_en_route' | 'driver_arrived';

export interface AssignedDriverPanelProps {
  readonly subphase: AssignedDriverSubphase;
  readonly driver: AssignedDriverInfo;
  readonly pickupEtaMinutes?: number | undefined;
  readonly waitingSeconds: number;
  /**
   * PIN de embarque (D-12, decidido pelo dono em 22/11/2026): `PassengerTripSnapshot.pickupCode`,
   * que o contrato só entrega de `driver_assigned` a `driver_arrived`. Nunca fabricado aqui: sem
   * valor, o bloco do código não aparece (mesma regra da PP-15, "sem destino real não entra").
   */
  readonly embarkCode?: string | undefined;
  readonly cancellable: boolean;
  readonly onCancelPress: () => void;
  readonly testID?: string;
}

const SUBPHASE_LABEL: Record<AssignedDriverSubphase, string> = {
  driver_assigned: 'Motorista encontrado',
  driver_en_route: 'Motorista a caminho',
  driver_arrived: 'Seu motorista chegou',
};

function headline(subphase: AssignedDriverSubphase, driver: AssignedDriverInfo, pickupEtaMinutes: number | undefined): string {
  if (subphase === 'driver_arrived') return `Confira a placa ${driver.plate}`;
  if (pickupEtaMinutes === undefined) return 'Chegando ao embarque';
  if (pickupEtaMinutes <= 0) return 'Chega em menos de 1 min';
  return `Chega em ${pickupEtaMinutes} min`;
}

/**
 * Painel da P08 (ficha §2/§3/§5) — motorista atribuído, nas 3 subfases (atribuído → a caminho →
 * chegou) num layout só, que só muda a linha de cima e o N2 (ficha: "Três subfases, um
 * layout"). Sem faixa de distância/pagamento (PP-12: o contrato não tem a distância até o
 * embarque — nunca fabricada aqui).
 *
 * Ligar/Mensagem pro MOTORISTA continuam fora (decisão 11, canal de contato mascarado, ainda
 * sem data): um botão sem ação real é pior que nenhum (G-19). "Ligar 190" (PP-11) já está
 * decidido e entrou (`EmergencyCallRow`) — a ligação de emergência é independente do contato
 * com o motorista.
 *
 * `embarkCode` (D-12): vem de `snapshot.pickupCode` pela store; o bloco só aparece na chegada do
 * motorista, quando o passageiro precisa dizer o código.
 */
export const AssignedDriverPanel = memo(function AssignedDriverPanel({
  subphase,
  driver,
  pickupEtaMinutes,
  waitingSeconds,
  embarkCode,
  cancellable,
  onCancelPress,
  testID,
}: AssignedDriverPanelProps) {
  return (
    <View style={styles.content} testID={testID}>
      <Text style={styles.subphase}>{SUBPHASE_LABEL[subphase]}</Text>
      <Text style={styles.headline} accessibilityRole="header">
        {headline(subphase, driver, pickupEtaMinutes)}
      </Text>

      <DriverInfoCard driver={driver} testID="assigned-driver-card" />

      {subphase === 'driver_arrived' ? (
        <Text style={styles.waiting}>
          Aguardando você há <Text style={tabularNums}>{formatElapsedClock(waitingSeconds)}</Text>
        </Text>
      ) : null}

      {subphase === 'driver_arrived' && embarkCode ? (
        <SurfaceRaised style={styles.embarkCard} testID="embark-code-card">
          <Text style={styles.embarkLabel}>Seu código de embarque</Text>
          <Text style={styles.embarkCode} accessibilityLabel={`Código de embarque ${embarkCode.split('').join(' ')}`}>
            {embarkCode.split('').join('  ')}
          </Text>
          <Text style={styles.embarkHint}>Diga ao motorista antes de entrar no carro.</Text>
        </SurfaceRaised>
      ) : null}

      <MockBadge label="corrida simulada" testID="assigned-driver-mock-badge" />

      {/* Antes do cancelar na ordem de foco (ficha §8): quem navega por teclado não precisa
          passar por uma ação destrutiva pra chegar na emergência. */}
      <EmergencyCallRow testID="assigned-driver-emergency-row" />

      {cancellable ? (
        <DangerButton
          label="Cancelar corrida"
          onPress={onCancelPress}
          accessibilityLabel="Cancelar corrida com motorista a caminho"
          testID="cancel-ride-button"
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  content: { gap: theme.spacing['3'] },
  subphase: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
  headline: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums },
  waiting: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
  embarkCard: {
    alignItems: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['1'],
  },
  embarkLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  embarkCode: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums, letterSpacing: 2 },
  embarkHint: { color: theme.role.textSecondary, ...textStyle('regular', 'caption'), textAlign: 'center' },
});
