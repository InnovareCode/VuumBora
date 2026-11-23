import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppShell, ErrorState, LoadingSkeleton, ScreenHeader, SectionHeader, theme, textStyle } from '@vuumbora/ui';
import { LegalDocumentBody } from '../../src/components/legal/LegalDocumentBody';
import { DangerLinkButton } from '../../src/components/shared/DangerLinkButton';
import { useLegalDocuments } from '../../src/legal/legalDocuments';

/**
 * `/privacidade-e-termos` — Privacidade e termos (ficha P13 §2.1: concentra "Segurança e
 * privacidade" + os dois documentos legais + "Excluir conta", em vez de 3 linhas separadas que
 * levariam ao mesmo lugar). Alcançada por Perfil E Configurações (mesmo destino nas duas
 * fichas). Reaproveita `LegalDocumentBody`/`useLegalDocuments` (a MESMA cópia que o cadastro
 * mostra e envia, B3) em vez de `LegalDocumentScreen` (`(auth)/termos.tsx`): aquele componente
 * tem o "voltar" fixo em `/cadastro`, que é o destino errado para quem já tem conta.
 */
export default function PrivacyAndTermsScreen() {
  const legal = useLegalDocuments();

  return (
    <AppShell scroll glow testID="privacy-terms-screen">
      <View style={styles.content}>
        <ScreenHeader title="Privacidade e termos" onBack={() => router.back()} testID="privacy-terms-header" />

        {legal.status === 'loading' ? (
          <View style={styles.loading} testID="privacy-terms-loading">
            <Text style={styles.loadingText} accessibilityLiveRegion="polite">
              Carregando os textos…
            </Text>
            <LoadingSkeleton lines={5} />
          </View>
        ) : legal.status === 'error' ? (
          <ErrorState
            title={legal.view.title ?? 'Não foi possível carregar os textos'}
            description={legal.view.message}
            onRetry={legal.retry}
            retryLabel="Tentar de novo"
            testID="privacy-terms-error"
          />
        ) : (
          <View style={styles.documents}>
            <View style={styles.document}>
              <Text style={styles.documentTitle} accessibilityRole="header">
                Termos de Uso
              </Text>
              <LegalDocumentBody document={legal.documents.terms} testID="privacy-terms-terms" />
            </View>
            <View style={styles.divider} />
            <View style={styles.document}>
              <Text style={styles.documentTitle} accessibilityRole="header">
                Política de Privacidade
              </Text>
              <LegalDocumentBody document={legal.documents.privacy} testID="privacy-terms-privacy" />
            </View>
          </View>
        )}

        <View style={styles.accountSection}>
          <SectionHeader title="Conta" testID="privacy-terms-account-section" />
          <DangerLinkButton label="Excluir conta" onPress={() => router.push('/excluir-conta')} testID="privacy-terms-delete-account" />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  loading: { gap: theme.spacing['3'] },
  loadingText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  documents: { gap: theme.spacing['5'] },
  document: { gap: theme.spacing['3'] },
  documentTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  divider: { height: 1, backgroundColor: theme.role.border },
  accountSection: { gap: theme.spacing['3'], alignItems: 'center' },
});
