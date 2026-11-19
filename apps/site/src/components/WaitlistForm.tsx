'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { WAITLIST_CONTENT } from '@/content/waitlist';
import { getWaitlistPort } from '@/lib/waitlist-client';
import styles from './WaitlistForm.module.css';

type Status = 'idle' | 'loading' | 'success' | 'error';

// Checagem simples no cliente (o servidor valida de verdade — ver
// `docs/lista-de-espera.md` §5): só evita uma viagem de rede óbvia para um
// valor claramente incompleto, resposta imediata em vez de esperar o 400.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lista de espera do passageiro — formulário secundário da página (o
 * motorista tem o seu próprio, `DriverApplicationForm`). Perfil sempre
 * `'passenger'`, sem seletor: ver nota em `content/waitlist.ts`.
 *
 * Honesto quando o backend ainda não está configurado
 * (`NEXT_PUBLIC_WAITLIST_API_URL` ausente, ver `src/lib/waitlist-client.ts`):
 * mostra aviso em vez de simular um envio que não vai a lugar nenhum.
 */
export function WaitlistForm() {
  const [port] = useState(() => getWaitlistPort());
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [generalError, setGeneralError] = useState<string | undefined>(undefined);

  const emailId = useId();
  const errorId = useId();
  const privacyId = useId();

  const loading = status === 'loading';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!port || loading) return;

    const trimmed = email.trim();
    if (!LOOKS_LIKE_EMAIL.test(trimmed)) {
      setFieldError(WAITLIST_CONTENT.errors.invalidEmail);
      return;
    }

    setFieldError(undefined);
    setGeneralError(undefined);
    setStatus('loading');

    const result = await port.signUp({ email: trimmed, profile: 'passenger' });

    if (result.ok) {
      setStatus('success');
      setEmail('');
      return;
    }

    setStatus('error');
    const { error } = result;
    if (error.kind === 'validation') {
      setFieldError(error.fields['email'] ?? WAITLIST_CONTENT.errors.invalidEmail);
    } else if (error.kind === 'rate_limited') {
      setGeneralError(WAITLIST_CONTENT.errors.rateLimited);
    } else if (error.kind === 'unavailable' || error.kind === 'network') {
      setGeneralError(WAITLIST_CONTENT.errors.unavailable);
    } else {
      setGeneralError(WAITLIST_CONTENT.errors.generic);
    }
  }

  if (!port) {
    return (
      <p className={styles['notConfigured']} role="note">
        {WAITLIST_CONTENT.notConfiguredNotice}
      </p>
    );
  }

  if (status === 'success') {
    return (
      <div className={styles['success']} role="status">
        <svg className={styles['successIcon']} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 12.3l2.6 2.6L16 9.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          <p className={styles['successTitle']}>{WAITLIST_CONTENT.successTitle}</p>
          <p className={styles['successMessage']}>{WAITLIST_CONTENT.successMessage}</p>
        </span>
      </div>
    );
  }

  return (
    <form className={styles['form']} onSubmit={handleSubmit} noValidate>
      <div className={styles['field']}>
        <label htmlFor={emailId} className={styles['label']}>
          {WAITLIST_CONTENT.emailLabel}
        </label>
        <div className={styles['row']}>
          <input
            id={emailId}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder={WAITLIST_CONTENT.emailPlaceholder}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldError) setFieldError(undefined);
            }}
            className={styles['input']}
            data-invalid={fieldError ? 'true' : 'false'}
            aria-invalid={fieldError ? 'true' : 'false'}
            aria-describedby={fieldError ? `${privacyId} ${errorId}` : privacyId}
            disabled={loading}
          />
          <button type="submit" className={styles['submit']} disabled={loading} aria-busy={loading}>
            {loading ? WAITLIST_CONTENT.submitLoadingLabel : WAITLIST_CONTENT.submitLabel}
          </button>
        </div>
        {fieldError ? (
          <p id={errorId} className={styles['fieldError']} role="alert">
            {fieldError}
          </p>
        ) : null}
      </div>

      <p className={styles['supportText']}>{WAITLIST_CONTENT.supportText}</p>

      {generalError ? (
        <p className={styles['generalError']} role="alert">
          {generalError}
        </p>
      ) : null}

      <p id={privacyId} className={styles['privacy']}>
        {WAITLIST_CONTENT.privacyNotice}
      </p>
    </form>
  );
}
