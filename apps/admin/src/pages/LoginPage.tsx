import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../context/ApiContext';
import { DemoModeBanner } from '../components/DemoModeBanner';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const api = useApi();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await login({ email, password });
    setSubmitting(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <div className={styles['wrap']}>
      {api.mode === 'mock' ? <DemoModeBanner /> : null}
      <div className={styles['center']}>
        <form className={styles['card']} onSubmit={handleSubmit} noValidate>
          <div>
            <div className={styles['title']}>VuumBora Admin</div>
            <div className={styles['subtitle']}>Entre com seu e-mail e senha de administrador.</div>
          </div>

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor={emailId}>
              E-mail
            </label>
            <input
              id={emailId}
              className={styles['input']}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? errorId : undefined}
              required
            />
          </div>

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor={passwordId}>
              Senha
            </label>
            <input
              id={passwordId}
              className={styles['input']}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? errorId : undefined}
              required
            />
          </div>

          {error ? (
            <p className={styles['error']} id={errorId} role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className={styles['submit']} disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
