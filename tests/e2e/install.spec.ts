import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('I1 BMS is installable and offers an Install app button', async ({ page, request }) => {
  await page.goto('/sign-in');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Adezmold BMS', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
  expect((await request.get('/offline.html')).ok()).toBe(true);

  // The service worker takes control of the page.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
    .toBe('activated');

  // Headless Chromium never offers its own install dialog, so the button shows the steps.
  await page.getByRole('button', { name: 'Install the BMS app on this device' }).click();
  const dialog = page.getByRole('dialog', { name: 'Install the BMS app' });
  await expect(dialog.getByText('Android phone or tablet')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toBeHidden();
});
