import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AppShell,
  ConsentCheckbox,
  DateInput,
  FooterActions,
  InlineAlert,
  LinkButton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SectionHeader,
  TextInput,
  brazilianDateToIso,
  theme,
  textStyle,
} from '@vuumbora/ui';
import type { DriverOnboardingErrorCode } from '@vuumbora/api-client/driver';
import { CadastroNotOpenScreen } from '../../../src/components/onboarding/CadastroNotOpenScreen';
import { fieldErrorProps } from '../../../src/lib/fieldErrorProps';
import { useFocusAfterRender } from '../../../src/lib/focusAfterRender';
import { goBackOr } from '../../../src/navigation/goBack';
import { getOnboardingClient } from '../../../src/onboarding/onboardingClient';
import { describeOnboardingError, type OnboardingErrorView } from '../../../src/onboarding/onboardingErrors';
import { refreshOnboarding, useOnboardingStore } from '../../../src/onboarding/onboardingStore';
import { useOnboarding } from '../../../src/onboarding/useOnboarding';
import { useSummaryAction } from '../../../src/onboarding/useSummaryAction';
import {
  CNH_CATEGORIES,
  driverProfileSchema,
  maskCpf,
  maskPostalCode,
  onlyDigits,
  type DriverProfileFormValues,
} from '../../../src/schemas/onboardingSchemas';
import { useSession } from '../../../src/session/SessionProvider';

type CnhCategory = (typeof CNH_CATEGORIES)[number];

