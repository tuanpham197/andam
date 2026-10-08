import { useRegister } from '@appandam/api-client';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import styles from '../../app/layout.module.css';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { CONSENT_VERSION } from '../../features/auth/consent';
import { safeNext, withNext } from '../../features/auth/guards';
import { PasswordField } from '../../features/auth/PasswordField';
import { setAuthenticated } from '../../features/auth/session-store';
import { errorCode, messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';

const EMAIL_CODES = ['EMAIL_TAKEN', 'INVALID_EMAIL'];
const PASSWORD_CODES = ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG', 'WEAK_PASSWORD'];

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const register = useRegister();
  const navigate = useNavigate();
  const legendId = useId();
  const next = useSearchParams()[0].get('next');

  const code = errorCode(register.error);
  const emailError = code && EMAIL_CODES.includes(code) ? messageFor(register.error) : undefined;
  const passwordError =
    code && PASSWORD_CODES.includes(code) ? messageFor(register.error) : undefined;
  const consentError = consentMissing
    ? vi.auth.consentRequired
    : code === 'CONSENT_REQUIRED'
      ? vi.auth.consentOutdated
      : undefined;
  const bannerError =
    register.error && !emailError && !passwordError && code !== 'CONSENT_REQUIRED'
      ? messageFor(register.error)
      : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) {
      setConsentMissing(true);
      return;
    }
    const session = await register
      .mutateAsync({ data: { email, password, consentVersion: CONSENT_VERSION } })
      .catch(() => null);
    if (!session) return;
    setAuthenticated(session.accessToken);
    // From an invite link: back to it, the child's profile comes from the invite (UC-21).
    await navigate(safeNext(next), { replace: true });
  }

  return (
    <>
      <h1 className={styles.title}>{vi.auth.registerTitle}</h1>
      <form className={styles.form} onSubmit={submit} noValidate>
        {bannerError && <AlertBox tone="danger">{bannerError}</AlertBox>}
        <TextField
          label={vi.auth.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          required
        />
        <PasswordField
          label={vi.auth.password}
          autoComplete="new-password"
          hint={vi.auth.passwordHint}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
          required
        />
        <fieldset
          aria-labelledby={legendId}
          className={styles.card}
          style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <legend id={legendId} style={{ fontWeight: 700, padding: 0, float: 'left' }}>
            {vi.auth.consentLegend}
          </legend>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-2)', clear: 'both' }}>
            {vi.auth.consentSummary} <Link to="/privacy">{vi.auth.consentPolicyLink}</Link>
          </p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setConsentMissing(false);
              }}
              style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--primary)' }}
            />
            <span>{vi.auth.consentCheckbox}</span>
          </label>
          {consentError && (
            <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.8125rem' }}>
              {consentError}
            </span>
          )}
        </fieldset>
        <Button type="submit" fullWidth loading={register.isPending}>
          {vi.auth.registerSubmit}
        </Button>
      </form>
      <div className={styles.links}>
        <span>
          {vi.auth.hasAccount} <Link to={withNext('/login', next)}>{vi.auth.loginSubmit}</Link>
        </span>
      </div>
    </>
  );
}
