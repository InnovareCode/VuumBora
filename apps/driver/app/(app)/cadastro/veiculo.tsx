import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AppShell,
  FooterActions,
  InlineAlert,
  LinkButton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  TextInput,
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
import { refreshOnboarding } from '../../../src/onboarding/onboardingStore';
import { useOnboarding } from '../../../src/onboarding/useOnboarding';
import { useSummaryAction } from '../../../src/onboarding/useSummaryAction';
import { maskPlate, onlyDigits, vehicleSchema, type VehicleFormValues } from '../../../src/schemas/onboardingSchemas';
import { useSession } from '../../../src/session/SessionProvider';

const EMPTY: VehicleFormValues = { plate: '', brand: '', model: '', year: '', color: '' };

const DEV_ERRORS: readonly (DriverOnboardingErrorCode | 'network')[] = [
  'plate_in_use',
  'vehicle_too_old',
  'invalid_body',
  'driver_not_linked',
  'unavailable',
  'network',
];

const FORM_FIELD_BY_CONTRACT: Readonly<Record<string, keyof VehicleFormValues>> = {
  plate: 'plate',
  year: 'year',
};

/**
 * M02, etapa 2 — o veículo (fatia D6): placa, marca, modelo, ano e cor. `PUT /v1/driver/vehicle`
 * (`DriverOnboardingPort.saveVehicle`); um veículo ativo por motorista, enviar de novo substitui.
 *
 * Formato no aparelho (placa antiga ou Mercosul pela MESMA `isValidPlate` do servidor; ano entre 1950 e o ano que
 * vem); a regra é do servidor: `plate_in_use` e `vehicle_too_old` vão para o campo (a idade máxima é configuração do
 * servidor — o app não sabe nem repete o número). Salvou: volta para a lista do cadastro.
 */
export default function CadastroVeiculoScreen() {
  const { mode: sessionMode, signOut } = useSession();
  const { view } = useOnboarding();
  const summaryAction = useSummaryAction();
  const { devErro } = useLocalSearchParams<{ devErro?: string }>();
  const devError = __DEV__ && DEV_ERRORS.find((code) => code === devErro);
  const currentYear = new Date().getFullYear();
  const schema = useMemo(() => vehicleSchema(currentYear), [currentYear]);

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: OnboardingErrorView; readonly attempt: number } | null>(null);
  const alertRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();

  const { control, handleSubmit, setError, setFocus, formState } = useForm<VehicleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: devError ? { plate: 'NAT2E26', brand: 'Marca', model: 'Modelo', year: String(currentYear - 2), color: 'Prata' } : EMPTY,
    mode: 'onBlur',
  });
  const { errors, submitCount } = formState;
  const alreadySent = view.status === 'ready' && view.verification.onboarding.vehicleRegistered;

  async function onSubmit(values: VehicleFormValues) {
    const client = getOnboardingClient();
    if (!client || submitting) return;
    setFailure(null);
    setSubmitting(true);
    const result = await client.port
      .saveVehicle({
        plate: values.plate,
        brand: values.brand.trim(),
        model: values.model.trim(),
        year: Number(values.year),
        color: values.color.trim(),
      })
      .catch(() => ({ ok: false as const, error: { kind: 'unknown' as const, message: 'Falha inesperada.' } }));

    if (result.ok) {
      await refreshOnboarding();
      setSubmitting(false);
      goBackOr('/cadastro');
      return;
    }

    setSubmitting(false);
    const errorView = describeOnboardingError('vehicle', result.error);
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

  // Só desenvolvimento: `?devErro=<code>` (ver `cadastro/dados.tsx`).
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

  if (view.status === 'not_started') return <CadastroNotOpenScreen title="Seu veículo" reason={view.reason} testID="cadastro-veiculo-screen" />;

  return (
    <AppShell
      scroll
      glow
      testID="cadastro-veiculo-screen"
      footer={
        <FooterActions testID="cadastro-veiculo-footer">
          {failure ? (
            <InlineAlert
              key={failure.attempt}
              tone="danger"
              message={failure.view.message}
              focusRef={alertRef}
              testID={`cadastro-veiculo-erro-${failure.view.key}`}
            >
              {failure.view.actionLabel !== undefined && failure.view.action !== 'none' ? (
                <LinkButton
                  label={failure.view.actionLabel}
                  role="button"
                  align="flex-start"
                  onPress={() => handleFailureAction(failure.view)}
                  testID="cadastro-veiculo-erro-acao"
                />
              ) : null}
            </InlineAlert>
          ) : null}
          {showSummary ? (
            <InlineAlert
              key={submitCount}
              tone="danger"
              message={invalidCount === 1 ? 'Revise o campo destacado.' : `Revise os ${invalidCount} campos destacados.`}
              testID="cadastro-veiculo-resumo"
            />
          ) : null}
          <PrimaryButton label="Salvar veículo" onPress={() => void submit()} loading={submitting} testID="cadastro-veiculo-salvar" />
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <NetworkBanner testID="cadastro-veiculo-network-banner" />
        <ScreenHeader title="Seu veículo" onBack={() => goBackOr('/cadastro')} testID="cadastro-veiculo-header" />
        <Text style={styles.intro}>O carro que você vai usar nas corridas. Os dados precisam bater com o documento do veículo.</Text>

        {alreadySent ? (
          <InlineAlert
            tone="info"
            message="Você já informou um veículo. Trocar de carro substitui o anterior e pede o documento do veículo de novo."
            announce={false}
            testID="cadastro-veiculo-ja-enviado"
          />
        ) : null}

        <View style={styles.form}>
          <Controller
            control={control}
            name="plate"
            render={({ field, fieldState }) => (
              <TextInput
                label="Placa"
                placeholder="ABC1D23"
                value={field.value}
                onChangeText={(text) => field.onChange(maskPlate(text))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('brand')}
                testID="cadastro-veiculo-placa"
              />
            )}
          />
          <Controller
            control={control}
            name="brand"
            render={({ field, fieldState }) => (
              <TextInput
                label="Marca"
                placeholder="Ex.: Chevrolet"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="words"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('model')}
                testID="cadastro-veiculo-marca"
              />
            )}
          />
          <Controller
            control={control}
            name="model"
            render={({ field, fieldState }) => (
              <TextInput
                label="Modelo"
                placeholder="Ex.: Onix"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="words"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('year')}
                testID="cadastro-veiculo-modelo"
              />
            )}
          />
          <Controller
            control={control}
            name="year"
            render={({ field, fieldState }) => (
              <TextInput
                label="Ano"
                placeholder={String(currentYear - 3)}
                value={field.value}
                onChangeText={(text) => field.onChange(onlyDigits(text, 4))}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="number-pad"
                maxLength={4}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('color')}
                testID="cadastro-veiculo-ano"
              />
            )}
          />
          <Controller
            control={control}
            name="color"
            render={({ field, fieldState }) => (
              <TextInput
                label="Cor"
                placeholder="Ex.: Prata"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="words"
                inputRef={field.ref}
                testID="cadastro-veiculo-cor"
              />
            )}
          />
        </View>

        {sessionMode === 'mock' ? <MockBadge label="cadastro simulado, nada é enviado de verdade" testID="cadastro-veiculo-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  intro: { color: theme.role.textSecondary, ...textStyle('regular', 'body') },
  form: { gap: theme.spacing['4'] },
});
