import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { CalendarDays, Lock, Mail, Phone, User } from 'lucide-react-native';
import {
  AppShell,
  DateInput,
  InlineAlert,
  LinkButton,
  PasswordInput,
  PhoneInput,
  PrimaryButton,
  TextInput,
  brazilianDateToIso,
  formatWait,
  theme,
  textStyle,
} from '@vuumbora/ui';
import { AuthErrorAlert } from '../../src/components/auth/AuthErrorAlert';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { SocialSignInSection } from '../../src/components/auth/SocialSignInSection';
import { LegalConsentFields } from '../../src/components/legal/LegalConsentFields';
import { SOCIAL_SIGN_IN_ENABLED } from '../../src/config/featureFlags';
import {
  describeAuthError,
  type AuthErrorAction,
  type AuthErrorField,
  type AuthErrorView,
} from '../../src/identity/authErrors';
import { useAuthFlowStore } from '../../src/identity/authFlowStore';
import { identity } from '../../src/identity/identityClient';
import { safeCall } from '../../src/identity/safeCall';
import { useRetryLock } from '../../src/identity/useRetryLock';
import { consentPayload, refreshLegalAfterOutdated, useLegalDocuments } from '../../src/legal/legalDocuments';
import { goBackOr } from '../../src/navigation/goBack';
import { useFocusAfterRender } from '../../src/lib/focusAfterRender';
import { cadastroSchema, type CadastroFormValues } from '../../src/schemas/authSchemas';
import { fieldErrorProps } from '../../src/lib/fieldErrorProps';

/** Em qual(is) campo(s) do formulário cada campo de erro do servidor aparece. */
const FORM_FIELDS: Record<AuthErrorField, readonly FieldPath<CadastroFormValues>[]> = {
  email: ['email'],
  password: ['password'],
  newPassword: ['password'],
  phone: ['phone'],
  birthDate: ['birthDate'],
  consent: ['termsAccepted', 'privacyAccepted'],
  code: [],
};

/** Nome de cada campo no aviso "Revise os campos destacados". */
const FIELD_LABEL: Record<keyof CadastroFormValues, string> = {
  fullName: 'nome',
  email: 'e-mail',
  phone: 'celular',
  birthDate: 'data de nascimento',
  password: 'senha',
  termsAccepted: 'Termos de Uso',
  privacyAccepted: 'Política de Privacidade',
};

/**
 * Cadastro (P02 — criar conta). Campos do contrato: nome, e-mail, senha (8 a 72 bytes), celular OPCIONAL, data de
 * nascimento e os DOIS aceites (Termos e Política), cada um com acesso ao texto. Nenhum aceite nasce marcado.
 *
 * Aceite com versão (B3): os textos vêm de `useLegalDocuments` (carregando | erro | pronto) e o envio só é habilitado
 * com `pronto`. As versões enviadas são as do documento que ESTA tela renderizou, nunca uma constante. Se a versão
 * mudou (`409 consent_outdated`), os textos são trocados, os dois aceites são desmarcados e a pessoa aceita de novo —
 * o app não reenvia sozinho. Isso vale para QUALQUER troca de textos (efeito abaixo), não só para o 409.
 *
 * Quem decide é o servidor: `underage` (18 anos), `email_taken`, `consent_unavailable` ("o cadastro ainda não está
 * aberto"), limite de tentativas etc. têm estado de tela próprio (`describeAuthError`). A data de nascimento fica só
 * no formulário (estado local): é enviada e nunca guardada — sair da tela a descarta. Sucesso leva à tela do código;
 * o app NÃO abre sessão aqui (o servidor não devolve token no cadastro).
 *
 * Foco: envio com campo faltando leva o foco ao primeiro campo com erro (o do react-hook-form, que acha o campo pelo
 * `field.ref` de cada `Controller`); erro do servidor que é de um campo leva ao campo, e erro que é aviso leva ao aviso
 * (o botão que enviou ficou indisponível durante o envio e o navegador jogaria o foco no `<body>`).
 */
