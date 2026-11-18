import { memo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { theme, textStyle } from '@vuumbora/ui';
import { UnavailableNoticeBanner } from './UnavailableNoticeBanner';

const NOTICE_MESSAGE =
  'Texto ainda não publicado. Termos de Uso e Política de Privacidade entram antes do lançamento.';

/**
 * Linha "Ao continuar, você concorda com nossos Termos de Uso e Política de
 * Privacidade" (P01-boas-vindas.webp). Nenhum dos dois documentos existe como texto
 * ainda — por isso o toque não abre página vazia, só deixa isso evidente.
 */
export const LegalNotice = memo(function LegalNotice() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Text style={styles.text}>
        Ao continuar, você concorda com nossos{' '}
        <Text
          style={styles.link}
          onPress={() => setVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Termos de Uso — ainda não disponível"
        >
          Termos de Uso
        </Text>{' '}
        e{' '}
        <Text
          style={styles.link}
          onPress={() => setVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Política de Privacidade — ainda não disponível"
        >
          Política de Privacidade
        </Text>
        .
      </Text>
      {visible ? <UnavailableNoticeBanner message={NOTICE_MESSAGE} testID="legal-notice-banner" /> : null}
    </>
  );
});

const styles = StyleSheet.create({
  text: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  link: { color: theme.role.ctaBackground, ...textStyle('semibold', 'small'), textDecorationLine: 'underline' },
});
