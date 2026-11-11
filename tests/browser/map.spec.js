const { test, expect } = require('./fixtures');

async function mapWindow(page) {
  await expect(page.locator('#range')).toHaveAttribute('title', /Z – .*Z$/);
  return page.evaluate(() => {
    const [from, to] = document.querySelector('#range').title.split(' – ');
    return { from, to };
  });
}

async function redDot(canvas) {
  return canvas.evaluate((element) => {
    const image = element.getContext('2d').getImageData(0, 0, element.width, element.height);
    let x = 0, y = 0, n = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i] > 150 && image.data[i + 1] < 120 && image.data[i + 2] < 120) {
        const pixel = i / 4; x += pixel % element.width; y += Math.floor(pixel / element.width); n++;
      }
    }
    return n ? { x: x / n * element.clientWidth / element.width, y: y / n * element.clientHeight / element.height } : null;
  });
}

test('the first map uses the last 24 hours and the returning visitor keeps their view', async ({ page, feed }) => {
  await page.addInitScript(() => {
    window.historyWrites = 0;
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args) => { window.historyWrites++; return replace(...args); };
  });
  const origins = new Set();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Seismograph', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('#inview')).toHaveText('8 in view');
  await expect(page.locator('.map-count')).toHaveText(['3', '3', '2']);
  await page.clock.runFor(500);
  await expect(page).toHaveURL(/#v=map$/);
  const url = page.url(), writes = await page.evaluate(() => window.historyWrites);
  const range = await mapWindow(page);
  expect(Date.parse(range.to) - Date.parse(range.from)).toBe(86400000);
  await page.clock.fastForward('01:00');
  await page.clock.runFor(500);
  expect(Date.parse((await mapWindow(page)).to)).toBeGreaterThan(Date.parse(range.to));
  await expect(page).toHaveURL(url);
  expect(await page.evaluate(() => window.historyWrites)).toBe(writes);
  expect([...origins]).toEqual(expect.arrayContaining(['http://127.0.0.1:8765']));
  expect([...origins].every((origin) => ['http://127.0.0.1:8765', 'https://api.ipma.pt'].includes(origin))).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#inview')).toHaveText('8 in view');
});

test('copying a rolling map snapshots dates, filters and selection without freezing the original', async ({ page, feed }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText(text) { window.copiedLink = text; return Promise.resolve(); },
    } });
  });
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  await page.locator('#periods button[data-period="7d"]').click();
  await expect(page.locator('#inview')).toHaveText('56 in view');
  await page.locator('#mag').selectOption('3');
  await page.locator('#region').selectOption('0');
  await page.locator('.map-panel[data-region="0"] canvas').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');
  await page.clock.runFor(500);
  const rolling = page.url();
  await expect(page).toHaveURL(/period=7d&m=3&r=0&q=20261110-0000$/);
  await page.locator('#tip .copy').click();
  const range = await mapWindow(page), shared = await page.evaluate(() => window.copiedLink);
  const params = new URLSearchParams(new URL(shared).hash.slice(1));
  expect(Object.fromEntries(params)).toEqual({ v: 'map', ...range, m: '3', r: '0', q: '20261110-0000' });
  expect(Date.parse(range.to) - Date.parse(range.from)).toBe(7 * 86400000);
  await page.clock.fastForward('01:00');
  await page.clock.runFor(500);
  await expect(page).toHaveURL(rolling);
  expect(Date.parse((await mapWindow(page)).to)).toBeGreaterThan(Date.parse(range.to));
  await page.goto(shared);
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');
  await expect.poll(() => mapWindow(page)).toEqual(range);
  await page.reload();
  await expect(page.locator('#periods button[data-period="view"]')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.fastForward('24:00:00');
  await expect(page).toHaveURL(shared);
  expect(await mapWindow(page)).toEqual(range);
});

