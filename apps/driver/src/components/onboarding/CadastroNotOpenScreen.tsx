import { StyleSheet, View } from 'react-native';
import { AppShell, ScreenHeader, theme } from '@vuumbora/ui';
import { goBackOr } from '../../navigation/goBack';
import { useSummaryAction } from '../../onboarding/useSummaryAction';
import { notStartedSummary, type NotStartedReason } from '../../onboarding/verificationModel';
import { VerificationStatusCard } from './VerificationStatusCard';

/**
 * O que uma tela do cadastro (etapa 2, veículo, documento) mostra quando o cadastro NÃO existe para a conta (build
 * sem o cadastro, ou vínculo recusado) e a pessoa chegou por link direto: o mesmo cartão "ainda não aberto" da Home,
 * em vez de um formulário cujo envio não teria para onde ir.
 */
export function CadastroNotOpenScreen({ title, reason, testID }: { readonly title: string; readonly reason: NotStartedReason; readonly testID: string }) {
  const summaryAction = useSummaryAction();
  return (
    <AppShell scroll glow testID={testID}>
      <View style={styles.content}>
        <ScreenHeader title={title} onBack={() => goBackOr('/')} />
        <VerificationStatusCard
          summary={notStartedSummary(reason)}
          onAction={summaryAction.run}
          actionLoading={summaryAction.busy}
          testID={`${testID}-nao-aberto`}
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
});
