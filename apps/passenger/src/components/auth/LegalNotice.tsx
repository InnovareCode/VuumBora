import { memo } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LinkButton, theme, textStyle } from '@vuumbora/ui';
import { LEGAL_ROUTE, useLegalDocuments } from '../../legal/legalDocuments';

/**
 * "Ao continuar, você concorda com nossos Termos de Uso e Política de Privacidade" (P01-boas-vindas.webp), com os
 * dois documentos a um toque. Os links ficam numa linha própria (cada um com alvo de 44pt): um link no meio da frase
 * mede ~17pt. O aceite que vale é o do cadastro (duas caixas, cada uma com o texto) — esta linha só informa e leva.
 */
export const LegalNotice = memo(function LegalNotice() {
  const legal = useLegalDocuments();

  return (
    <View style={styles.root}>
      <Text style={styles.text}>Ao continuar, você concorda com nossos Termos de Uso e Política de Privacidade.</Text>
      <View style={styles.links}>
        <LinkButton
          label={legal.documents.terms.title}
          onPress={() => router.push(LEGAL_ROUTE.terms)}
          testID="legal-terms-link"
        />
        <LinkButton
          label={legal.documents.privacy.title}
          onPress={() => router.push(LEGAL_ROUTE.privacy)}
          testID="legal-privacy-link"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['1'] },
  text: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: theme.spacing['2'] },
});
