import { messageFor } from '../lib/errors';
import { vi } from '../strings/vi';
import { AlertBox } from './AlertBox';
import { Button } from './Button';

/** A failed query: what went wrong and a way to try again (TC-UI-013). */
export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AlertBox tone="danger">{messageFor(error)}</AlertBox>
      <Button variant="secondary" onClick={retry}>
        {vi.common.retry}
      </Button>
    </div>
  );
}
