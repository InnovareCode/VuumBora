import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MockBadge, VerifiedTextView, theme, textStyle } from '@vuumbora/ui';
import type { LegalDocumentView } from '../../legal/legalDocuments';

export interface LegalDocumentBodyProps {
  readonly document: LegalDocumentView;
  readonly testID: string;
}

/**
 * Versão + texto de UM documento legal, a partir do que `legalDocuments.ts` entregou (nunca de constante da tela).
 * Usada na tela pública do documento (`/termos`, `/privacidade`) e na tela de reaceite, que abre o mesmo texto sem
 * rota (as rotas de `(auth)` não existem com sessão).
 *
 *  - texto PROVISÓRIO (fonte = mock): mostra o texto marcado, com o selo "texto provisório"; não baixa nada;
 *  - texto real (fonte = API): `VerifiedTextView` baixa o arquivo da `url` daquela versão, confere o SHA-256 dos bytes
 *    com o `sha256` da MESMA resposta e só então o mostra, dentro do app (B-6 da revisão de segurança). Divergiu ou não
 *    deu para conferir: aviso claro e nenhum trecho do texto. NADA abre o endereço no navegador do sistema — o que o
 *    navegador mostraria seria o que o servidor entregar NAQUELE momento, não o que foi conferido.
 */
export const LegalDocumentBody = memo(function LegalDocumentBody({ document, testID }: LegalDocumentBodyProps) {
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
        // `key` pela versão+hash: uma troca de versão com a tela aberta (409 no cadastro) recomeça a conferência do zero.
        <VerifiedTextView
          key={`${document.version}|${document.sha256}`}
          url={document.url}
          sha256={document.sha256}
          allowHttp={__DEV__}
          testID={`${testID}-body`}
        />
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
