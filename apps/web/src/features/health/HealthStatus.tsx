import { useGetHealth } from '@appandam/api-client';
import { vi } from '../../strings/vi';

export function HealthStatus() {
  const { isPending, isError, error, refetch, isFetching } = useGetHealth();

  if (isPending) return <p role="status">{vi.health.checking}</p>;

  if (isError) {
    return (
      <div role="alert">
        <p>{error.code === 'NETWORK_ERROR' ? vi.health.offline : vi.health.down}</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching}>
          {vi.common.retry}
        </button>
      </div>
    );
  }

  return <p>{vi.health.ok}</p>;
}
