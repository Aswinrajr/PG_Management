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
  await page.getByLabel('PG', { exact: true }).selectOption({ label: 'Sunrise Indiranagar' }); // the seed fills the first property
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
  await page.getByRole('button', { name: 'Close' }).click();

  // Check out too, so the bed is free for the next run.
  await page.getByRole('button', { name: 'Give notice' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Give notice' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check out' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Keys returned').check();
  await sheet.getByLabel('Room inspected').check();
  await sheet.getByRole('button', { name: 'Calculate settlement' }).click();
  await sheet.getByRole('button', { name: 'Confirm check-out' }).click();
  await expect(page.getByText('Checked out').first()).toBeVisible();
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

  const context = await browser.newContext({ geolocation: { latitude: 12.9716, longitude: 77.5946 }, permissions: ['geolocation'] });
  await context.route('**/tile.openstreetmap.org/**', (route) => route.abort());
  await context.route('**/nominatim.openstreetmap.org/reverse**', (route) =>
    route.fulfill({ json: { address: { road: 'MG Road', suburb: 'Shanthala Nagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560001' } } }),
  );
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
  await owner.getByLabel('PG name').fill(orgName);
  await owner.getByRole('button', { name: 'Save and continue' }).click();
  await expect(owner.getByText('Enter a 6-digit pincode')).toBeVisible();
  await expect(owner.getByText('This is required').first()).toBeVisible();
  await owner.getByRole('button', { name: 'Use current location' }).click();
  await expect(owner.getByLabel('City')).toHaveValue('Bengaluru');
  await expect(owner.getByLabel('Address')).toHaveValue('MG Road, Shanthala Nagar');
  await expect(owner.getByLabel('Pincode')).toHaveValue('560001');
  await expect(owner.getByText('This is required')).toHaveCount(0);
  if (SHOTS) await owner.screenshot({ path: `${SHOTS}/${info.project.name}-signup-pg.png`, fullPage: true });
  await owner.getByRole('button', { name: 'Save and continue' }).click();

  // Owner details: the mobile is already filled in, and several files show previews.
  await expect(owner.getByLabel('Mobile number')).toHaveValue(`+91 ${phone}`);
  await owner.getByLabel('Owner name').fill('Test Owner');
  await upload(owner, 'Owner photo');
  await expect(owner.getByRole('button', { name: 'Preview Owner photo 1' })).toBeVisible();
  await owner.getByLabel('Owner ID proof').setInputFiles([1, 2].map((n) => ({ name: `id${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await expect(owner.getByRole('button', { name: 'Preview Owner ID proof 2' })).toBeVisible();
  await owner.getByRole('button', { name: 'Preview Owner ID proof 1' }).click();
  await expect(owner.getByRole('dialog').getByRole('img')).toBeVisible();
  expect(await owner.getByRole('dialog').getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await owner.getByRole('button', { name: 'Close' }).click();

  if (SHOTS) await owner.screenshot({ path: `${SHOTS}/${info.project.name}-signup-owner.png`, fullPage: true });
  // Back keeps everything, then forward again.
  await owner.getByRole('button', { name: 'Back' }).click();
  await expect(owner.getByLabel('PG name')).toHaveValue(orgName);
  await expect(owner.getByLabel('City')).toHaveValue('Bengaluru');
  await owner.getByRole('button', { name: 'Save and continue' }).click();
  await expect(owner.getByLabel('Owner name')).toHaveValue('Test Owner');
  await owner.getByRole('button', { name: 'Save and continue' }).click();

  await upload(owner, 'Property proof');
  await expect(owner.getByRole('button', { name: 'Preview Property proof 1' })).toBeVisible();
  await owner.getByRole('button', { name: 'Submit for approval' }).click();
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
  await expect(page.getByRole('link', { name: 'View on map' })).toBeVisible();
  await expect(page.getByText('Test Owner')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-admin-review.png`, fullPage: true });
  await page.getByLabel('Comments for the owner').fill('ID photo is blurry');
  await page.getByRole('button', { name: 'Send back with comments' }).click();
  await expect(page.getByRole('button', { name: orgName })).toHaveCount(0);

  // The owner sees the comment on a filled-in form, fixes it and sends it again.
  await owner.getByRole('button', { name: 'Check status' }).click();
  await expect(owner.getByText('ID photo is blurry')).toBeVisible();
  if (SHOTS) await owner.screenshot({ path: `${SHOTS}/${info.project.name}-signup-sent-back.png`, fullPage: true });
  await expect(owner.getByLabel('PG name')).toHaveValue(orgName);
  await owner.getByRole('button', { name: 'Save and continue' }).click();
  await owner.getByRole('button', { name: 'Save and continue' }).click();
  await owner.getByRole('button', { name: 'Send again for approval' }).click();
  await expect(owner.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: orgName }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('button', { name: orgName })).toHaveCount(0);

  await owner.getByRole('button', { name: 'Check status' }).click();
  await expect(owner.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
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
