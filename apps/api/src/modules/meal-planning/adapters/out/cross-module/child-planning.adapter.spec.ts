import type { ChildProfileService } from '../../../../child-profile/application/use-cases/child-profile.service.js';
import { ChildPlanningAdapter } from './child-planning.adapter.js';

// The happy path and the not-found mapping run against the real module in integration tests.
describe('ChildPlanningAdapter', () => {
  it('does not hide failures other than an unknown child (planning must not run blind)', async () => {
    const profiles = {
      get: () => Promise.reject(new Error('connection reset')),
    } as unknown as ChildProfileService;
    await expect(new ChildPlanningAdapter(profiles).find('c-1', 'u-1')).rejects.toThrow(
      'connection reset',
    );
  });
});
