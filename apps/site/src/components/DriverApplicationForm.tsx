'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { BRAZIL_STATES, DEFAULT_STATE, DRIVER_APPLICATION_CONTENT } from '@/content/driverApplication';
import { getDriverApplicationPort } from '@/lib/driver-application-client';
import styles from './DriverApplicationForm.module.css';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Tri = 'yes' | 'no' | undefined;

// Checagens simples no cliente — o servidor valida de verdade. Só evitam
// uma viagem de rede óbvia para um valor claramente incompleto.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS = /\D/g;

interface FieldErrors {
  name?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
}

/**
 * Candidatura de motorista (etapa 1 de 2) — a ação principal da página.
 * Guarda o que foi digitado mesmo quando o envio falha (nenhum campo é
 * limpo em erro, só em sucesso) — pedido do dono: "nada de perder o que
 * foi digitado se o envio falhar", formulário pensado para ser preenchido
 * no celular, às vezes no intervalo de uma corrida.
 */
export function DriverApplicationForm() {
  const [port] = useState(() => getDriverApplicationPort());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState(DEFAULT_STATE);
  const [alreadyDrivesForApp, setAlreadyDrivesForApp] = useState<Tri>(undefined);
  const [hasOwnVehicle, setHasOwnVehicle] = useState<Tri>(undefined);
  const [status, setStatus] = useState<Status>('idle');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>(undefined);

  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const cityId = useId();
  const stateId = useId();
  const privacyId = useId();
  const errorPrefix = useId();

  const loading = status === 'loading';
  const content = DRIVER_APPLICATION_CONTENT;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (name.trim().length < 2) errors.name = content.errors.invalidName;
    if (phone.replace(PHONE_DIGITS, '').length < 10) errors.phone = content.errors.invalidPhone;
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) errors.email = content.errors.invalidEmail;
    if (city.trim().length < 2) errors.city = content.errors.invalidCity;
    if (!state) errors.state = content.errors.invalidState;
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!port || loading) return;

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setGeneralError(undefined);
    setStatus('loading');

    const result = await port.apply({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      city: city.trim(),
      state,
      ...(alreadyDrivesForApp ? { alreadyDrivesForApp: alreadyDrivesForApp === 'yes' } : {}),
      ...(hasOwnVehicle ? { hasOwnVehicle: hasOwnVehicle === 'yes' } : {}),
    });

    if (result.ok) {
      setStatus('success');
      setName('');
      setPhone('');
      setEmail('');
      setCity('');
      setState(DEFAULT_STATE);
      setAlreadyDrivesForApp(undefined);
      setHasOwnVehicle(undefined);
      return;
    }

    setStatus('error');
    const { error } = result;
    if (error.kind === 'validation') {
      setFieldErrors({
        name: error.fields['name'],
        phone: error.fields['phone'],
        email: error.fields['email'],
        city: error.fields['city'],
        state: error.fields['state'],
      });
    } else if (error.kind === 'rate_limited') {
      setGeneralError(content.errors.rateLimited);
    } else if (error.kind === 'unavailable' || error.kind === 'network') {
      setGeneralError(content.errors.unavailable);
    } else {
      setGeneralError(content.errors.generic);
    }
  }

  if (!port) {
    return (
      <div className={styles['card']}>
        <p className={styles['eyebrow']}>{content.eyebrow}</p>
        <p className={styles['notConfigured']} role="note">
          {content.notConfiguredNotice}
        </p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className={styles['card']}>
        <div className={styles['success']} role="status">
          <svg className={styles['successIcon']} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 12.3l2.6 2.6L16 9.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <p className={styles['successTitle']}>{content.successTitle}</p>
            <p className={styles['successMessage']}>{content.successMessage}</p>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['card']}>
      <p className={styles['eyebrow']}>{content.eyebrow}</p>
      <h2 className={styles['title']}>{content.title}</h2>
      <p className={styles['description']}>{content.description}</p>

      <form className={styles['form']} onSubmit={handleSubmit} noValidate>
        <div className={styles['field']}>
          <label htmlFor={nameId} className={styles['label']}>
            {content.fields.name.label}
          </label>
          <input
            id={nameId}
            type="text"
            name="name"
            autoComplete="name"
            required
            placeholder={content.fields.name.placeholder}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            className={styles['input']}
            data-invalid={fieldErrors.name ? 'true' : 'false'}
            aria-invalid={fieldErrors.name ? 'true' : 'false'}
            aria-describedby={fieldErrors.name ? `${errorPrefix}-name` : undefined}
            disabled={loading}
          />
          {fieldErrors.name ? (
            <p id={`${errorPrefix}-name`} className={styles['fieldError']} role="alert">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className={styles['row']}>
          <div className={styles['field']}>
            <label htmlFor={phoneId} className={styles['label']}>
              {content.fields.phone.label}
            </label>
            <input
              id={phoneId}
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder={content.fields.phone.placeholder}
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              className={styles['input']}
              data-invalid={fieldErrors.phone ? 'true' : 'false'}
              aria-invalid={fieldErrors.phone ? 'true' : 'false'}
              aria-describedby={fieldErrors.phone ? `${errorPrefix}-phone` : undefined}
              disabled={loading}
            />
            {fieldErrors.phone ? (
              <p id={`${errorPrefix}-phone`} className={styles['fieldError']} role="alert">
                {fieldErrors.phone}
              </p>
            ) : null}
          </div>

          <div className={styles['field']}>
            <label htmlFor={emailId} className={styles['label']}>
              {content.fields.email.label}
            </label>
            <input
              id={emailId}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder={content.fields.email.placeholder}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              className={styles['input']}
              data-invalid={fieldErrors.email ? 'true' : 'false'}
              aria-invalid={fieldErrors.email ? 'true' : 'false'}
              aria-describedby={fieldErrors.email ? `${errorPrefix}-email` : undefined}
              disabled={loading}
            />
            {fieldErrors.email ? (
              <p id={`${errorPrefix}-email`} className={styles['fieldError']} role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles['row']}>
          <div className={styles['field']} style={{ flex: '1 1 220px' }}>
            <label htmlFor={cityId} className={styles['label']}>
              {content.fields.city.label}
            </label>
            <input
              id={cityId}
              type="text"
              name="city"
              autoComplete="address-level2"
              required
              placeholder={content.fields.city.placeholder}
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                if (fieldErrors.city) setFieldErrors((prev) => ({ ...prev, city: undefined }));
              }}
              className={styles['input']}
              data-invalid={fieldErrors.city ? 'true' : 'false'}
              aria-invalid={fieldErrors.city ? 'true' : 'false'}
              aria-describedby={fieldErrors.city ? `${errorPrefix}-city` : undefined}
              disabled={loading}
            />
            {fieldErrors.city ? (
              <p id={`${errorPrefix}-city`} className={styles['fieldError']} role="alert">
                {fieldErrors.city}
              </p>
            ) : null}
          </div>

          <div className={styles['field']} style={{ flex: '0 0 140px' }}>
            <label htmlFor={stateId} className={styles['label']}>
              {content.fields.state.label}
            </label>
            <select
              id={stateId}
              name="state"
              autoComplete="address-level1"
              required
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                if (fieldErrors.state) setFieldErrors((prev) => ({ ...prev, state: undefined }));
              }}
              className={styles['select']}
              data-invalid={fieldErrors.state ? 'true' : 'false'}
              aria-invalid={fieldErrors.state ? 'true' : 'false'}
              aria-describedby={fieldErrors.state ? `${errorPrefix}-state` : undefined}
              disabled={loading}
            >
              {BRAZIL_STATES.map((item) => (
                <option key={item.uf} value={item.uf}>
                  {item.uf}
                </option>
              ))}
            </select>
            {fieldErrors.state ? (
              <p id={`${errorPrefix}-state`} className={styles['fieldError']} role="alert">
                {fieldErrors.state}
              </p>
            ) : null}
          </div>
        </div>

        <fieldset className={styles['triFieldset']}>
          <legend className={styles['triLegend']}>{content.eligibility.alreadyDrivesForApp.legend}</legend>
          <div className={styles['triOptions']}>
            {(['yes', 'no'] as const).map((value) => (
              <label key={value} className={styles['triOption']}>
                <input
                  type="radio"
                  name="already-drives"
                  value={value}
                  checked={alreadyDrivesForApp === value}
                  onChange={() => setAlreadyDrivesForApp(value)}
                  className={styles['triRadio']}
                  disabled={loading}
                />
                {value === 'yes' ? content.eligibility.yes : content.eligibility.no}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles['triFieldset']}>
          <legend className={styles['triLegend']}>{content.eligibility.hasOwnVehicle.legend}</legend>
          <div className={styles['triOptions']}>
            {(['yes', 'no'] as const).map((value) => (
              <label key={value} className={styles['triOption']}>
                <input
                  type="radio"
                  name="has-vehicle"
                  value={value}
                  checked={hasOwnVehicle === value}
                  onChange={() => setHasOwnVehicle(value)}
                  className={styles['triRadio']}
                  disabled={loading}
                />
                {value === 'yes' ? content.eligibility.yes : content.eligibility.no}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className={styles['submit']} disabled={loading} aria-busy={loading}>
          {loading ? content.submitLoadingLabel : content.submitLabel}
        </button>

        {generalError ? (
          <p className={styles['generalError']} role="alert">
            {generalError}
          </p>
        ) : null}

        <p id={privacyId} className={styles['privacy']}>
          {content.privacyNotice}
        </p>
      </form>
    </div>
  );
}
