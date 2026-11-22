/**
 * VerifiedTextView — mostra um texto remoto SÓ depois de conferido (B-6): baixa, calcula o SHA-256 dos bytes e compara com
 * o publicado pela API. Três estados, como o resto do app: carregando, conferido (o texto) e falha (aviso com a causa em
 * português e, quando repetir pode resolver, "Tentar de novo"). Em falha NENHUM trecho do texto aparece.
 *
 * A lógica (baixar, conferir, memória dos já conferidos) está em `device/useVerifiedText.ts` + `device/verifiedText.ts`;
 * os textos de erro, em `device/verifyFailureCopy.ts`. Aqui só há a apresentação.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { InlineAlert } from './InlineAlert';
import { LoadingSkeleton } from './LoadingSkeleton';
import { SecondaryButton } from './SecondaryButton';
import { textStyle } from './typography';
import { describeVerifyFailure } from './device/verifyFailureCopy';
import { useVerifiedText } from './device/useVerifiedText';
import { textToParagraphs } from './device/verifiedText';

export interface VerifiedTextViewProps {
  /** `url` do documento, da PRÓPRIA resposta da API. */
  readonly url: string;
  /** `sha256` do mesmo documento, da mesma resposta. */
  readonly sha256: string;
  /** Passe `__DEV__`: em produção só `https`. */
  readonly allowHttp: boolean;
  /**
   * Sufixos usados: `-loading`, `-text`, `-verified`, `-failed`, `-retry-button`. O texto de cada parágrafo fica em
   * `-text` (um só nó de texto por parágrafo).
   */
  readonly testID: string;
}

export const VerifiedTextView = memo(function VerifiedTextView({ url, sha256, allowHttp, testID }: VerifiedTextViewProps) {
  const result = useVerifiedText({ url, sha256, allowHttp });

  if (result.status === 'loading') {
    return (
      <View style={styles.loading} testID={`${testID}-loading`}>
        <Text style={styles.muted} accessibilityLiveRegion="polite">
          Carregando o texto…
        </Text>
        <LoadingSkeleton lines={4} />
      </View>
    );
  }

  if (result.status === 'failed') {
    const view = describeVerifyFailure(result.reason);
    return (
      <InlineAlert tone="danger" title={view.title} message={view.message} testID={`${testID}-failed`}>
        {view.retryable ? <SecondaryButton label="Tentar de novo" onPress={result.retry} testID={`${testID}-retry-button`} /> : null}
      </InlineAlert>
    );
  }

  const paragraphs = textToParagraphs(result.text);
  return (
    <View style={styles.body}>
      <View style={styles.body} testID={`${testID}-text`}>
        {paragraphs.map((paragraph, index) => (
          // O texto é imutável por versão: a posição identifica o parágrafo (o conteúdo pode se repetir).
          <Text key={index} style={styles.paragraph} selectable>
            {paragraph}
          </Text>
        ))}
      </View>
      <Text style={styles.muted} testID={`${testID}-verified`}>
        Texto conferido com a versão publicada.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  loading: { gap: theme.spacing['3'] },
  body: { gap: theme.spacing['3'] },
  paragraph: { color: theme.role.textPrimary, ...textStyle('regular', 'body') },
  muted: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
