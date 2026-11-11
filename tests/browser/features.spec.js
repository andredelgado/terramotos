const { test, expect } = require('./fixtures');

// how many pixels of a canvas are blue-ish (the depth and age ramp) rather than grey ink
const bluePixels = (canvas) => canvas.evaluate((element) => {
  const image = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
  let n = 0;
  for (let i = 0; i < image.length; i += 4) if (image[i + 2] > image[i] + 40 && image[i + 3] > 0) n++;
  return n;
});

test('the map can colour earthquakes by depth or age, and remembers the choice', async ({ page, feed }) => {
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  const canvas = page.locator('.map-panel[data-region="0"] canvas');
  await page.clock.runFor(100);
  expect(await bluePixels(canvas)).toBe(0);
  await expect(page.locator('#ramp')).toBeHidden();

  await page.locator('#colour').selectOption('depth');
  await page.clock.runFor(400);
  expect(await bluePixels(canvas)).toBeGreaterThan(20);
  await expect(page.locator('#ramp')).toContainText('km');
  await expect(page).toHaveURL(/c=depth/);

  await page.reload();
  await expect(page.locator('#inview')).toHaveText('8 in view');
  await expect(page.locator('#colour')).toHaveValue('depth');
  await page.locator('#colour').selectOption('age');
  await expect(page.locator('#ramp')).toContainText('older');
  await page.clock.runFor(400);
  expect(await bluePixels(canvas)).toBeGreaterThan(20);
});

test('playback fills the map in from the start of the period and can be paused and scrubbed', async ({ page, feed }) => {
  await page.goto('/#v=map&period=7d');
  await expect(page.locator('#inview')).toHaveText('56 in view');
  const play = page.locator('#playBtn'), inview = page.locator('#inview');
  const shown = async () => Number((await inview.textContent()).split(' ')[0]);
  await expect(play).toHaveAttribute('aria-pressed', 'false');

  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(3000);
  const early = await shown();
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(40);
  await page.clock.runFor(3000);
  const later = await shown();
  expect(later).toBeGreaterThan(early);

  await play.click(); // pause: the map stays where it is
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(200);
  const paused = await shown();
  await page.clock.runFor(3000);
  expect(await shown()).toBe(paused);

  await page.locator('#scrub').fill('500');
  await page.clock.runFor(200);
  const half = await shown();
  expect(half).toBeGreaterThan(20);
  expect(half).toBeLessThan(36);

  await play.click(); // resumes from the scrubbed moment and runs to the end
  await page.clock.runFor(20000);
  await expect(inview).toHaveText('56 in view');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#scrub')).toHaveValue('1000');
});

test('the whole record can be put on the map', async ({ page, feed }) => {
  await page.goto('/#v=map');
  await expect(page.locator('#inview')).toHaveText('8 in view');
  await page.locator('#periods [data-period="all"]').click();
  await expect(page.locator('#inview')).toHaveText('245 in view');
  await expect(page).toHaveURL(/period=all/);
  await expect(page.locator('#range')).toContainText('1909');
});

test('the Year view writes the magnitude on large earthquakes only', async ({ page, feed }) => {
  await page.addInitScript(() => {
    window.drawnText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) { window.drawnText.push(String(text)); return fillText.call(this, text, ...rest); };
  });
  await page.goto('/#s=1y&q=19690228-c63c');
  await expect(page.locator('#tip .where')).toHaveText('Azores-Cape St. Vincent Ridge');
  await page.clock.runFor(300);
  const drawn = await page.evaluate(() => window.drawnText);
  expect(drawn).toContain('7.8');
  expect(drawn).not.toContain('4.5');
  expect(drawn).not.toContain('4.1');
});

