import {
  ApiError,
  getListChildrenQueryKey,
  useAcceptInvite,
  usePreviewInvite,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import styles from '../app/layout.module.css';
import { AlertBox } from '../components/AlertBox';
import { Button } from '../components/Button';
import { LoadError } from '../components/LoadError';
import { withNext } from '../features/auth/guards';
import { useSession } from '../features/auth/session-store';
import { chooseChildNextTime } from '../features/child/guards';
import { shortDate, timeInVietnam, todayInVietnam } from '../features/meals/format';
import { errorCode, messageFor } from '../lib/errors';
import { vi } from '../strings/vi';

const t = vi.invite;
type InviteErrorCode = keyof typeof t.errors;
const isInviteError = (code: string | undefined): code is InviteErrorCode =>
  code !== undefined && code in t.errors;

/** G14 (UC-21): open to anyone holding the link; joining needs an account. */
export function InvitePage() {
  const { token } = useParams() as { token: string };
  const { status } = useSession();
  const preview = usePreviewInvite(token);
  const accept = useAcceptInvite();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const here = `/invite/${token}`;

  async function openChild(childId: string) {
    chooseChildNextTime(childId);
    await queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() });
    await navigate('/', { replace: true });
  }

  async function join() {
    const joined = await accept.mutateAsync({ token }).catch((error: unknown) => {
      // Already a member (TC-FAM-008): simply open that child.
      if (error instanceof ApiError && error.code === 'ALREADY_MEMBER') {
        void openChild(error.extensions.childId as string);
      }
      return null;
    });
    if (joined) await openChild(joined.childId);
  }

  const code = errorCode(preview.error ?? accept.error);
  return (
    <>
      <h1 className={styles.title}>{t.title}</h1>
      {isInviteError(code) ? (
        <>
          <AlertBox tone="info">{t.errors[code]}</AlertBox>
          <Link to="/">{t.home}</Link>
        </>
      ) : preview.isPending ? (
        <p role="status" className={styles.intro}>
          {vi.common.loading}
        </p>
      ) : preview.isError ? (
        <LoadError error={preview.error} retry={() => preview.refetch()} />
      ) : (
        <>
          <p className={styles.intro}>{t.body(preview.data.inviterName, preview.data.childName)}</p>
          <p className={styles.intro}>{t.rights}</p>
          <AlertBox tone="warn">{t.health}</AlertBox>
          <p className={styles.intro}>
            {t.expires(
              `${timeInVietnam(preview.data.expiresAt)} ${shortDate(todayInVietnam(new Date(preview.data.expiresAt)))}`,
            )}
          </p>
          {accept.error != null && <AlertBox tone="danger">{messageFor(accept.error)}</AlertBox>}
          {status === 'authenticated' ? (
            <Button fullWidth loading={accept.isPending} onClick={join}>
              {t.join}
            </Button>
          ) : status === 'anonymous' ? (
            <div className={styles.form}>
              <Link to={withNext('/login', here)} className={styles.primaryLink}>
                {t.login}
              </Link>
              <Link to={withNext('/register', here)} className={styles.secondaryLink}>
                {t.register}
              </Link>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
