import { expect, test } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';
import { stockedRice } from './sales-helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

const messageOf = async (href: string | null) =>
  decodeURIComponent(new URL(href ?? '').searchParams.get('text') ?? '');

test('W1 WhatsApp receipts and payment reminders', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);

  // Goods received note to a supplier with no phone on file: the chat is chosen in WhatsApp
  await page.getByRole('button', { name: 'WhatsApp' }).click();
  let dialog = page.getByRole('dialog', { name: 'Send on WhatsApp' });
  await expect(dialog.getByTestId('whatsapp-message')).toHaveValue(/\*GOODS RECEIVED NOTE\*/);
  await expect(dialog.getByTestId('whatsapp-message')).not.toHaveValue(/Received by/);
  await expect(dialog.getByText('Leave empty to choose the chat in WhatsApp.')).toBeVisible();
  await expect(dialog.getByTestId('whatsapp-open')).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\?text=/,
  );
  await dialog.getByLabel("Supplier's WhatsApp number").fill('12');
  await expect(dialog.getByText(/Enter a number such as/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Open WhatsApp' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // A customer with a local phone number buys on credit
  await page.goto(`/c/${companyId}/customers`);
  await page.getByRole('button', { name: 'New customer' }).click();
  await page.getByLabel('Code').fill('BOLA');
  await page.getByLabel('Name', { exact: true }).fill('Bola Stores');
  await page.getByLabel('Phone (optional)').fill('0803 123 4567');
  await page.getByLabel('Payment terms (days)').fill('14');
  await page.getByLabel('Credit limit').fill('5000');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'BOLA' }).click();
  await page
    .getByRole('link', { name: 'New sale' })
    .and(page.locator('[href*="customer="]'))
    .click();
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('3');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();

  await page.getByRole('button', { name: 'WhatsApp' }).click();
  dialog = page.getByRole('dialog', { name: 'Send on WhatsApp' });
  await expect(dialog.getByLabel("Customer's WhatsApp number")).toHaveValue('0803 123 4567');
  await expect(dialog.getByText('Opens a chat with +2348031234567.')).toBeVisible();
  const sale = await messageOf(await dialog.getByTestId('whatsapp-open').getAttribute('href'));
  expect(sale).toContain('*SALES INVOICE*');
  expect(sale).toContain('Customer: Bola Stores');
  expect(sale).toContain('• Rice 50kg bag');
  expect(sale).toContain('*Balance due: 3,000.00*');
  expect(sale).toContain('Kindly pay the balance of ₦3,000.00');
  await expect(dialog.getByTestId('whatsapp-open')).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/2348031234567\?text=/,
  );
  await page.screenshot({ path: 'test-results/whatsapp-receipt.png' });
  // Edits to the message go into the link
  await dialog.getByTestId('whatsapp-message').fill('Hello Bola');
  await expect(dialog.getByTestId('whatsapp-open')).toHaveAttribute(
    'href',
    'https://wa.me/2348031234567?text=Hello%20Bola',
  );
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Reminder from the customer's page lists the unpaid invoice
  await page.getByRole('link', { name: 'Bola Stores' }).click();
  await page.getByRole('button', { name: 'Remind on WhatsApp' }).click();
  dialog = page.getByRole('dialog', { name: 'Payment reminder to Bola Stores' });
  await expect(dialog.getByTestId('whatsapp-message')).toHaveValue(
    /shows \*₦3,000\.00\* outstanding[\s\S]*• SI-000001 of/,
  );
  await expect(dialog.getByTestId('whatsapp-message')).toHaveValue(/quote SI-000001/);
  await page.screenshot({ path: 'test-results/whatsapp-reminder.png' });
  await dialog.getByRole('button', { name: 'Close' }).click();

  // And from the receivables ageing, one button per customer
  await page.goto(`/c/${companyId}/reports?tab=receivables`);
  await page.getByRole('button', { name: 'Remind Bola Stores on WhatsApp' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Payment reminder to Bola Stores' })
      .getByTestId('whatsapp-message'),
  ).toHaveValue(/₦3,000\.00/);
});
