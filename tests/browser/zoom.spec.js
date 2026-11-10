const { test, expect } = require('./fixtures');

// where the selected (red) earthquake is drawn, in CSS pixels
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

async function openMapWithSelection(page) {
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  const canvas = page.locator('.map-panel[data-region="0"] canvas');
  await canvas.focus(); await page.keyboard.press('End');
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');
  await page.clock.runFor(100);
  await expect.poll(() => redDot(canvas)).not.toBeNull();
  return canvas;
}

test('the zoom buttons enlarge one panel about its middle and reset restores the frame', async ({ page, feed }) => {
  const canvas = await openMapWithSelection(page);
  const panel = page.locator('.map-panel[data-region="0"]');
  const before = await redDot(canvas);
  const size = await canvas.evaluate((element) => ({ w: element.clientWidth, h: element.clientHeight }));
  await expect(panel.locator('[data-zoom="out"]')).toBeDisabled();
  await expect(panel.locator('[data-zoom="reset"]')).toBeHidden();

  await panel.locator('[data-zoom="in"]').click();
  await expect(canvas).toHaveAttribute('data-zoom', '1.6');
  await expect(page.locator('.map-panel[data-region="1"] canvas')).toHaveAttribute('data-zoom', '1');
  await page.clock.runFor(100);
  const zoomed = await redDot(canvas);
  // distances from the middle of the panel grow by the zoom factor
  expect(Math.abs((zoomed.x - size.w / 2) - 1.6 * (before.x - size.w / 2))).toBeLessThan(2);
  expect(Math.abs((zoomed.y - size.h / 2) - 1.6 * (before.y - size.h / 2))).toBeLessThan(2);
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');

  await panel.locator('[data-zoom="reset"]').click();
  await expect(canvas).toHaveAttribute('data-zoom', '1');
  await expect(panel.locator('[data-zoom="reset"]')).toBeHidden();
  await page.clock.runFor(100);
  const after = await redDot(canvas);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test('dragging a zoomed map moves it without changing the selection', async ({ page, feed, browserName, isMobile }) => {
  test.skip(browserName === 'webkit' && isMobile, 'the simulated mouse does not move the map in emulated mobile Safari; the touch test below covers it');
  const canvas = await openMapWithSelection(page);
  await page.locator('.map-panel[data-region="0"] [data-zoom="in"]').click();
  await page.clock.runFor(100);
  const before = await redDot(canvas);
  const box = await canvas.boundingBox();
  const start = { x: box.x + 30, y: box.y + 30 }; // open sea, away from the earthquakes
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 15, { steps: 4 });
  await page.mouse.move(start.x + 40, start.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.clock.runFor(100);
  const after = await redDot(canvas);
  expect(Math.abs(after.x - before.x - 40)).toBeLessThan(6);
  expect(Math.abs(after.y - before.y - 30)).toBeLessThan(6);
  // releasing over empty sea would normally clear the selection; after a drag it must not
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');
});

test('a finger drags a zoomed map, and two fingers pinch it larger', async ({ page, feed }) => {
  const canvas = await openMapWithSelection(page);
  await page.locator('.map-panel[data-region="0"] [data-zoom="in"]').click();
  await page.clock.runFor(100);
  const before = await redDot(canvas);
  const box = await canvas.boundingBox();
  const touch = (type, id, x, y) => canvas.dispatchEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, clientX: box.x + x, clientY: box.y + y,
  });
  await touch('pointerdown', 1, 30, 30);
  await touch('pointermove', 1, 50, 45);
  await touch('pointermove', 1, 70, 60);
  await touch('pointerup', 1, 70, 60);
  await page.clock.runFor(100);
  const after = await redDot(canvas);
  expect(Math.abs(after.x - before.x - 40)).toBeLessThan(6);
  expect(Math.abs(after.y - before.y - 30)).toBeLessThan(6);

  await touch('pointerdown', 1, 100, 100);
  await touch('pointerdown', 2, 140, 100);
  await touch('pointermove', 2, 150, 100); // the first move only measures the spread
  await touch('pointermove', 2, 200, 100);
  await touch('pointerup', 2, 200, 100);
  await touch('pointerup', 1, 100, 100);
  const zoom = Number(await canvas.getAttribute('data-zoom'));
  expect(zoom).toBeGreaterThan(2.5); // 1.6 × (100 / 50)
  expect(zoom).toBeLessThan(3.5);
});

test('the keyboard zooms the focused panel', async ({ page, feed }) => {
  const canvas = await openMapWithSelection(page);
  await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-zoom', '1.6');
  await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-zoom', '2.56');
  await page.keyboard.press('-');
  await expect(canvas).toHaveAttribute('data-zoom', '1.6');
  await page.keyboard.press('0');
  await expect(canvas).toHaveAttribute('data-zoom', '1');
  await expect(page.locator('#tip .where')).toHaveText('Newest earthquake');
});

test('layers are remembered, and the fault data is fetched only when asked for', async ({ page, feed }) => {
  let faultRequests = 0;
  page.on('request', (request) => { if (request.url().endsWith('/faults.json')) faultRequests++; });
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  const layer = (name) => page.locator(`#layers button[data-layer="${name}"]`);
  await expect(layer('plates')).toHaveAttribute('aria-pressed', 'true');
  await expect(layer('faults')).toHaveAttribute('aria-pressed', 'false');
  await expect(layer('volcanoes')).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(200);
  expect(faultRequests).toBe(0);

  await layer('faults').click();
  await layer('plates').click();
  await expect(layer('faults')).toHaveAttribute('aria-pressed', 'true');
  await expect(layer('plates')).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(200);
  await expect.poll(() => faultRequests).toBe(1);

  await page.reload();
  await expect(page.locator('#inview')).toHaveText('8 in view');
  await expect(layer('faults')).toHaveAttribute('aria-pressed', 'true');
  await expect(layer('plates')).toHaveAttribute('aria-pressed', 'false');
  await expect(layer('volcanoes')).toHaveAttribute('aria-pressed', 'false');
});
