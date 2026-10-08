import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Cháo cá hồi 2026';

let n = 0;
export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${process.pid}-${++n}@e2e.test`;

/** A birth date `months` ago in Vietnam, as the date input expects it. */
export function birthDateMonthsAgo(months: number): string {
  const day = new Date(Date.now() + 7 * 3600_000);
  day.setUTCMonth(day.getUTCMonth() - months);
  return day.toISOString().slice(0, 10);
}

export async function register(page: Page, email = uniqueEmail('parent')) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByLabel('Tên hoặc tên gọi ở nhà của bé')).toBeVisible();
  return email;
}

/** UC-01 + UC-02: a new parent with an 8-month-old who avoids egg. */
export async function onboard(page: Page, name = 'Na', months = 8) {
  const next = () => page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByLabel('Tên hoặc tên gọi ở nhà của bé').fill(name);
  await next();
  await page.getByLabel('Ngày sinh').fill(birthDateMonthsAgo(months));
  await next();
  await page.getByRole('button', { name: 'Trứng' }).click();
  await page.getByRole('radio', { name: 'Chưa từng' }).check();
  await next();
  await page.getByRole('button', { name: 'Tạo hồ sơ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Bé ${name}` })).toBeVisible();
}

export async function newFamily(page: Page) {
  await register(page);
  await onboard(page);
}

/** NFR-014: nothing wider than the screen. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

/** NFR-013: no serious or critical WCAG 2.1 A/AA violation on the current screen. */
export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(blocking).toEqual([]);
}

/** A meal of today's plan, taken from its row on S01. */
export async function todaysMeal(page: Page) {
  const row = page.locator('a[href*="?meal="]').first();
  const href = (await row.getAttribute('href'))!;
  const url = new URL(href, 'http://x');
  return {
    id: url.searchParams.get('meal')!,
    dishId: url.pathname.split('/').pop()!,
    name: (await row.innerText()).split('\n').find((l) => l.trim().length > 3)!,
  };
}

/**
 * Opens `path` inside the running app, without reloading the page. WebKit keeps no `Secure`
 * cookie over plain http, so a reload on localhost would lose the session (production is HTTPS).
 */
export async function open(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
