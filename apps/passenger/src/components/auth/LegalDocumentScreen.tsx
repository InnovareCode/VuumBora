import { StyleSheet, Text, View } from 'react-native';
import { AppShell, MockBadge, ScreenHeader, SecondaryButton, theme, textStyle } from '@vuumbora/ui';
import { useLegalDocuments, type LegalKind } from '../../legal/legalDocuments';
import { goBackOr } from '../../navigation/goBack';

export interface LegalDocumentScreenProps {
  readonly kind: LegalKind;
  readonly testID: string;
}

/**
 * Texto de um documento legal (Termos de Uso / Política de Privacidade). É público: abre antes da conta existir.
 * O que aparece (texto, versão) vem TODO de `useLegalDocuments` — esta tela não sabe se o texto é provisório ou do
 * servidor (B3). Texto provisório é marcado como tal, com selo e sem número de versão inventado.
 */
export function LegalDocumentScreen({ kind, testID }: LegalDocumentScreenProps) {
  const legal = useLegalDocuments();
  const document = legal.documents[kind];

  return (
    <AppShell scroll testID={testID}>
      <View style={styles.content}>
        <ScreenHeader title={document.shortTitle} onBack={() => goBackOr('/cadastro')} />

        <Text style={styles.title} accessibilityRole="header">
          {document.title}
        </Text>

        <View style={styles.meta}>
          {document.provisional ? (
            <MockBadge label="texto provisório" testID={`${testID}-provisional`} />
          ) : (
            <Text style={styles.version} testID={`${testID}-version`}>
              Versão {document.version}
            </Text>
          )}
        </View>

        <View style={styles.body}>
          {document.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>

        <SecondaryButton label="Voltar" onPress={() => goBackOr('/cadastro')} testID={`${testID}-back-button`} />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  meta: { alignItems: 'flex-start' },
  version: { color: theme.role.textSecondary, ...textStyle('medium', 'small') },
  body: { gap: theme.spacing['3'] },
  paragraph: { color: theme.role.textPrimary, ...textStyle('regular', 'body') },
});