test('statistics count what the filters match, per period, and link back to the seismograph', async ({ page, feed }) => {
  await page.goto('/#v=stats');
  const stats = page.locator('#stats');
  await expect(stats.locator('.tiles b').first()).toHaveText('245');
  await expect(stats.locator('.tiles a b')).toHaveText('M 7.8');
  await expect(stats.locator('h2').first()).toHaveText('Earthquakes per year');
  await expect(page.locator('#railBox')).toBeHidden();
  await expect(page.locator('#jump')).toBeHidden();

  await page.locator('#speriods [data-sp="30d"]').click();
  await expect(stats.locator('.tiles b').first()).toHaveText('240');
  await expect(stats.locator('h2').first()).toHaveText('Earthquakes per day');
  await expect(page).toHaveURL(/v=stats&sp=30d/);

  await page.locator('#region').selectOption('2');
  await expect(stats.locator('.tiles b').first()).toHaveText('80');
  await page.locator('#mag').selectOption('4');
  await expect(stats.locator('.tiles b').first()).toHaveText('18');
  await expect(page).toHaveURL(/m=4&r=2/);

  await page.reload();
  await expect(stats.locator('.tiles b').first()).toHaveText('18');
  await page.locator('#lang').click();
  await expect(stats.locator('h2').first()).toHaveText('Sismos por dia');
  await page.locator('#lang').click();

  // the busiest day opens on the seismograph with the same filters
  await stats.locator('.hbars a').first().click();
  await expect(page.locator('#views [data-view="drum"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/m=4&r=2/);
  await expect(page.locator('#railBox')).toBeVisible();
});

test('stories open from the footer, a link and the card, in both languages', async ({ page, feed }) => {
  await page.goto('/');
  await expect(page.locator('#inview')).toContainText('in view');
  await page.locator('#storiesBtn').click();
  const story = page.locator('#story');
  await expect(story.locator('.story-list button')).toHaveCount(4);
  await story.locator('[data-story="19690228-c63c"]').click();
  await expect(story.locator('h2')).toHaveText('28 February 1969');
  await expect(story.locator('.story-meta')).toContainText('M 7.8');
  await expect(story.locator('.page-text p')).toHaveCount(3);
  await expect(page).toHaveURL(/page=19690228-c63c/);

  await page.reload(); // a shared story link
  await expect(story.locator('h2')).toHaveText('28 February 1969');
  await story.locator('.back').click();
  await expect(story.locator('.story-list button')).toHaveCount(4);
  await story.locator('[data-story="19690228-c63c"]').click();

  await story.locator('a', { hasText: 'Open on the map' }).click();
  await expect(story).toBeHidden();
  await expect(page.locator('#views [data-view="map"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tip .where')).toHaveText('Azores-Cape St. Vincent Ridge');
  await expect(page.locator('#inview')).toHaveText('3 in view'); // from the day before to a month after
  await expect(page).not.toHaveURL(/page=/);

  await page.locator('#lang').click();
  await page.locator('#tip .story').click();
  await expect(story.locator('h2')).toHaveText('28 de fevereiro de 1969');
  await page.keyboard.press('Escape');
  await expect(story).toBeHidden();
  await expect(page.locator('#tip')).toBeVisible(); // closing the story keeps the selection
});

test('every earthquake has a page with its details and the earthquakes around it', async ({ page, feed }) => {
  await page.goto('/#page=19690228-2222'); // an earthquake with no text of its own
  const dialog = page.locator('#story');
  await expect(dialog.locator('h2')).toHaveText('Later earthquake');
  await expect(dialog.locator('.story-meta')).toContainText('M 4.2');
  await expect(dialog.locator('.back')).toHaveCount(0);
  await expect(dialog.locator('svg.map')).toBeVisible();
  await expect(dialog).toContainText('2 other earthquakes within 50 km');

  // the largest neighbour is first, and opens its own page with its story
  await dialog.locator('.story-list button').first().click();
  await expect(dialog.locator('h2')).toHaveText('28 February 1969');
  await expect(page).toHaveURL(/page=19690228-c63c/);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/page=/);

  // the card of any earthquake leads to its page
  await page.goto('/#v=list&q=19690228-2222');
  await expect(page.locator('#tip .story')).toHaveText('Details');
  await page.locator('#tip .story').click();
  await expect(dialog.locator('h2')).toHaveText('Later earthquake');
});

test('near a place keeps only the earthquakes around a town, in links and across reloads', async ({ page, feed }) => {
  await page.goto('/#v=list');
  await expect(page.locator('#rows tr[data-e]').first()).toBeVisible();
  const dialog = page.locator('#near'), chip = page.locator('#nearChip'), count = page.locator('#count');
  await expect(chip).toBeHidden();

  await page.locator('#nearBtn').click();
  await dialog.locator('#nearSearch').fill('LISB'); // accents and capitals do not matter
  await dialog.locator('[data-slug="lisboa"]').click();
  await expect(dialog).toBeHidden();
  await expect(chip).toHaveText('Within 50 km of Lisboa');
  await expect(page.locator('#nearBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('7'); // every year is fetched, so the total is exact
  await expect(page.locator('#rows tr[data-e]')).toHaveCount(7);
  await expect(page).toHaveURL(/near=lisboa/);

  await page.locator('#rows tr[data-e]').first().click();
  await expect(page.locator('#tip')).toContainText(/3\d km from Lisboa/);

  await page.reload(); // the link carries the town
  await expect(chip).toHaveText('Within 50 km of Lisboa');
  await expect(count).toHaveText('7');

  await chip.click(); // a wider circle takes in more of the mainland
  await dialog.locator('[data-km="200"]').click();
  await page.keyboard.press('Escape');
  await expect(chip).toHaveText('Within 200 km of Lisboa');
  await expect(page).toHaveURL(/near=lisboa&km=200/);
  expect(Number(await count.textContent())).toBeGreaterThan(7);

  await page.locator('#lang').click();
  await expect(chip).toHaveText('A menos de 200 km de Lisboa');
  await page.locator('#lang').click();

  await chip.click();
  await dialog.locator('#nearClear').click();
  await expect(chip).toBeHidden();
  await expect(page).not.toHaveURL(/near=/);
  await expect(count).toHaveText('245');
});

test('the visitor’s location picks the nearest town and is not put in the link', async ({ page, feed, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 38.531, longitude: -28.642 });
  await page.goto('/');
  await expect(page.locator('#inview')).toContainText('in view');
  await page.locator('#nearBtn').click();
  await page.locator('#nearMe').click();
  await expect(page.locator('#nearChip')).toHaveText('Within 50 km of Horta');
  await expect(page).toHaveURL(/near=horta/);
  expect(page.url()).not.toMatch(/38\.5|28\.6/);
});

test('a visitor far from Portugal is asked to choose a town', async ({ page, feed, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.85, longitude: 2.35 }); // Paris
  await page.goto('/');
  await expect(page.locator('#inview')).toContainText('in view');
  await page.locator('#nearBtn').click();
  await page.locator('#nearMe').click();
  await expect(page.locator('#nearNote')).toHaveText('You are far from Portugal: choose a town instead.');
  await expect(page.locator('#nearChip')).toBeHidden();
  await expect(page.locator('#near')).toBeVisible();
});
