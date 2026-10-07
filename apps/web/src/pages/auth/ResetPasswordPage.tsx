import { useResetPassword } from '@appandam/api-client';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import styles from '../../app/layout.module.css';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { PasswordField } from '../../features/auth/PasswordField';
import { errorCode, messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';

const PASSWORD_CODES = ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG', 'WEAK_PASSWORD'];

function InvalidLink() {
  return (
    <>
      <AlertBox tone="danger">{vi.auth.resetInvalid}</AlertBox>
      <Link to="/forgot-password">{vi.auth.resetRequestAgain}</Link>
    </>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [newPassword, setNewPassword] = useState('');
  const reset = useResetPassword();
  const code = errorCode(reset.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    reset.mutate({ data: { token: token!, newPassword } });
  }

  let content;
  if (!token || code === 'RESET_TOKEN_INVALID') content = <InvalidLink />;
  else if (reset.isSuccess)
    content = (
      <>
        <AlertBox tone="info">{vi.auth.resetDone}</AlertBox>
        <Link to="/login">{vi.auth.backToLogin}</Link>
      </>
    );
  else
    content = (
      <form className={styles.form} onSubmit={submit} noValidate>
        <PasswordField
          label={vi.auth.newPassword}
          autoComplete="new-password"
          hint={vi.auth.passwordHint}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={code && PASSWORD_CODES.includes(code) ? messageFor(reset.error) : undefined}
          required
        />
        {reset.error && !PASSWORD_CODES.includes(code!) && (
          <AlertBox tone="danger">{messageFor(reset.error)}</AlertBox>
        )}
        <Button type="submit" fullWidth loading={reset.isPending}>
          {vi.auth.resetSubmit}
        </Button>
      </form>
    );

  return (
    <>
      <h1 className={styles.title}>{vi.auth.resetTitle}</h1>
      {content}
    </>
  );
}
