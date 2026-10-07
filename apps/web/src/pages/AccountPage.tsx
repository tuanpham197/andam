import { logout, useDeleteAccount, useGetMe } from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import styles from '../app/layout.module.css';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { PasswordField } from '../features/auth/PasswordField';
import { setAnonymous } from '../features/auth/session-store';
import { errorCode, messageFor } from '../lib/errors';
import { vi } from '../strings/vi';

const t = vi.account;

export function AccountPage() {
  const me = useGetMe();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function leave() {
    setAnonymous();
    // Another account signing in on this device must not see cached data.
    queryClient.clear();
    await navigate('/login', { replace: true });
  }

  async function signOut() {
    await logout().catch(() => undefined);
    await leave();
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    if (!password) return setMissing(true);
    setMissing(false);
    const done = await remove.mutateAsync({ data: { password } }).then(
      () => true,
      () => false,
    );
    if (done) await leave();
  }

  const wrongPassword = errorCode(remove.error) === 'INVALID_CREDENTIALS';
  return (
    <>
      <ScreenHeader title={t.title} back="/profile" />
      <section
        className={styles.card}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <p className={styles.intro}>
          {vi.auth.signedInAs} <strong>{me.data?.email}</strong>
        </p>
        <Button variant="secondary" onClick={signOut}>
          {vi.auth.logout}
        </Button>
      </section>

      <form
        className={styles.card}
        onSubmit={deleteAccount}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 style={{ fontSize: '1.0625rem' }}>{t.deleteTitle}</h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-2)' }}>{t.deleteExplain}</p>
        {remove.error && !wrongPassword && (
          <AlertBox tone="danger">{messageFor(remove.error)}</AlertBox>
        )}
        <PasswordField
          label={t.passwordLabel}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={
            missing ? t.passwordRequired : wrongPassword ? messageFor(remove.error) : undefined
          }
        />
        <Button type="submit" variant="danger" loading={remove.isPending}>
          {t.delete}
        </Button>
      </form>
    </>
  );
}