const EMPTY: DriverProfileFormValues = {
  cpf: '',
  birthDate: '',
  cnhNumber: '',
  cnhCategory: '',
  cnhExpiresOn: '',
  cnhEar: false,
  postalCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

/** Só desenvolvimento (`?devErro=`): formulário preenchido para a resposta do servidor ser o que se vê. */
const DEV_SAMPLE: DriverProfileFormValues = {
  cpf: '529.982.247-25',
  birthDate: '10/05/1990',
  cnhNumber: '12345678901',
  cnhCategory: 'B',
  cnhExpiresOn: '01/01/2030',
  cnhEar: true,
  postalCode: '59075-000',
  street: 'Rua de Exemplo',
  number: '100',
  complement: '',
  neighborhood: 'Lagoa Nova',
  city: 'Natal',
  state: 'RN',
};

const DEV_ERRORS: readonly (DriverOnboardingErrorCode | 'network')[] = [
  'invalid_cpf',
  'cnh_without_ear',
  'invalid_body',
  'driver_not_linked',
  'unavailable',
  'rate_limited',
  'network',
];

/** Campo do contrato (`fields` do erro) → campo do formulário. */
const FORM_FIELD_BY_CONTRACT: Readonly<Record<string, keyof DriverProfileFormValues>> = {
  cpf: 'cpf',
  'cnh.ear': 'cnhEar',
};

/**
 * M02, etapa 2 (fatia D6) — dados do motorista para o cadastro: CPF, data de nascimento, CNH (número, categoria,
 * validade, observação EAR) e endereço. `PUT /v1/driver/onboarding` (`DriverOnboardingPort.saveOnboarding`).
 *
 * O aparelho confere só o FORMATO (o mesmo `400 invalid_body` do servidor, `onboardingSchemas.ts`); a regra é do
 * servidor e cada recusa tem texto próprio: `invalid_cpf` e `cnh_without_ear` vão para o campo, o resto vira aviso no
 * rodapé com a ação do `code`. Salvou: segue para o veículo (se faltar) ou volta à lista.
 *
 * O contrato não devolve o que já foi salvo (não há leitura da etapa 2): quem volta aqui vê o formulário vazio e um
 * aviso de que enviar de novo SUBSTITUI o anterior (é `PUT`). Os dados ficam só no formulário (estado local).
 */
export default function CadastroDadosScreen() {
  const { mode: sessionMode, signOut } = useSession();
  const { view } = useOnboarding();
  const summaryAction = useSummaryAction();
  const { devErro } = useLocalSearchParams<{ devErro?: string }>();
  const devError = __DEV__ && DEV_ERRORS.find((code) => code === devErro);

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: OnboardingErrorView; readonly attempt: number } | null>(null);
  const alertRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();

  const { control, handleSubmit, setError, setFocus, formState } = useForm<DriverProfileFormValues>({
    resolver: zodResolver(driverProfileSchema),
    // `cnh_without_ear`: o exemplo vai SEM a observação EAR, que é o caso em que o servidor responde isso.
    defaultValues: devError ? { ...DEV_SAMPLE, cnhEar: devError !== 'cnh_without_ear' } : EMPTY,
    mode: 'onBlur',
  });
  const { errors, submitCount } = formState;
  const alreadySent = view.status === 'ready' && view.verification.onboarding.profileSubmitted;

  async function onSubmit(values: DriverProfileFormValues) {
    const client = getOnboardingClient();
    const birthDate = brazilianDateToIso(values.birthDate);
    const expiresOn = brazilianDateToIso(values.cnhExpiresOn);
    if (!client || submitting || birthDate === null || expiresOn === null) return;
    setFailure(null);
    setSubmitting(true);
    const complement = values.complement.trim();
    const result = await client.port
      .saveOnboarding({
        cpf: values.cpf,
        birthDate,
        address: {
          street: values.street.trim(),
          number: values.number.trim(),
          ...(complement !== '' ? { complement } : {}),
          neighborhood: values.neighborhood.trim(),
          city: values.city.trim(),
          state: values.state.trim().toUpperCase(),
          postalCode: onlyDigits(values.postalCode, 8),
        },
        cnh: {
          number: values.cnhNumber,
          category: values.cnhCategory.toUpperCase().replace(/\s/g, '') as CnhCategory,
          expiresOn,
          ear: values.cnhEar,
        },
      })
      .catch(() => ({ ok: false as const, error: { kind: 'unknown' as const, message: 'Falha inesperada.' } }));

    if (result.ok) {
      await refreshOnboarding();
      setSubmitting(false);
      const current = useOnboardingStore.getState().view;
      if (current.status === 'ready' && !current.verification.onboarding.vehicleRegistered) {
        router.replace('/cadastro/veiculo');
      } else {
        goBackOr('/cadastro');
      }
      return;
    }

    setSubmitting(false);
    const errorView = describeOnboardingError('profile', result.error);
    const formField = errorView.field !== undefined ? FORM_FIELD_BY_CONTRACT[errorView.field] : undefined;
    if (formField) {
      setError(formField, { type: 'server', message: errorView.message });
      focusAfterRender(() => setFocus(formField));
      return;
    }
    setFailure((previous) => ({ view: errorView, attempt: (previous?.attempt ?? 0) + 1 }));
    focusAfterRender(() => alertRef.current?.focus());
  }

  const submit = handleSubmit(onSubmit);

  function handleFailureAction(errorView: OnboardingErrorView) {
    if (errorView.action === 'retry') void submit();
    else if (errorView.action === 'go_home') router.replace('/');
    else if (errorView.action === 'sign_in') void signOut();
    else if (errorView.action === 'refresh') void refreshOnboarding();
    else if (errorView.action === 'support') summaryAction.run({ to: 'support' });
    else if (errorView.action === 'go_vehicle') router.push('/cadastro/veiculo');
  }

  // Só desenvolvimento: `?devErro=<code>` faz o servidor simulado recusar o PRÓXIMO envio com esse código e envia
  // o formulário de exemplo uma vez — é como a ferramenta de qualidade de tela fotografa cada erro sem clicar.
  const devFired = useRef(false);
  useEffect(() => {
    if (!__DEV__ || !devError || devFired.current) return;
    const client = getOnboardingClient();
    if (!client || view.status !== 'ready') return;
    devFired.current = true;
    client.control.failNext(devError);
    void submit();
  }, [devError, view.status, submit]);

  const invalidCount = Object.keys(errors).length;
  const showSummary = submitCount > 0 && invalidCount > 0 && failure === null && !submitting;

  if (view.status === 'not_started') return <CadastroNotOpenScreen title="Seus dados" reason={view.reason} testID="cadastro-dados-screen" />;

  return (
    <AppShell
      scroll
      glow
      testID="cadastro-dados-screen"
      footer={
        <FooterActions testID="cadastro-dados-footer">
          {failure ? (
            <InlineAlert
              key={failure.attempt}
              tone="danger"
              message={failure.view.message}
              focusRef={alertRef}
              testID={`cadastro-dados-erro-${failure.view.key}`}
            >
              {failure.view.actionLabel !== undefined && failure.view.action !== 'none' ? (
                <LinkButton
                  label={failure.view.actionLabel}
                  role="button"
                  align="flex-start"
                  onPress={() => handleFailureAction(failure.view)}
                  testID="cadastro-dados-erro-acao"
                />
              ) : null}
            </InlineAlert>
          ) : null}
          {showSummary ? (
            <InlineAlert
              key={submitCount}
              tone="danger"
              message={invalidCount === 1 ? 'Revise o campo destacado.' : `Revise os ${invalidCount} campos destacados.`}
              testID="cadastro-dados-resumo"
            />
          ) : null}
          <PrimaryButton label="Salvar e continuar" onPress={() => void submit()} loading={submitting} testID="cadastro-dados-salvar" />
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <NetworkBanner testID="cadastro-dados-network-banner" />
        <ScreenHeader title="Seus dados" onBack={() => goBackOr('/cadastro')} testID="cadastro-dados-header" />
        <Text style={styles.intro}>Estes dados vão para a análise do seu cadastro de motorista. Confira com a sua CNH em mãos.</Text>

        {alreadySent ? (
          <InlineAlert
            tone="info"
            message="Você já enviou estes dados. Dá para atualizar o endereço; o CPF não muda, e a CNH não muda enquanto estiver em análise ou aprovada."
            announce={false}
            testID="cadastro-dados-ja-enviado"
          />
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Dados pessoais" />
          <Controller
            control={control}
            name="cpf"
            render={({ field, fieldState }) => (
              <TextInput
                label="CPF"
                placeholder="000.000.000-00"
                value={field.value}
                onChangeText={(text) => field.onChange(maskCpf(text))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="number-pad"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('birthDate')}
                testID="cadastro-dados-cpf"
              />
            )}
          />
          <Controller
            control={control}
            name="birthDate"
            render={({ field, fieldState }) => (
              <DateInput
                label="Data de nascimento"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('cnhNumber')}
                testID="cadastro-dados-nascimento"
              />
            )}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader title="CNH" />
          <Controller
            control={control}
            name="cnhNumber"
            render={({ field, fieldState }) => (
              <TextInput
                label="Número da CNH"
                helperText='Os 11 números do campo "Nº registro".'
                value={field.value}
                onChangeText={(text) => field.onChange(onlyDigits(text, 11))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="number-pad"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('cnhCategory')}
                testID="cadastro-dados-cnh-numero"
              />
            )}
          />
          <Controller
            control={control}
            name="cnhCategory"
            render={({ field, fieldState }) => (
              <TextInput
                label="Categoria"
                helperText="B, C, D, E, AB, AC, AD ou AE."
                value={field.value}
                onChangeText={(text) => field.onChange(text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={2}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('cnhExpiresOn')}
                testID="cadastro-dados-cnh-categoria"
              />
            )}
          />
          <Controller
            control={control}
            name="cnhExpiresOn"
            render={({ field, fieldState }) => (
              <DateInput
                label="Validade da CNH"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                inputRef={field.ref}
                testID="cadastro-dados-cnh-validade"
              />
            )}
          />
          <Controller
            control={control}
            name="cnhEar"
            render={({ field, fieldState }) => (
              <ConsentCheckbox
                label="Minha CNH tem a observação EAR (exerce atividade remunerada)"
                checked={field.value}
                onChange={field.onChange}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                checkboxRef={field.ref}
                testID="cadastro-dados-cnh-ear"
              />
            )}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Endereço" />
          <Controller
            control={control}
            name="postalCode"
            render={({ field, fieldState }) => (
              <TextInput
                label="CEP"
                placeholder="00000-000"
                value={field.value}
                onChangeText={(text) => field.onChange(maskPostalCode(text))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="number-pad"
                autoComplete="postal-code"
                textContentType="postalCode"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('street')}
                testID="cadastro-dados-cep"
              />
            )}
          />
          <Controller
            control={control}
            name="street"
            render={({ field, fieldState }) => (
              <TextInput
                label="Rua"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoComplete="address-line1"
                textContentType="streetAddressLine1"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('number')}
                testID="cadastro-dados-rua"
              />
            )}
          />
          <Controller
            control={control}
            name="number"
            render={({ field, fieldState }) => (
              <TextInput
                label="Número"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('complement')}
                testID="cadastro-dados-numero"
              />
            )}
          />
          <Controller
            control={control}
            name="complement"
            render={({ field, fieldState }) => (
              <TextInput
                label="Complemento (opcional)"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoComplete="address-line2"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('neighborhood')}
                testID="cadastro-dados-complemento"
              />
            )}
          />
          <Controller
            control={control}
            name="neighborhood"
            render={({ field, fieldState }) => (
              <TextInput
                label="Bairro"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('city')}
                testID="cadastro-dados-bairro"
              />
            )}
          />
          <Controller
            control={control}
            name="city"
            render={({ field, fieldState }) => (
              <TextInput
                label="Cidade"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                textContentType="addressCity"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('state')}
                testID="cadastro-dados-cidade"
              />
            )}
          />
          <Controller
            control={control}
            name="state"
            render={({ field, fieldState }) => (
              <TextInput
                label="UF"
                helperText="A sigla do estado, com 2 letras."
                value={field.value}
                onChangeText={(text) => field.onChange(text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={2}
                textContentType="addressState"
                inputRef={field.ref}
                testID="cadastro-dados-uf"
              />
            )}
          />
        </View>

        {sessionMode === 'mock' ? <MockBadge label="cadastro simulado, nada é enviado de verdade" testID="cadastro-dados-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  intro: { color: theme.role.textSecondary, ...textStyle('regular', 'body') },
  section: { gap: theme.spacing['4'] },
});
