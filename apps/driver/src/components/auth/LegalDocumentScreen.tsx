import { StyleSheet, Text, View } from 'react-native';
import { AppShell, ErrorState, LoadingSkeleton, ScreenHeader, SecondaryButton, theme, textStyle } from '@vuumbora/ui';
import { LegalDocumentBody } from '../legal/LegalDocumentBody';
import { LEGAL_LABELS, useLegalDocuments, type LegalKind } from '../../legal/legalDocuments';
import { goBackOr } from '../../navigation/goBack';

export interface LegalDocumentScreenProps {
  readonly kind: LegalKind;
  readonly testID: string;
}

/**
 * Texto de um documento legal (Termos de Uso / Política de Privacidade). É público: abre antes da conta existir.
 * Versão e texto vêm TODOS de `useLegalDocuments` (a mesma cópia que o formulário de criar a conta mostra e envia) —
 * esta tela não sabe se o texto é provisório ou da API. Três estados, como o formulário: carregando, erro (com "tentar
 * de novo") e pronto. O título é nosso (não depende da API), então aparece nos três.
 */
export function LegalDocumentScreen({ kind, testID }: LegalDocumentScreenProps) {
  const legal = useLegalDocuments();
  const labels = LEGAL_LABELS[kind];

  return (
    <AppShell scroll testID={testID}>
      <View style={styles.content}>
        <ScreenHeader title={labels.shortTitle} onBack={() => goBackOr('/criar-conta')} />

        <Text style={styles.title} accessibilityRole="header">
          {labels.title}
        </Text>

        {legal.status === 'ready' ? (
          <LegalDocumentBody document={legal.documents[kind]} testID={testID} />
        ) : legal.status === 'loading' ? (
          <View style={styles.loading} testID={`${testID}-loading`}>
            <Text style={styles.loadingText} accessibilityLiveRegion="polite">
              Carregando o texto…
            </Text>
            <LoadingSkeleton lines={4} />
          </View>
        ) : (
          <ErrorState
            title={legal.view.title ?? 'Não foi possível carregar o texto'}
            description={legal.view.message}
            onRetry={legal.retry}
            retryLabel="Tentar de novo"
            testID={`${testID}-error`}
          />
        )}

        <SecondaryButton label="Voltar" onPress={() => goBackOr('/criar-conta')} testID={`${testID}-back-button`} />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  loading: { gap: theme.spacing['3'] },
  loadingText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
