import { useLogin } from '@appandam/api-client';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import styles from '../../app/layout.module.css';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { PasswordField } from '../../features/auth/PasswordField';
import { safeNext } from '../../features/auth/guards';
import { setAuthenticated } from '../../features/auth/session-store';
import { messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useLogin();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const session = await login.mutateAsync({ data: { email, password } }).catch(() => null);
    if (!session) return;
    setAuthenticated(session.accessToken);
    await navigate(safeNext(params.get('next')), { replace: true });
  }

  return (
    <>
      <h1 className={styles.title}>{vi.auth.loginTitle}</h1>
      <p className={styles.intro}>{vi.auth.loginIntro}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        {login.error && <AlertBox tone="danger">{messageFor(login.error)}</AlertBox>}
        <TextField
          label={vi.auth.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PasswordField
          label={vi.auth.password}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" fullWidth loading={login.isPending}>
          {vi.auth.loginSubmit}
        </Button>
      </form>
      <div className={styles.links}>
        <Link to="/forgot-password">{vi.auth.forgotLink}</Link>
        <span>
          {vi.auth.noAccount} <Link to="/register">{vi.auth.registerLink}</Link>
        </span>
      </div>
    </>
  );
}
