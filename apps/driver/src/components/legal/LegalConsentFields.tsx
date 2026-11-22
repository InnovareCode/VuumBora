import { router } from 'expo-router';
import { Controller, type Control } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { ConsentCheckbox, LoadingSkeleton, MockBadge, theme, textStyle } from '@vuumbora/ui';
import { AuthErrorAlert } from '../auth/AuthErrorAlert';
import { fieldErrorProps } from '../../lib/fieldErrorProps';
import { LEGAL_LABELS, LEGAL_ROUTE, type LegalDocumentsState } from '../../legal/legalDocuments';
import type { ContaFormValues } from '../../schemas/authSchemas';

export interface LegalConsentFieldsProps {
  readonly control: Control<ContaFormValues>;
  readonly legal: LegalDocumentsState;
  readonly disabled: boolean;
}

/**
 * Os dois aceites ao criar a conta (Termos e Política), em três estados:
 *  - carregando / erro: NENHUMA caixa. Marcar um aceite sobre um texto que ainda não está na tela não prova que a
 *    pessoa o viu (M-2) — por isso o botão "Criar conta" também fica desligado nestes dois estados (a tela decide);
 *  - pronto: as duas caixas, cada uma com o link para o texto e a VERSÃO que está sendo aceita ao lado do link.
 * Quem usa desmarca as caixas quando o texto é trocado (409): ver `criar-conta.tsx`.
 */
export function LegalConsentFields({ control, legal, disabled }: LegalConsentFieldsProps) {
  if (legal.status === 'loading') {
    return (
      <View style={styles.root} testID="conta-legal-loading">
        <Text style={styles.loadingText} accessibilityLiveRegion="polite">
          Carregando os Termos de Uso e a Política de Privacidade…
        </Text>
        <LoadingSkeleton lines={2} height={20} />
      </View>
    );
  }

  if (legal.status === 'error') {
    return (
      <View style={styles.root}>
        <AuthErrorAlert view={legal.view} onAction={() => legal.retry()} testID="conta-legal-error" />
      </View>
    );
  }

  const { terms, privacy } = legal.documents;
  return (
    <View style={styles.root}>
      {terms.provisional || privacy.provisional ? (
        <MockBadge label="textos legais provisórios" testID="conta-legal-provisional" />
      ) : null}
      <Controller
        control={control}
        name="termsAccepted"
        render={({ field, fieldState }) => (
          <ConsentCheckbox
            label={LEGAL_LABELS.terms.acceptLabel}
            checked={field.value}
            onChange={field.onChange}
            disabled={disabled}
            {...fieldErrorProps(fieldState.error)}
            linkLabel={LEGAL_LABELS.terms.readLabel}
            linkCaption={`Versão ${terms.version}`}
            onPressLink={() => router.push(LEGAL_ROUTE.terms)}
            checkboxRef={field.ref}
            testID="conta-terms-checkbox"
            linkTestID="conta-terms-link"
          />
        )}
      />
      <Controller
        control={control}
        name="privacyAccepted"
        render={({ field, fieldState }) => (
          <ConsentCheckbox
            label={LEGAL_LABELS.privacy.acceptLabel}
            checked={field.value}
            onChange={field.onChange}
            disabled={disabled}
            {...fieldErrorProps(fieldState.error)}
            linkLabel={LEGAL_LABELS.privacy.readLabel}
            linkCaption={`Versão ${privacy.version}`}
            onPressLink={() => router.push(LEGAL_ROUTE.privacy)}
            checkboxRef={field.ref}
            testID="conta-privacy-checkbox"
            linkTestID="conta-privacy-link"
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: theme.spacing['2'] },
  loadingText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
