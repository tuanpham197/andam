import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { Splash } from '../../app/layouts';
import { refreshSessionOnce } from '../../lib/session-refresh';
import { useSession } from './session-store';

/** Restores the session from the refresh cookie once, before any guarded screen renders. */
export function SessionRoot() {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'unknown') void refreshSessionOnce();
  }, [status]);
  return <Outlet />;
}

export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'unknown') return <Splash />;
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Only same-site paths are followed after login, never `https://…` or `//host` (open redirect). */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function GuestOnly() {
  const { status } = useSession();
  const [params] = useSearchParams();
  if (status === 'unknown') return <Splash />;
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
