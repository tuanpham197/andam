import type { QueryClient } from '@tanstack/react-query';

/** Everything shown for the child (days, dishes, journal, paused foods) may have changed. */
export function invalidateChildData(queryClient: QueryClient, childId: string): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (q) => String(q.queryKey[0]).startsWith(`/api/v1/children/${childId}/`),
  });
}
