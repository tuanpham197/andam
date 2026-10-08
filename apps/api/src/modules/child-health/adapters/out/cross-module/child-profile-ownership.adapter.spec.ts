import type { ChildProfileService } from '../../../../child-profile/application/use-cases/child-profile.service.js';
import { ChildProfileOwnershipAdapter } from './child-profile-ownership.adapter.js';

// The happy path and the not-found mapping run against the real module in integration tests.
describe('ChildProfileOwnershipAdapter', () => {
  it('does not hide failures other than an unknown child', async () => {
    const profiles = {
      get: () => Promise.reject(new Error('connection reset')),
    } as unknown as ChildProfileService;
    await expect(new ChildProfileOwnershipAdapter(profiles).nameOf('c-1', 'u-1')).rejects.toThrow(
      'connection reset',
    );
  });
});
