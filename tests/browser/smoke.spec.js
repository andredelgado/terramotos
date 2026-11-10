const { test, expect } = require('./fixtures');

test('shared earthquakes restore selection, filters and view across reloads', async ({ page, feed }) => {
  await page.goto('/#v=list&s=1d&m=5&r=0&q=19690228-c63c');
  await expect(page.locator('#tip .mag')).toContainText('M 7.8');
  await expect(page.locator('#mag')).toHaveValue('5');
  await expect(page.locator('#region')).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#rows tr.on')).toContainText('7.8');
  await page.getByRole('button', { name: 'Seismograph', exact: true }).click();
  await expect(page.locator('#spans button[data-span="1d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tip')).toBeVisible();
  await expect(page.locator('#tip')).toHaveCSS('visibility', 'visible');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('#rows tr.on')).toContainText('7.8');
});

test('filters load matching years and show an empty state', async ({ page, feed }) => {
  await page.goto('/#v=list&m=5');
  await expect(page.locator('#rows tr[data-e]')).toHaveCount(3);
  await page.locator('#region').selectOption('2');
  await expect(page.getByText('No earthquakes match these filters.', { exact: true })).toBeVisible();
  await expect(page.locator('#rows tr[data-e]')).toHaveCount(0);
  await page.locator('#region').selectOption('all');
  await expect(page.locator('#rows tr[data-e]')).toHaveCount(3);
  await page.locator('#mag').selectOption('all');
  await page.locator('#jump').selectOption('latest');
  await expect(page.locator('#rows tr[data-e]').first()).toContainText('Newest earthquake');
  expect(await page.locator('#rows tr[data-e]').count()).toBeLessThan(60);
});

test('keyboard navigation selects adjacent earthquakes and reaches both timeline ends', async ({ page, feed }) => {
  await page.goto('/#v=list&q=19690228-c63c');
  await expect(page.locator('#rows tr.on')).toBeVisible();
  await page.locator('#list table').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#tip .where')).toHaveText('Older earthquake');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  await page.keyboard.press('Escape');
  await expect(page.locator('#tip')).toBeHidden();
  await page.locator('#railBox').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#range')).toContainText('1909');
  await page.keyboard.press('Home');
  await expect(page.locator('#range')).toContainText('2026');
  await page.locator('#list table').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#rows tr.on')).toContainText('Newest earthquake');
});

test('time links keep the same moment after reloading', async ({ page, feed }) => {
  await page.goto('/#v=list&t=2026-11-04T12:00:00');
  await expect(page.locator('#rows tr[data-e]')).not.toHaveCount(0);
  await page.clock.runFor(500);
  const shared = page.url();
  expect(shared).toContain('t=2026-11-04T');
  await page.reload();
  await expect(page.locator('#rows tr[data-e]')).not.toHaveCount(0);
  await page.clock.runFor(500);
  await expect(page).toHaveURL(shared);
  await page.locator('#list table').focus();
  await page.keyboard.press('PageDown');
  await expect(page).not.toHaveURL(shared);
});

test('theme preference persists and About explains the generated waves in both languages', async ({ page, feed }) => {
  await page.goto('/#v=list');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.locator('#theme').click();
  await page.reload();
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.locator('#aboutBtn').click();
  await expect(page.locator('#about')).toContainText('generated illustration');
  await page.locator('#about .close').click();
  await page.locator('#lang').click();
  await expect(page.getByRole('button', { name: 'Lista', exact: true })).toBeVisible();
  await page.locator('#aboutBtn').click();
  await expect(page.locator('#about')).toContainText('ilustração gerada');
});

test('touch and desktop layouts keep controls and details within the screen', async ({ page, feed, isMobile }) => {
  await page.goto('/#v=list');
  const first = page.locator('#rows tr[data-e]').first();
  await expect(first).toContainText('Newest earthquake');
  if (isMobile) await first.tap(); else await first.click();
  await expect(page.locator('#tip')).toBeVisible();
  const layout = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      list: box('#list'), card: box('#tip'), main: box('main'),
      labelled: getComputedStyle(document.querySelector('.view-label')).display !== 'none',
      controls: [...document.querySelectorAll('#views button, select')].map((e) => e.getBoundingClientRect().toJSON()),
    };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.labelled).toBe(layout.width > 900);
  for (const control of layout.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(layout.width);
  }
  expect(layout.card.left).toBeGreaterThanOrEqual(layout.main.left);
  expect(layout.card.right).toBeLessThanOrEqual(layout.main.right);
  expect(layout.card.bottom).toBeLessThanOrEqual(layout.main.bottom);
  if (layout.width <= 700) expect(layout.card.top).toBeGreaterThanOrEqual(layout.list.bottom);
  else expect(layout.card.left).toBeGreaterThanOrEqual(layout.list.right);
});

