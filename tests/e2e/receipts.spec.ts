import { expect, test } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';
import { stockedRice } from './sales-helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('R1 thermal receipts for a till sale and goods received', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);

  // Goods received note on the GRN page
  await page.getByRole('button', { name: 'Receipt' }).click();
  const grn = page.getByRole('dialog');
  const paper = grn.getByTestId('receipt-paper');
  await expect(paper).toContainText('GOODS RECEIVED NOTE');
  await expect(paper).toContainText('Lagos Mills Ltd');
  await expect(paper).toContainText('TOTAL NGN');
  await expect(paper).toContainText('6,000.00');
  await page.screenshot({ path: 'test-results/receipt-grn.png' });
  await grn.getByRole('button', { name: 'Close' }).click();

  // Till sale paid with more cash than needed: the receipt shows the change
  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByLabel('Amount received').fill('2500');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();

  await page.getByRole('button', { name: 'Receipt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Receipt for SI-000001' });
  const receipt = dialog.getByTestId('receipt-paper');
  await expect(receipt).toContainText('SALES RECEIPT');
  await expect(receipt).toContainText('Adezmold Trading Ltd');
  await expect(receipt).toContainText('Rice 50kg bag');
  await expect(receipt).toContainText(/Cash received\s+2,500\.00/);
  await expect(receipt).toContainText(/Change\s+500\.00/);
  await expect(receipt).toContainText(/Paid - Cash on hand\s+2,000\.00/);
  await expect(dialog.getByRole('radio', { name: '58 mm' })).toBeChecked();
  await page.screenshot({ path: 'test-results/receipt-58mm.png' });

  // 80 mm rolls fit 48 characters; the choice is remembered
  await dialog.getByRole('radio', { name: '80 mm' }).click();
  await expect(dialog.getByRole('radio', { name: '80 mm' })).toBeChecked();
  const widest = await receipt.evaluate((el) =>
    Math.max(...[...el.children].map((c) => (c.textContent ?? '').length)),
  );
  expect(widest).toBe(48);
  await page.screenshot({ path: 'test-results/receipt-80mm.png' });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Receipt' }).click();
  await expect(dialog.getByRole('radio', { name: '80 mm' })).toBeChecked();
  await dialog.getByRole('radio', { name: '58 mm' }).click();

  // Fits a phone at the till
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(receipt).toBeInViewport();
  await page.screenshot({ path: 'test-results/receipt-phone.png' });

  // The system print dialog fallback prints only the receipt
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#receipt-print')).toBeVisible();
  await expect(page.locator('#root')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
});
