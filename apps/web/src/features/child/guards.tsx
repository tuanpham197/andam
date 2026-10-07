import { useListChildren, type ChildDto } from '@appandam/api-client';
import { createContext, useContext } from 'react';
import { Navigate, Outlet } from 'react-router';
import { Splash } from '../../app/layouts';
import { LoadError } from '../../components/LoadError';

/** App screens need a child profile; a new account goes through onboarding first. */
export function RequireChild() {
  const children = useListChildren();
  if (children.isPending) return <Splash />;
  if (children.isError)
    return (
      <div style={{ padding: 20 }}>
        <LoadError error={children.error} retry={() => children.refetch()} />
      </div>
    );
  if (children.data.length === 0) return <Navigate to="/onboarding/1" replace />;
  return (
    <ActiveChild.Provider value={children.data[0]!}>
      <Outlet />
    </ActiveChild.Provider>
  );
}

/** Onboarding is for the first profile only (multiple children arrive after the MVP). */
export function RequireNoChild() {
  const children = useListChildren();
  if (children.isPending) return <Splash />;
  if (children.isError)
    return (
      <div style={{ padding: 20 }}>
        <LoadError error={children.error} retry={() => children.refetch()} />
      </div>
    );
  if (children.data.length > 0) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * The profile shown in the app: the first child (MVP has one child per account). Provided by
 * RequireChild, so a screen never sees the list emptied by a deletion before the redirect.
 */
const ActiveChild = createContext<ChildDto | null>(null);

export function useActiveChild(): ChildDto {
  return useContext(ActiveChild)!;
}
