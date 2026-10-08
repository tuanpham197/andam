import { useListChildren, type ChildDto } from '@appandam/api-client';
import { createContext, useContext, useState } from 'react';
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
  if (children.data.length === 0) {
    // A list restored from the device cache may be older than the profile just created: never
    // leave the requested screen on it — wait for the server's answer.
    if (children.isFetching) return <Splash />;
    return <Navigate to="/onboarding/1" replace />;
  }
  return <ChildChoiceProvider list={children.data} />;
}

const STORAGE_KEY = 'active-child';

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(childId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, childId);
  } catch {
    // Not kept for the next visit: the first child shows then.
  }
}

/**
 * FR-117: the child shown is the one chosen on this device; when that child is gone (deleted,
 * or the member was removed) the first remaining one shows.
 */
function ChildChoiceProvider({ list }: { list: ChildDto[] }) {
  const [chosen, setChosen] = useState(remembered);
  const child = list.find((c) => c.id === chosen) ?? list[0]!;
  const select = (childId: string) => {
    remember(childId);
    setChosen(childId);
  };
  return (
    <ChildChoice.Provider value={{ children: list, select }}>
      <ActiveChild.Provider value={child}>
        <Outlet />
      </ActiveChild.Provider>
    </ChildChoice.Provider>
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
  if (children.data.length > 0) {
    // Same for a cached list that still shows a child that is gone.
    if (children.isFetching) return <Splash />;
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/**
 * The child shown in the app (FR-117). Provided by RequireChild, so a screen never sees the list
 * emptied by a deletion before the redirect.
 */
const ActiveChild = createContext<ChildDto | null>(null);

export function useActiveChild(): ChildDto {
  return useContext(ActiveChild)!;
}

interface ChildChoiceValue {
  children: ChildDto[];
  select: (childId: string) => void;
}

const ChildChoice = createContext<ChildChoiceValue | null>(null);

/** Every child the user belongs to, and a way to show another one (G04). */
export function useChildChoice(): ChildChoiceValue {
  return useContext(ChildChoice)!;
}

/** For the invite page (outside the guarded tree): show this child next time the app opens. */
export const chooseChildNextTime = remember;
