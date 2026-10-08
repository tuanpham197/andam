import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll, newFamily, open, todaysMeal } from './support';

// NFR-014: portrait phones, one landscape phone, a tablet.
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
];

test('NFR-014 / NFR-013 every main screen fits 320–844 px wide and passes axe', async ({
  page,
  browserName,
}) => {
  // Layout is the same engine-wide; WebKit runs the user flows (flows.spec.ts).
  test.skip(browserName !== 'chromium', 'checked once, in Chromium');
  test.setTimeout(120_000);
  await newFamily(page);
  const meal = await todaysMeal(page);
  const screens = [
    '/',
    '/week',
    '/dishes',
    '/journal',
    '/profile',
    '/account',
    '/health',
    '/settings/age',
    `/dishes/${meal.dishId}?meal=${meal.id}`,
    `/meals/${meal.id}/swap`,
    `/meals/${meal.id}/log`,
    '/dishes/new',
  ];
  for (const path of screens) {
    await open(page, path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectAccessible(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
    }
    await page.setViewportSize(VIEWPORTS[3]!);
  }
});

test('NFR-014 the sign-in screens fit the smallest phone', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'checked once, in Chromium');
  for (const path of ['/login', '/register', '/forgot-password', '/privacy']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectAccessible(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll(page);
    }
  }
});