test('map filters and time choices preserve their state in links', async ({ page, feed }) => {
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  await page.locator('#mag').selectOption('3');
  await expect(page.locator('#inview')).toHaveText('5 in view');
  await page.locator('#region').selectOption('0');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  await expect(page.locator('.map-panel:visible')).toHaveCount(1);
  await page.clock.runFor(500);
  const url = page.url();
  await page.reload();
  await expect(page.locator('#mag')).toHaveValue('3');
  await expect(page.locator('#region')).toHaveValue('0');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  await expect(page).toHaveURL(url);
  await page.locator('#mag').selectOption('5');
  await expect(page.locator('#mapEmpty')).toBeVisible();
  await expect(page.locator('#inview')).toHaveText('0 in view');
  await page.locator('#mag').selectOption('all');
  await page.locator('#region').selectOption('all');
  await page.locator('#periods button[data-period="30d"]').click();
  await expect(page.locator('#inview')).toHaveText('240 in view');
  await page.locator('#periods button[data-period="1y"]').click();
  await expect(page.locator('#inview')).toHaveText('240 in view');
  await page.clock.runFor(500);
  const year = await mapWindow(page);
  expect(Date.parse(year.to) - Date.parse(year.from)).toBe(365 * 86400000);
  await expect(page).toHaveURL(/#v=map&period=1y$/);
  const rolling = page.url();
  await page.reload();
  await expect(page.locator('#periods button[data-period="1y"]')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.fastForward('01:00');
  await page.clock.runFor(500);
  await expect(page).toHaveURL(rolling);
  expect(Date.parse((await mapWindow(page)).to)).toBeGreaterThan(Date.parse(year.to));
  await page.goto('/#v=map');
  await expect(page.locator('#periods button[data-period="24h"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#v=map$/);
});

test('entering the map from a historical drum carries the visible period', async ({ page, feed }) => {
  await page.goto('/#s=1d&q=19690228-c63c');
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('#inview')).toHaveText('3 in view');
  await expect(page).toHaveURL(/from=.*to=/);
  const range = await mapWindow(page), eventTime = Date.parse('1969-02-28T02:40:34Z');
  expect(Date.parse(range.from)).toBeLessThan(eventTime);
  expect(Date.parse(range.to)).toBeGreaterThan(eventTime);
  expect(Date.parse(range.to) - Date.parse(range.from)).toBeGreaterThan(86400000);
  await expect(page.locator('#tip .mag')).toContainText('7.8');
});

test('a historical selection and its map window carry across all three views', async ({ page, feed }) => {
  await page.goto('/#v=list&q=19690228-c63c');
  await expect(page.locator('#rows tr.on')).toContainText('7.8');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  await page.clock.runFor(500);
  await expect(page).toHaveURL(/from=.*to=/);
  const range = await mapWindow(page), eventTime = Date.parse('1969-02-28T02:40:34Z');
  expect(Date.parse(range.from)).toBeLessThanOrEqual(eventTime);
  expect(Date.parse(range.to)).toBeGreaterThanOrEqual(eventTime);
  for (const view of ['Seismograph', 'List']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('#tip .mag')).toContainText('7.8');
    await page.clock.runFor(500);
    expect(await mapWindow(page)).toEqual(range);
  }
  await page.reload();
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  expect(await mapWindow(page)).toEqual(range);
});

test('changing the period keeps geography fixed and a selected dot can be tapped', async ({ page, feed, isMobile }) => {
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  const canvas = page.locator('.map-panel[data-region="0"] canvas');
  await canvas.focus(); await page.keyboard.press('End');
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');
  await page.clock.runFor(100);
  await expect.poll(() => redDot(canvas)).not.toBeNull();
  const before = await redDot(canvas);
  await page.locator('#periods button[data-period="7d"]').click();
  await expect(page.locator('#inview')).toHaveText('56 in view');
  await page.clock.runFor(100);
  const after = await redDot(canvas);
  expect(after).not.toBeNull();
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  if (isMobile) await canvas.tap({ position: after }); else await canvas.click({ position: after });
  await expect(page.locator('#tip')).toBeHidden();
});

test('map layout and localization work with a pinned event', async ({ page, feed }) => {
  await page.goto('/#v=map&from=1969-02-27T00:00:00Z&to=1969-03-01T00:00:00Z&q=19690228-c63c');
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  await page.locator('#lang').click();
  await expect(page.getByRole('button', { name: 'Mapa', exact: true })).toBeVisible();
  await expect(page.locator('#mapName0')).toHaveText('Continente');
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  const layout = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
    return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, card: box('#tip'), map: box('#atlas'), main: box('main'), controls: [...document.querySelectorAll('.controls button:not([hidden]), .controls select')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().toJSON()) };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.card.bottom).toBeLessThanOrEqual(layout.main.bottom);
  if (layout.width <= 700) expect(layout.card.top).toBeGreaterThanOrEqual(layout.map.bottom);
  for (const control of layout.controls) expect(control.right).toBeLessThanOrEqual(layout.width);
});

