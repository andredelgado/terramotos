const { test: base, expect } = require('@playwright/test');
const { NOW, meta, payloads } = require('./catalogue');

const test = base.extend({
  feed: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: NOW });
    await page.addInitScript(() => {
      window.testOnline = true;
      Object.defineProperty(navigator, 'onLine', { get: () => window.testOnline });
    });
    let socket;
    const feed = {
      ipmaFails: false,
      async online(value) {
        await page.evaluate((online) => {
          window.testOnline = online;
          window.dispatchEvent(new Event(online ? 'online' : 'offline'));
        }, value);
      },
      sendEvent() {
        expect(socket, 'The mocked EMSC connection must be open').toBeTruthy();
        socket.send(JSON.stringify({ action: 'create', data: { properties: {
          unid: 'smoke-live', evtype: 'ke', lat: 38.4, lon: -9.2,
          time: NOW.toISOString(), mag: 3.1, magtype: 'ML', flynn_region: 'Live test earthquake',
        } } }));
      },
    };
    await page.route('**/data/meta.json', (route) => route.fulfill({ json: meta }));
    await page.route('**/data/years/*.json?*', (route) => {
      const year = /\/(\d+)\.json/.exec(route.request().url())[1];
      return payloads[year] ? route.fulfill({ json: payloads[year] }) : route.fulfill({ status: 404 });
    });
    await page.route('https://api.ipma.pt/**', (route) => route.fulfill({ json: feed.ipmaFails ? { error: 'Unavailable' } : { data: [] } }));
    await page.routeWebSocket('wss://www.seismicportal.eu/**', (connection) => { socket = connection; });
    await use(feed);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  },
});

module.exports = { test, expect };