test('an open socket cannot hide stale data, and reconnection recovers offline updates', async ({ page, feed }) => {
  feed.ipmaFails = true;
  await page.goto('/#v=list');
  const status = page.locator('#freshness');
  await expect(status).toHaveAttribute('title', /last update check failed/);
  await expect(status).toHaveText('Updates delayed · Updated 2 h ago');
  await expect(status).not.toHaveClass(/live/);
  feed.ipmaFails = false;
  await feed.online(true);
  await expect(status).toHaveText('Updated just now');
  feed.ipmaFails = true;
  await page.clock.fastForward('16:00');
  await expect(status).toHaveText('Updates delayed · Updated 16 min ago');
  await feed.online(false);
  await expect(status).toHaveText('Offline · Updated 16 min ago');
  await page.locator('#lang').click();
  await expect(status).toHaveText('Sem ligação · Atualizado há 16 min');
  feed.ipmaFails = false;
  await feed.online(true);
  await expect(status).toHaveText('Atualizado agora mesmo');
});

test('a live event updates the latest summary while preserving the historical selection', async ({ page, feed }) => {
  await page.goto('/#v=list&q=19690228-c63c');
  const selection = page.locator('#rows tr.on');
  await expect(selection).toContainText('7.8');
  await expect(page.locator('#freshness')).toHaveAttribute('data-state', 'current');
  await page.clock.runFor(100);
  await expect(selection).toBeInViewport();
  const before = await selection.boundingBox();
  feed.sendEvent();
  await expect(page.locator('#latest')).toContainText('Live Test Earthquake');
  await expect(selection).toContainText('7.8');
  await expect(page.locator('#tip .where')).toHaveText('Azores-Cape St. Vincent Ridge');
  await expect(selection).toBeInViewport();
  const after = await selection.boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test('a shared earthquake survives a failed year request and automatic retry', async ({ page, feed }) => {
  let attempts = 0;
  await page.route('**/data/years/1969.json?*', (route) => ++attempts === 1 ? route.fulfill({ status: 503 }) : route.fallback());
  await page.goto('/#v=list&q=19690228-c63c');
  await expect(page.locator('#inview')).toContainText("Couldn't load 1969");
  await page.clock.fastForward(21000);
  await expect(page.locator('#rows tr.on')).toContainText('7.8');
  await expect(page).toHaveURL(/q=19690228-c63c/);
});

test('an offline first load starts normally when connectivity returns', async ({ page, feed }) => {
  await page.addInitScript(() => { window.testOnline = false; });
  await page.goto('/#v=list');
  await expect(page.locator('#range')).toHaveText('You’re offline. Reconnect to load earthquakes.');
  await expect(page.locator('#freshness')).toHaveText('Offline');
  await feed.online(true);
  await expect(page.locator('#count')).toHaveText('245');
  await expect(page.locator('#rows tr[data-e]').first()).toContainText('Newest earthquake');
  await expect(page.locator('#freshness')).toHaveText('Updated just now');
});

test('leaving a failed shared link cancels its pending selection', async ({ page, feed }) => {
  let attempts = 0;
  await page.route('**/data/years/1969.json?*', (route) => ++attempts === 1 ? route.fulfill({ status: 503 }) : route.fallback());
  await page.goto('/#v=list&q=19690228-c63c');
  await expect(page.locator('#inview')).toContainText("Couldn't load 1969");
  await page.locator('#jump').selectOption('latest');
  await page.clock.fastForward(21000);
  await expect(page.locator('#range')).toContainText('2026');
  await expect(page.locator('#rows tr.on')).toHaveCount(0);
  await expect(page).not.toHaveURL(/q=/);
});
