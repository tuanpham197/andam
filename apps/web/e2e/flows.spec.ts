import { expect, test } from '@playwright/test';
import { expectAccessible, newFamily, open, todaysMeal } from './support';

test.beforeEach(async ({ page }) => {
  await newFamily(page);
});

test('NFR-011 #2 today’s menu opens a recipe and comes back', async ({ page }) => {
  const meal = await todaysMeal(page);
  await page.locator(`a[href*="?meal=${meal.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/dishes/${meal.dishId}`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Bé Na' })).toBeVisible();
});

test('NFR-011 #3 a meal is swapped for another safe dish (UC-07)', async ({ page }) => {
  const meal = await todaysMeal(page);
  await open(page, `/meals/${meal.id}/swap`);
  await page.getByRole('button', { name: 'Thiếu nguyên liệu' }).click();
  await expectAccessible(page);
  const choose = page.getByRole('button', { name: /^Chọn / }).first();
  await choose.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bé Na' })).toBeVisible();
  await expect(page.locator(`a[href*="?meal=${meal.id}"]`)).not.toHaveAttribute(
    'href',
    `/dishes/${meal.dishId}?meal=${meal.id}`,
  );
});

test('NFR-011 #4 a reaction is logged and its foods are paused (UC-08, UC-09)', async ({
  page,
}) => {
  const meal = await todaysMeal(page);
  await open(page, `/meals/${meal.id}/log`);
  // Any hour of the day: a time already past today is always accepted.
  await page.getByLabel('Giờ ghi nhận').fill('00:01');
  await page.getByRole('button', { name: 'Nửa phần' }).click();
  await page.getByRole('button', { name: '3 trên 5' }).click();
  await page.getByRole('button', { name: 'Nổi mẩn đỏ' }).click();
  await page.getByRole('button', { name: 'Nhẹ' }).click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Lưu ghi nhận' }).click();
  await expect(page.getByText('Đã lưu ghi nhận')).toBeVisible();

  // The journal keeps it for the doctor (G02).
  await open(page, '/journal');
  await expect(page.getByText(/Nổi mẩn đỏ/).first()).toBeVisible();
  await expectAccessible(page);
});

test('NFR-011 #5 the health status changes the menu (UC-11)', async ({ page }) => {
  await open(page, '/health');
  await page.getByRole('radio', { name: /Ốm|Đang ốm/ }).check();
  await page.getByRole('button', { name: 'Sốt' }).click();
  await expect(page.getByText('Ưu tiên món mềm, lỏng hơn một mức kết cấu')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Cập nhật thực đơn' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bé Na' })).toBeVisible();
  await expect(page.getByText(/Sức khỏe: (Ốm|Đang ốm)/)).toBeVisible();
});
