import { expect, type Page } from '@playwright/test';

/** A product with a price and 10 bags in stock at 600 each. */
export async function stockedRice(page: Page, companyId: string) {
  await page.goto(`/c/${companyId}/suppliers`);
  await page.getByRole('button', { name: 'New supplier' }).click();
  await page.getByLabel('Code').fill('MILLS');
  await page.getByLabel('Name', { exact: true }).fill('Lagos Mills Ltd');
  await page.getByLabel('Payment terms (days)').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /MILLS/ })).toBeVisible();

  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill('RICE-50');
  await page.getByLabel('Name').fill('Rice 50kg bag');
  await page.getByLabel('Unit').selectOption('bag');
  await page.getByLabel(/Selling price/).fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /RICE-50/ })).toBeVisible();

  await page.goto(`/c/${companyId}/purchases/receipts/new`);
  await page.getByLabel('Supplier').selectOption({ label: 'MILLS · Lagos Mills Ltd' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('10');
  await page.getByLabel('Line 1 unit cost').fill('600');
  await page.getByRole('button', { name: 'Post receipt' }).click();
  await expect(page.getByRole('heading', { name: 'Goods received GRN-000001' })).toBeVisible();
}

export async function newCustomer(
  page: Page,
  companyId: string,
  code: string,
  creditLimit: string,
) {
  await page.goto(`/c/${companyId}/customers`);
  await page.getByRole('button', { name: 'New customer' }).click();
  await page.getByLabel('Code').fill(code);
  await page.getByLabel('Name', { exact: true }).fill(`${code} Stores`);
  await page.getByLabel('Payment terms (days)').fill('14');
  await page.getByLabel('Credit limit').fill(creditLimit);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: new RegExp(code) })).toBeVisible();
}