export default function CadastroScreen() {
  // Quem ENVIA o aceite confere a idade da cópia ao abrir: a cópia de uma visita antiga não é a que a pessoa vai ver.
  const legal = useLegalDocuments({ refreshIfStale: true });
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: AuthErrorView; readonly attempt: number } | null>(null);
  const lock = useRetryLock();
  const alertRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();

  const { control, handleSubmit, setError, setFocus, setValue, getValues, clearErrors, formState } = useForm<CadastroFormValues>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      birthDate: '',
      password: '',
      termsAccepted: false,
      privacyAccepted: false,
    },
    mode: 'onBlur',
  });
  const { errors, submitCount } = formState;
  const waitSeconds = lock.secondsFor();
  const locked = waitSeconds > 0;
  const invalidLabels = (Object.keys(errors) as (keyof CadastroFormValues)[]).map((name) => FIELD_LABEL[name]);

  // Os aceites valem para os textos que estavam na tela quando foram marcados. Chegou uma cópia NOVA dos textos
  // (409 com `error.current`, ou nova busca): desmarca os dois. A 1ª cópia (a da abertura) não desmarca nada — antes
  // dela nem havia caixa para marcar.
  const shownDocuments = legal.status === 'ready' ? legal.documents : null;
  const lastShown = useRef<typeof shownDocuments>(null);
  useEffect(() => {
    if (shownDocuments === null) return;
    if (lastShown.current !== null && lastShown.current !== shownDocuments) {
      setValue('termsAccepted', false);
      setValue('privacyAccepted', false);
      clearErrors(['termsAccepted', 'privacyAccepted']);
    }
    lastShown.current = shownDocuments;
  }, [shownDocuments, setValue, clearErrors]);

  async function onSubmit(values: CadastroFormValues) {
    // O envio só existe com os textos na tela (o botão fica desligado fora de `pronto`); isto é a segunda trava.
    if (legal.status !== 'ready' || submitting || locked) return;
    const documents = legal.documents; // o que a tela RENDERIZOU neste toque: as versões enviadas saem DAQUI
    const birthDate = brazilianDateToIso(values.birthDate);
    if (birthDate === null) return; // o schema já recusou; só estreita o tipo
    setFailure(null);
    setSubmitting(true);

    const email = values.email.trim();
    const phone = values.phone.trim();
    const result = await safeCall(() =>
      identity.register({
        fullName: values.fullName.trim(),
        email,
        password: values.password,
        ...(phone !== '' ? { phone } : {}),
        birthDate,
        ...consentPayload(documents),
      }),
    );
    setSubmitting(false);

    if (result.ok) {
      useAuthFlowStore.getState().startVerification({
        identifier: email,
        origin: 'register',
        emailSent: result.data.verification.emailSent,
        resendAfterSeconds: result.data.verification.resendAfterSeconds,
      });
      router.push('/codigo');
      return;
    }

    const view = describeAuthError('register', result.error);
    if (view.key === 'consent_outdated') refreshLegalAfterOutdated(result.error);
    if (view.key === 'too_many_attempts' && view.retryAfterSeconds !== undefined) lock.lockFor(view.retryAfterSeconds);
    if (view.field !== undefined) {
      const [first, ...rest] = FORM_FIELDS[view.field];
      // Erro de campo: a mensagem vai no campo. Erro de aviso (ex.: e-mail já cadastrado): o campo só fica destacado.
      if (first !== undefined) setError(first, { type: 'server', message: view.presentation === 'field' ? view.message : '' });
      for (const name of rest) setError(name, { type: 'server', message: '' });
    }
    if (view.presentation === 'alert') {
      setFailure((previous) => ({ view, attempt: (previous?.attempt ?? 0) + 1 }));
      focusAfterRender(() => alertRef.current?.focus());
    } else if (view.field !== undefined) {
      const [first] = FORM_FIELDS[view.field];
      if (first !== undefined) focusAfterRender(() => setFocus(first));
    }
  }

  function handleAction(action: AuthErrorAction) {
    if (action === 'go_login') {
      // "Entrar na minha conta" (e-mail já cadastrado): o login abre com o e-mail que a pessoa acabou de digitar.
      const typed = getValues('email').trim();
      if (typed !== '') useAuthFlowStore.getState().prefillLogin(typed);
      router.push('/login');
    }
    if (action === 'go_forgot') router.push('/esqueci-senha');
  }

  const submit = handleSubmit(onSubmit);
  const showSummary = submitCount > 0 && invalidLabels.length > 0 && failure === null;

  return (
    <AppShell scroll glow testID="cadastro-screen">
      <View style={styles.content}>
        <AuthHeader
          title="Criar conta"
          subtitle="Informe seus dados para começar."
          onBack={() => goBackOr('/boas-vindas')}
          showLogo={false}
        />

        <View style={styles.form}>
          <Controller
            control={control}
            name="fullName"
            render={({ field, fieldState }) => (
              <TextInput
                label="Nome completo"
                placeholder="Seu nome completo"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('email')}
                leftAccessory={<User size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="cadastro-name-input"
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <TextInput
                label="E-mail"
                placeholder="seu@email.com"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                autoCorrect={false}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('phone')}
                leftAccessory={<Mail size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="cadastro-email-input"
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field, fieldState }) => (
              <PhoneInput
                label="Celular com WhatsApp (opcional)"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('birthDate')}
                leftAccessory={<Phone size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="cadastro-phone-input"
              />
            )}
          />

          <Controller
            control={control}
            name="birthDate"
            render={({ field, fieldState }) => (
              <DateInput
                label="Data de nascimento"
                helperText="Dia/mês/ano. É preciso ter 18 anos ou mais."
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                inputRef={field.ref}
                leftAccessory={<CalendarDays size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="cadastro-birthdate-input"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordInput
                label="Senha"
                helperText="De 8 a 72 caracteres."
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoComplete="new-password"
                textContentType="newPassword"
                inputRef={field.ref}
                leftAccessory={<Lock size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="cadastro-password-input"
              />
            )}
          />
        </View>

        <LegalConsentFields control={control} legal={legal} disabled={submitting} />

        <View style={styles.actions}>
          {failure !== null ? (
            <AuthErrorAlert
              key={failure.attempt}
              view={failure.view}
              waitSeconds={waitSeconds}
              onAction={handleAction}
              alertRef={alertRef}
              testID="cadastro-alert"
            />
          ) : null}
          {showSummary ? (
            <InlineAlert
              key={submitCount}
              tone="danger"
              message={`Revise os campos destacados: ${invalidLabels.join(', ')}.`}
              testID="cadastro-summary"
            />
          ) : null}
          <PrimaryButton
            label={locked ? `Aguarde ${formatWait(waitSeconds)}` : 'Criar conta'}
            onPress={() => void submit()}
            loading={submitting}
            // Sem os textos na tela não há o que aceitar: o envio só vale com `pronto` (carregando e erro desligam).
            disabled={locked || legal.status !== 'ready'}
            accessibilityLabel={locked ? `Criar conta, disponível em ${formatWait(waitSeconds)}` : 'Criar conta'}
            testID="cadastro-submit-button"
          />

          {SOCIAL_SIGN_IN_ENABLED ? <SocialSignInSection /> : null}

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Já tem uma conta?</Text>
            <LinkButton label="Entrar" onPress={() => router.push('/login')} testID="cadastro-go-to-login-link" />
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  form: { gap: theme.spacing['4'] },
  actions: { gap: theme.spacing['3'] },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  footerText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
