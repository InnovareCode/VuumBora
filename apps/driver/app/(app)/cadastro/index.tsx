import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppShell,
  ErrorState,
  FooterActions,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  theme,
  textStyle,
  tabularNums,
} from '@vuumbora/ui';
import { ChecklistItemCard } from '../../../src/components/onboarding/ChecklistItemCard';
import { ProgressBar } from '../../../src/components/onboarding/ProgressBar';
import { VerificationStatusCard } from '../../../src/components/onboarding/VerificationStatusCard';
import { goBackOr } from '../../../src/navigation/goBack';
import { useOnboarding } from '../../../src/onboarding/useOnboarding';
import { useSummaryAction } from '../../../src/onboarding/useSummaryAction';
import {
  buildChecklist,
  checklistProgress,
  nextPendingItem,
  notStartedSummary,
  summarizeVerification,
  type ChecklistItem,
} from '../../../src/onboarding/verificationModel';
import { useSession } from '../../../src/session/SessionProvider';

function openItem(item: ChecklistItem): void {
  if (item.kind === 'profile') router.push('/cadastro/dados');
  else if (item.kind === 'vehicle') router.push('/cadastro/veiculo');
  else router.push({ pathname: '/cadastro/documento', params: { tipo: item.typeCode } });
}

function ctaLabel(item: ChecklistItem): string {
  if (item.kind === 'profile') return 'Preencher seus dados';
  if (item.kind === 'vehicle') return 'Informar o veículo';
  return 'Enviar próximo documento';
}

/**
 * M03 — "Meus documentos" (`docs/fichas-de-tela/M03-veiculo-e-documentos.md`), fatia D6: o que falta para dirigir e em
 * que pé está cada coisa. Lista vinda do servidor (`GET /v1/driver/verification`): as duas etapas da M02 (seus dados e
 * CNH; veículo) e cada documento exigido — nomes e ordem do contrato, nunca de uma lista fixa do app (N1).
 *
 * "Faltam {n} de {total}" conta só o obrigatório que ainda depende do motorista (nunca enviado, correção pedida,
 * vencido); o CTA leva ao próximo e some quando nada falta. Correção pedida e suspensão aparecem no topo com o motivo.
 * A mesma tela serve para manter (M13): com tudo aprovado, cada cartão mostra "Aprovado" e o vencido volta a pedir envio.
 */
export default function CadastroScreen() {
  const { mode: sessionMode } = useSession();
  const { view, refresh } = useOnboarding();
  const summaryAction = useSummaryAction();

  const items = view.status === 'ready' ? buildChecklist(view.verification) : [];
  const progress = checklistProgress(items);
  const next = nextPendingItem(items);
  const verificationStatus = view.status === 'ready' ? view.verification.status : undefined;
  const topSummary =
    view.status === 'ready' && (verificationStatus === 'changes_requested' || verificationStatus === 'suspended')
      ? summarizeVerification(view.verification)
      : undefined;

  const footer =
    view.status !== 'ready' ? undefined : next ? (
      <FooterActions testID="cadastro-footer">
        <PrimaryButton label={ctaLabel(next)} onPress={() => openItem(next)} testID="cadastro-proximo" />
      </FooterActions>
    ) : (
      <FooterActions testID="cadastro-footer">
        <SecondaryButton label="Acompanhar a análise" onPress={() => router.push('/cadastro/analise')} testID="cadastro-ver-analise" />
      </FooterActions>
    );

  return (
    <AppShell scroll glow footer={footer} testID="cadastro-screen">
      <View style={styles.content}>
        <NetworkBanner testID="cadastro-network-banner" />
        <ScreenHeader title="Meus documentos" onBack={() => goBackOr('/')} testID="cadastro-header" />

        {view.status === 'idle' || view.status === 'loading' ? (
          <View style={styles.list} testID="cadastro-carregando" accessibilityLabel="Carregando seus documentos">
            <LoadingSkeleton variant="line" width={140} />
            <LoadingSkeleton variant="block" height={6} />
            {[0, 1, 2, 3].map((index) => (
              <LoadingSkeleton key={index} variant="block" height={76} />
            ))}
          </View>
        ) : view.status === 'error' ? (
          <ErrorState
            title="Não foi possível carregar seus documentos"
            description={view.error.message}
            onRetry={() => void refresh()}
            retryLabel="Tentar de novo"
            testID="cadastro-erro"
          />
        ) : view.status === 'not_started' ? (
          <VerificationStatusCard
            summary={notStartedSummary(view.reason)}
            onAction={summaryAction.run}
            actionLoading={summaryAction.busy}
            testID="cadastro-nao-aberto"
          />
        ) : (
          <>
            {topSummary ? (
              <VerificationStatusCard
                summary={topSummary}
                {...(topSummary.key === 'suspended' ? { onAction: summaryAction.run, actionLoading: summaryAction.busy } : {})}
                testID="cadastro-aviso"
              />
            ) : null}

            <View style={styles.progressBlock}>
              <Text style={styles.progressText} testID="cadastro-progresso-texto">
                {progress.pending === 0 ? 'Tudo enviado' : `Faltam ${progress.pending} de ${progress.total}`}
              </Text>
              <ProgressBar
                fraction={progress.total === 0 ? 1 : (progress.total - progress.pending) / progress.total}
                accessibilityLabel={
                  progress.pending === 0
                    ? 'Todas as etapas do cadastro enviadas'
                    : `Faltam ${progress.pending} de ${progress.total} etapas do cadastro`
                }
                testID="cadastro-progresso"
              />
            </View>

            <View style={styles.list}>
              {items.map((item) => (
                <ChecklistItemCard key={item.key} item={item} onPress={openItem} />
              ))}
            </View>
          </>
        )}

        {sessionMode === 'mock' ? <MockBadge label="cadastro simulado, nada é enviado de verdade" testID="cadastro-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  progressBlock: { gap: theme.spacing['2'] },
  progressText: { color: theme.role.textPrimary, ...textStyle('semibold', 'subtitle'), ...tabularNums },
  list: { gap: theme.spacing['3'] },
});
