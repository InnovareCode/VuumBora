import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InlineAlert, MockBadge, SecondaryButton, theme, textStyle } from '@vuumbora/ui';
import { openLegalDocument, type LegalDocumentView } from '../../legal/legalDocuments';

export interface LegalDocumentBodyProps {
  readonly document: LegalDocumentView;
  readonly testID: string;
}

/**
 * Versão + texto de UM documento legal, a partir do que `legalDocuments.ts` entregou (nunca de constante da tela).
 * Usada na tela pública do documento (`/termos`, `/privacidade`) e na tela de reaceite, que abre o mesmo texto sem
 * rota (as rotas de `(auth)` não existem com sessão).
 *
 *  - texto PROVISÓRIO (fonte = mock): mostra o texto marcado, com o selo "texto provisório";
 *  - texto real (fonte = API): o texto completo vive na `url` daquela versão; o botão a abre. A tela não finge que o
 *    texto está aqui dentro. A conferência do SHA-256 antes de abrir é da A3 (ver `openLegalDocument`).
 */
export const LegalDocumentBody = memo(function LegalDocumentBody({ document, testID }: LegalDocumentBodyProps) {
  const [openFailed, setOpenFailed] = useState(false);

  async function handleOpen() {
    setOpenFailed(false);
    const result = await openLegalDocument(document);
    if (result === 'unavailable') setOpenFailed(true);
  }

  return (
    <View style={styles.root}>
      <View style={styles.meta}>
        {document.provisional ? <MockBadge label="texto provisório" testID={`${testID}-provisional`} /> : null}
        <Text style={styles.version} testID={`${testID}-version`}>
          Versão {document.version}
        </Text>
      </View>

      {document.provisional ? (
        <View style={styles.body}>
          {document.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.paragraph}>O texto completo desta versão fica num endereço próprio e abre no seu navegador.</Text>
          <SecondaryButton label="Abrir o texto completo" onPress={() => void handleOpen()} testID={`${testID}-open-button`} />
          {openFailed ? (
            <InlineAlert
              tone="danger"
              title="Não foi possível abrir o texto"
              message="Confira sua conexão e tente de novo."
              testID={`${testID}-open-failed`}
            />
          ) : null}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['5'] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: theme.spacing['3'], rowGap: theme.spacing['2'] },
  version: { color: theme.role.textSecondary, ...textStyle('medium', 'small') },
  body: { gap: theme.spacing['3'] },
  paragraph: { color: theme.role.textPrimary, ...textStyle('regular', 'body') },
});
