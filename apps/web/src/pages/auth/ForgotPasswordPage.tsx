import { useForgotPassword } from '@appandam/api-client';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import styles from '../../app/layout.module.css';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TextField } from '../../components/TextField';
import { messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const forgot = useForgotPassword();

  function submit(event: FormEvent) {
    event.preventDefault();
    forgot.mutate({ data: { email } });
  }

  return (
    <>
      <ScreenHeader title="" back="/login" />
      <h1 className={styles.title}>{vi.auth.forgotTitle}</h1>
      {forgot.isSuccess ? (
        <>
          <AlertBox tone="info">{vi.auth.forgotSent}</AlertBox>
          <Link to="/login">{vi.auth.backToLogin}</Link>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <p className={styles.intro}>{vi.auth.forgotIntro}</p>
          {forgot.error && <AlertBox tone="danger">{messageFor(forgot.error)}</AlertBox>}
          <TextField
            label={vi.auth.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" fullWidth loading={forgot.isPending}>
            {vi.auth.forgotSubmit}
          </Button>
        </form>
      )}
    </>
  );
}
