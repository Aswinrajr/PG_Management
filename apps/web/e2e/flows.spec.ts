import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.PW_SHOTS;

async function login(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.getByLabel('6-digit code').fill('123456');
}

function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  return problems;
}

async function visit(page: Page, path: string, shot: string, project: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('alert').filter({ hasText: /went wrong|Not found/ })).toHaveCount(0);
  await expect(page.getByText('Page not found')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${project}-${shot}.png`, fullPage: false });
}

test('owner: every page loads, then book, verify and take payment', async ({ page }, info) => {
  const problems = watchProblems(page);
  await login(page, '9000000002');
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const pages: [string, string][] = [
    ['/app/dashboard', 'dashboard'], ['/app/bedmap', 'bedmap'], ['/app/properties', 'properties'], ['/app/residents', 'residents'],
    ['/app/billing/dues', 'dues'], ['/app/billing/invoices', 'invoices'], ['/app/billing/payments', 'payments'], ['/app/billing/electricity', 'electricity'],
    ['/app/expenses', 'expenses'], ['/app/complaints', 'complaints'], ['/app/notices', 'notices'], ['/app/food-menu', 'menu'],
    ['/app/reports', 'reports'], ['/app/settings', 'settings'],
  ];
  for (const [path, shot] of pages) await visit(page, path, shot, info.project.name);

  await page.goto('/app/bedmap');
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'Sunrise Indiranagar' }); // the seed fills the first property
  await page.getByRole('button', { name: /^Vacant/ }).click();
  await page.getByRole('button', { name: /^Room .* bed .*: Vacant/ }).first().click();
  await page.getByRole('button', { name: 'Book this bed' }).click();
  await expect(page.getByRole('heading', { name: 'Add resident' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Next' }).click();

  const phone = `7${String(Date.now()).slice(-9)}`;
  const name = `E2E ${info.project.name} ${phone.slice(-4)}`;
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Full name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/First month:/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create booking' }).click();
  await expect(page.getByText(/is booked/)).toBeVisible();
  await expect(page.getByText(/\/invite\//)).toBeVisible();

  await page.getByRole('link', { name: 'View resident' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('tab', { name: 'KYC' }).click();
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel('Amount (₹)').fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Payment saved')).toBeVisible();
  await expect(page.getByText(/RCP-\d{4}-/)).toBeVisible();
  expect(problems).toEqual([]);
});

test('resident: home, payments, raise a request, profile', async ({ page }, info) => {
  const problems = watchProblems(page);
  await login(page, '9000000012');
  await expect(page).toHaveURL(/\/me/);
  await expect(page.getByRole('heading', { name: /^Hi / })).toBeVisible();
  for (const [path, shot] of [['/me', 'me-home'], ['/me/payments', 'me-payments'], ['/me/requests', 'me-requests'], ['/me/profile', 'me-profile'], ['/me/notices', 'me-notices'], ['/me/menu', 'me-menu']] as const) {
    await visit(page, path, shot, info.project.name);
  }
  await page.goto('/me/requests');
  await page.getByRole('button', { name: 'New request' }).click();
  await page.getByRole('button', { name: 'WiFi' }).click();
  await page.getByLabel('What is the problem?').fill(`Router down ${info.project.name}`);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(`Router down ${info.project.name}`).first()).toBeVisible();
  expect(problems).toEqual([]);
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const upload = (page: Page, label: string) => page.getByLabel(label).setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: PNG });

test('admin: console pages load and a new owner is approved', async ({ page, browser }, info) => {
  const problems = watchProblems(page);

  const context = await browser.newContext();
  const owner = await context.newPage();
  const phone = `8${String(Date.now()).slice(-9)}`;
  const orgName = `Approval PG ${phone.slice(-5)}`;
  await owner.goto('/login');
  await owner.getByRole('link', { name: 'Register your PG' }).click();
  await owner.getByLabel('Mobile number').fill(phone);
  await owner.getByRole('button', { name: 'Get OTP' }).click();
  await owner.getByRole('checkbox').check();
  await owner.getByLabel('6-digit code').fill('123456');
  await expect(owner).toHaveURL(/onboarding/);
  await owner.getByLabel('Business name').fill(orgName);
  await owner.getByLabel('City').fill('Bengaluru');
  await owner.getByLabel('State').fill('Karnataka');
  await owner.getByRole('button', { name: 'Next' }).click();
  await owner.getByLabel('Property name').fill('First House');
  await owner.getByLabel('Address').fill('1 MG Road');
  await owner.getByLabel('City').fill('Bengaluru');
  await owner.getByLabel('State').fill('Karnataka');
  await owner.getByLabel('Pincode').fill('560001');
  await owner.getByRole('button', { name: 'Save' }).click();
  await upload(owner, 'Owner ID proof');
  await expect(owner.getByText('Uploaded')).toHaveCount(1);
  await upload(owner, 'Property proof');
  await expect(owner.getByText('Uploaded')).toHaveCount(2);
  await owner.getByRole('button', { name: 'Submit' }).click();
  await owner.getByRole('link', { name: 'Continue' }).click();
  await expect(owner.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
  await owner.goto('/app/residents');
  await expect(owner.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();

  await login(page, '9000000001');
  await expect(page).toHaveURL(/\/admin/);
  for (const [path, shot] of [['/admin', 'admin'], ['/admin/organizations', 'admin-orgs'], ['/admin/kyc', 'admin-kyc'], ['/admin/plans', 'admin-plans'], ['/admin/broadcasts', 'admin-broadcasts'], ['/admin/audit', 'admin-audit']] as const) {
    await visit(page, path, shot, info.project.name);
  }
  await page.goto('/admin/kyc');
  await page.getByRole('button', { name: orgName }).click();
  await expect(page.getByText('First House')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('button', { name: orgName })).toHaveCount(0);

  await owner.getByRole('button', { name: 'Check status' }).click();
  await expect(owner.getByRole('heading', { name: 'Residents', exact: true })).toBeVisible();
  await context.close();

  await page.goto('/admin/organizations');
  await page.getByText('Sunrise PG').locator('visible=true').first().click();
  await expect(page.getByRole('heading', { name: 'Sunrise PG' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('roles: a resident cannot open the owner app', async ({ page }) => {
  await login(page, '9000000013');
  await expect(page).toHaveURL(/\/me/);
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/\/me/);
});
