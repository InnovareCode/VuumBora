import { StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import { AppShell, ErrorState, LoadingSkeleton, ScreenHeader, SecondaryButton, theme, textStyle } from '@vuumbora/ui';
import { LegalDocumentBody } from '../legal/LegalDocumentBody';
import { LEGAL_LABELS, useLegalDocuments, type LegalKind } from '../../legal/legalDocuments';
import { goBackOr } from '../../navigation/goBack';

export interface LegalDocumentScreenProps {
  readonly kind: LegalKind;
  readonly testID: string;
  /**
   * Para onde ir se não houver histórico de navegação (URL aberta direto). Padrão `/criar-conta`
   * (uso original, público, grupo `(auth)`). A M13 (onda 5) reaproveita este componente DENTRO do
   * grupo `(app)` (`/privacidade-e-termos/termos` e `/privacidade`) — lá o fallback certo é
   * `/privacidade-e-termos`, nunca `/criar-conta` (rota pública que nem monta com sessão ativa).
   */
  readonly backFallback?: Href;
}

/**
 * Texto de um documento legal (Termos de Uso / Política de Privacidade). Compartilhado por DOIS contextos: público
 * (`(auth)/termos`, `(auth)/privacidade`, antes da conta existir) e autenticado (`(app)/privacidade-e-termos/*`, M13) —
 * o texto e a versão vêm sempre de `useLegalDocuments` (mesma cópia que o formulário de criar a conta mostra e envia),
 * só o destino de "Voltar sem histórico" muda (`backFallback`). Três estados, como o formulário: carregando, erro (com
 * "tentar de novo") e pronto. O título é nosso (não depende da API), então aparece nos três.
 */
export function LegalDocumentScreen({ kind, testID, backFallback = '/criar-conta' }: LegalDocumentScreenProps) {
  const legal = useLegalDocuments();
  const labels = LEGAL_LABELS[kind];

  return (
    <AppShell scroll testID={testID}>
      <View style={styles.content}>
        <ScreenHeader title={labels.shortTitle} onBack={() => goBackOr(backFallback)} />

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

        <SecondaryButton label="Voltar" onPress={() => goBackOr(backFallback)} testID={`${testID}-back-button`} />
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
