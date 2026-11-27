import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppShell, BottomTabBar, MockBadge, NetworkBanner, theme } from '@vuumbora/ui';
import { buildDriverTabs } from '../../src/navigation/driverTabs';
import { DriverHeader } from '../../src/components/home/DriverHeader';
import { OnlineToggle } from '../../src/components/home/OnlineToggle';
import { DriverMapPreview } from '../../src/components/home/DriverMapPreview';
import { DailySummarySection } from '../../src/components/home/DailySummarySection';
import { VerificationStatusCard, VerificationStatusCardSkeleton } from '../../src/components/onboarding/VerificationStatusCard';
import { useOnboarding } from '../../src/onboarding/useOnboarding';
import { useSummaryAction } from '../../src/onboarding/useSummaryAction';
import { canGoOnline, loadErrorSummary, notStartedSummary, summarizeVerification } from '../../src/onboarding/verificationModel';
import { useSession } from '../../src/session/SessionProvider';

/**
 * M05 — Painel do motorista (Home), com o cartão de status do cadastro (M04) da fatia D6.
 *
 * O topo da tela é o ESTADO REAL do cadastro de motorista (`GET /v1/driver/verification`, hoje sobre o mock do K0):
 * - carregando: esqueleto (ficha M05 §5: "nunca mostrar 'Offline' antes de saber");
 * - sem cadastro (`not_started`, ou build sem o cadastro): "ainda não aberto" com o fato público;
 * - faltam etapas, em análise (com o prazo que o servidor devolve), correção pedida, suspenso, documento vencido:
 *   o cartão da M04 com a ação de cada um;
 * - aprovado e sem documento vencido: o "Você está offline · Ficar online" (`OnlineToggle`).
 * Isto resolve o Q5 (`docs/veredito-iris-s1-passada-5.md`): a Home não afirma mais "o cadastro só abre depois..." ao
 * lado de um "Online" ou de um "Cadastro em análise" fixos — cada frase só aparece no estado em que é verdade.
 *
 * Ainda de DEMONSTRAÇÃO (com selo): nome e notificações do cabeçalho, as métricas do dia e o "Ficar online" (a regra
 * de quem PODE ficar online é real — `canGoOnline`, a mesma do servidor —, mas a troca de estado continua simulada:
 * `PUT /v1/driver/availability` pede a posição, que é do M5).
 */
export default function DriverHomeScreen() {
  const { mode: sessionMode } = useSession();
  const { view } = useOnboarding();
  const summaryAction = useSummaryAction();
  const [online, setOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const approved = view.status === 'ready' && view.verification.status === 'approved';
  const mayGoOnline = view.status === 'ready' && canGoOnline(view.verification);
  const isOnline = mayGoOnline && online;

  // Sem a rota de disponibilidade ainda (M5): simula a confirmação do servidor antes de comitar o novo estado — a
  // chave e o CTA não mudam otimisticamente (MOTORISTA.md).
  function handleToggleOnline(next: boolean) {
    if (togglingOnline) return;
    setTogglingOnline(true);
    setTimeout(() => {
      setOnline(next);
      setTogglingOnline(false);
    }, 600);
  }

  function renderStatus() {
    switch (view.status) {
      case 'idle':
      case 'loading':
        return <VerificationStatusCardSkeleton testID="home-cadastro-carregando" />;
      case 'error':
        return <VerificationStatusCard summary={loadErrorSummary(view.error)} onAction={summaryAction.run} testID="home-cadastro" />;
      case 'not_started':
        return (
          <VerificationStatusCard
            summary={notStartedSummary(view.reason)}
            onAction={summaryAction.run}
            actionLoading={summaryAction.busy}
            testID="home-cadastro"
          />
        );
      case 'ready':
        if (mayGoOnline) {
          return <OnlineToggle online={isOnline} loading={togglingOnline} onToggle={handleToggleOnline} />;
        }
        return (
          <VerificationStatusCard
            summary={summarizeVerification(view.verification)}
            onAction={summaryAction.run}
            actionLoading={summaryAction.busy}
            testID="home-cadastro"
          />
        );
    }
  }

  const tabs = buildDriverTabs('inicio');

  return (
    // `glow` só sem mapa (§4 do padrão: "nunca sobre mapa ou foto"); com o motorista online a
    // faixa de mapa some com o brilho.
    <AppShell scroll glow={!isOnline} footer={<BottomTabBar items={tabs} activeKey="inicio" testID="driver-tab-bar" />}>
      <View style={styles.content}>
        <NetworkBanner testID="home-network-banner" />
        <DriverHeader driverName="Carlos Santos" notificationCount={3} />
        {sessionMode === 'mock' ? (
          <MockBadge label="acesso simulado, sem autenticação real" testID="simulated-access-badge" />
        ) : null}
        {renderStatus()}
        {isOnline ? <DriverMapPreview cityLabel="São Paulo - SP" /> : null}

        <DailySummarySection
          earningsLabel="R$ 247,90"
          ridesLabel="12"
          ratingLabel="4,95"
          acceptanceLabel="92%"
          approved={approved}
        />
        {/* Selo ÚNICO para o bloco inteiro de métricas (ficha M05 §2/§13: "um só, embaixo da grade"). */}
        <MockBadge label="dados de exemplo" testID="daily-summary-mock-badge" />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
});
