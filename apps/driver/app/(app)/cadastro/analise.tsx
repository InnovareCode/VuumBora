import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppShell, ErrorState, LoadingSkeleton, MockBadge, NetworkBanner, ScreenHeader, SectionHeader, theme, textStyle } from '@vuumbora/ui';
import { ChecklistItemCard } from '../../../src/components/onboarding/ChecklistItemCard';
import { VerificationStatusCard } from '../../../src/components/onboarding/VerificationStatusCard';
import { goBackOr } from '../../../src/navigation/goBack';
import { useOnboarding } from '../../../src/onboarding/useOnboarding';
import { useSummaryAction } from '../../../src/onboarding/useSummaryAction';
import {
  buildChecklist,
  notStartedSummary,
  summarizeVerification,
  type ChecklistItem,
  type VerificationSummary,
} from '../../../src/onboarding/verificationModel';
import { useSession } from '../../../src/session/SessionProvider';

function openItem(item: ChecklistItem): void {
  if (item.kind === 'profile') router.push('/cadastro/dados');
  else if (item.kind === 'vehicle') router.push('/cadastro/veiculo');
  else router.push({ pathname: '/cadastro/documento', params: { tipo: item.typeCode } });
}

/** O que acontece depois, em uma frase por estado (sem prometer prazo que o servidor não deu). */
const NEXT_STEP: Readonly<Record<string, string>> = {
  pending_documents: 'Quando tudo estiver enviado, a análise começa. Você acompanha cada documento aqui.',
  under_review: 'Quando a análise terminar, o resultado aparece aqui e no painel. Se algum documento precisar de correção, mostramos o motivo.',
  changes_requested: 'Envie de novo o documento recusado. Depois disso, ele volta para a análise.',
  document_expired: 'Enquanto o documento novo não for aprovado, não é possível ficar online.',
  approved: 'Se um documento vencer, ele aparece aqui e no painel como vencido, e é preciso enviar o novo para voltar a ficar online.',
};

/**
 * M04 — análise do cadastro (`docs/fichas-de-tela/M04-analise-cadastral.md`), o detalhe que o cartão da Home abre:
 * "Já posso dirigir? Se não, por quê e o que faço?". O estado é o do servidor (`GET /v1/driver/verification`) e o
 * prazo é o `reviewDeadline` que ele devolve (o app não calcula nem inventa prazo; hoje o valor vem do mock).
 * Embaixo, a mesma lista da M03, para ver de onde vem cada estado.
 */
export default function CadastroAnaliseScreen() {
  const { mode: sessionMode } = useSession();
  const { view, refresh } = useOnboarding();
  const summaryAction = useSummaryAction();

  let summary: VerificationSummary | undefined;
  if (view.status === 'not_started') summary = notStartedSummary(view.reason);
  if (view.status === 'ready') {
    const base = summarizeVerification(view.verification);
    // Já estamos na análise: "Ver análise" vira nada; aprovado ganha a volta ao painel.
    if (base.key === 'under_review') summary = { key: base.key, tone: base.tone, title: base.title, message: base.message };
    else if (base.key === 'approved') summary = { ...base, action: { label: 'Ir para o painel', target: { to: 'home' } } };
    else summary = base;
  }

  const items = view.status === 'ready' ? buildChecklist(view.verification) : [];
  const nextStep = summary ? NEXT_STEP[summary.key] : undefined;

  return (
    <AppShell scroll glow testID="cadastro-analise-screen">
      <View style={styles.content}>
        <NetworkBanner testID="analise-network-banner" />
        <ScreenHeader title="Seu cadastro" onBack={() => goBackOr('/')} testID="analise-header" />

        {view.status === 'idle' || view.status === 'loading' ? (
          <View style={styles.list} testID="analise-carregando">
            <LoadingSkeleton variant="block" height={140} />
            <LoadingSkeleton variant="block" height={76} />
            <LoadingSkeleton variant="block" height={76} />
          </View>
        ) : view.status === 'error' ? (
          <ErrorState
            title="Não foi possível carregar seu cadastro"
            description={view.error.message}
            onRetry={() => void refresh()}
            retryLabel="Tentar de novo"
            testID="analise-erro"
          />
        ) : summary ? (
          <>
            <VerificationStatusCard summary={summary} onAction={summaryAction.run} actionLoading={summaryAction.busy} testID="analise-status" />
            {nextStep ? <Text style={styles.nextStep}>{nextStep}</Text> : null}
            {items.length > 0 ? (
              <View style={styles.list}>
                <SectionHeader title="Etapas e documentos" />
                {items.map((item) => (
                  <ChecklistItemCard key={item.key} item={item} onPress={openItem} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {sessionMode === 'mock' ? <MockBadge label="cadastro simulado, nada é enviado de verdade" testID="analise-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  nextStep: { color: theme.role.textSecondary, ...textStyle('regular', 'body') },
  list: { gap: theme.spacing['3'] },
});
