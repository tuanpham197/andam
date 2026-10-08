import { expect, test } from '@playwright/test';
import { expectAccessible, onboard, register } from './support';

test('NFR-011 #1 a new parent signs up, creates the child profile and sees today’s menu', async ({
  page,
}) => {
  await register(page);
  await expectAccessible(page);
  await onboard(page);
  // S01: the next meal first, then the day.
  await expect(page.getByRole('region', { name: /Bữa tiếp theo|bữa tiếp theo/i })).toBeVisible();
  await expectAccessible(page);
  // The avoid list is shown on the header (BR-01 keeps egg dishes off the plan).
  await expect(page.getByText('Tránh: Trứng')).toBeVisible();
});
