import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await expect(page).not.toHaveURL(/login/);
}

test('owner designs a room and adds a machine; resident sees both', async ({ page, browser }, info) => {
  await login(page, '9000000002');
  await page.goto('/app/bedmap');
  await page.getByRole('link', { name: /Design room/ }).first().click();
  await expect(page.getByRole('heading', { name: /Design room/ })).toBeVisible();
  await page.getByRole('button', { name: 'Window' }).click();

  const bed = page.locator('[data-bed="A"]');
  const box = (await bed.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(bed).not.toHaveAttribute('transform', 'translate(0 0)');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.goto('/app/laundry');
  await page.getByRole('button', { name: 'Add machine' }).click();
  const name = `Washer ${info.project.name} ${Date.now() % 10000}`;
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(name)).toBeVisible();

  const context = await browser.newContext();
  const resident = await context.newPage();
  await login(resident, '9000000011');
  await resident.goto('/me/room');
  await expect(resident.getByRole('img', { name: /Room plan/ })).toBeVisible();

  await resident.goto('/me/laundry');
  await resident.getByRole('tab', { name: 'Tomorrow' }).click();
  const card = resident.locator('section').filter({ hasText: name });
  await card.getByRole('button', { name: /Free/ }).first().click();
  await resident.getByRole('button', { name: 'Book slot' }).click();
  await expect(resident.getByRole('button', { name: 'Start wash' }).first()).toBeVisible();
  await resident.getByRole('button', { name: 'Cancel' }).first().click();
  await context.close();
});

test('two residents chat live in a game', async ({ page, browser }, info) => {
  await login(page, '9000000014');
  await page.goto('/me/games');
  await page.getByRole('button', { name: 'Host a game' }).click();
  const title = `Turf ${info.project.name} ${Date.now() % 100000}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Venue').fill('Play Arena');
  await page.getByLabel('Date and time').fill('2030-01-05T18:00');
  await page.getByRole('button', { name: 'Host game' }).click();
  await page.locator('section').filter({ hasText: title }).getByRole('link', { name: 'Open chat' }).click();
  await expect(page.getByRole('log')).toBeVisible();

  const context = await browser.newContext();
  const friend = await context.newPage();
  await login(friend, '9000000015');
  await friend.goto('/me/games');
  await friend.locator('section').filter({ hasText: title }).getByRole('button', { name: 'Join game' }).click();
  await expect(friend.getByRole('log')).toBeVisible();

  await friend.getByLabel('Message').fill('On my way');
  await friend.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('log').getByText('On my way')).toBeVisible();
  await page.getByLabel('Message').fill('See you there');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(friend.getByRole('log').getByText('See you there')).toBeVisible();
  await context.close();
});