test('larger magnitudes have visibly larger halos without moving the location', async ({ page, feed }) => {
  await page.goto('/#v=map&from=1969-02-27T00:00:00Z&to=1969-03-01T00:00:00Z');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  const canvas = page.locator('.map-panel[data-region="0"] canvas');
  const footprint = () => canvas.evaluate((element) => {
    const { data } = element.getContext('2d').getImageData(0, 0, element.width, element.height);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 150 && data[i + 1] < 120 && data[i + 2] < 120) {
        const x = (i / 4) % element.width, y = Math.floor(i / 4 / element.width);
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { diameter: (right - left) * element.clientWidth / element.width, x: (left + right) / 2 * element.clientWidth / element.width, y: (top + bottom) / 2 * element.clientHeight / element.height };
  });
  await canvas.focus(); await page.keyboard.press('End');
  await expect(page.locator('#tip .mag')).toContainText('4.2');
  await page.clock.runFor(100);
  const small = await footprint();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  await page.clock.runFor(100);
  const large = await footprint();
  expect(small.diameter).toBeGreaterThan(10);
  expect(large.diameter).toBeGreaterThan(small.diameter * 2);
  expect(Math.abs(large.x - small.x)).toBeLessThan(1);
  expect(Math.abs(large.y - small.y)).toBeLessThan(1);
});

test('live arrivals do not change a shared historical map window', async ({ page, feed }) => {
  await page.goto('/#v=map&from=1969-02-27T00:00:00Z&to=1969-03-01T00:00:00Z&q=19690228-c63c');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  const range = await mapWindow(page);
  feed.sendEvent();
  await expect(page.locator('#latest')).toContainText('Live Test Earthquake');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  expect(await mapWindow(page)).toEqual(range);
  await page.locator('#periods button[data-period="24h"]').click();
  await expect(page.locator('#tip')).toBeHidden();
  await expect(page).not.toHaveURL(/q=/);
});

test('a large selected halo does not steal taps from a nearby smaller quake', async ({ page, feed, isMobile }) => {
  const data = JSON.parse(JSON.stringify(require('./catalogue').payloads[1969]));
  const smallIndex = data.id.indexOf('19690228-2222');
  data.m[smallIndex] = 10;
  data.lon[smallIndex] += 30;
  await page.route('**/data/years/1969.json?*', (route) => route.fulfill({ json: data }));
  await page.goto('/#v=map&from=1969-02-27T00:00:00Z&to=1969-03-01T00:00:00Z');
  await expect(page.locator('#inview')).toHaveText('3 in view');
  const canvas = page.locator('.map-panel[data-region="0"] canvas');
  await canvas.focus(); await page.keyboard.press('End');
  await expect(page.locator('#tip .mag')).toContainText('1.0');
  await page.clock.runFor(100);
  const target = await redDot(canvas);
  expect(target).not.toBeNull();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tip .mag')).toContainText('7.8');
  await page.clock.runFor(100);
  if (isMobile) await canvas.tap({ position: target }); else await canvas.click({ position: target });
  await expect(page.locator('#tip .mag')).toContainText('1.0');
});
