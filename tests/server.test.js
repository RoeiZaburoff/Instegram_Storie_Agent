import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';

async function withServer(callback) {
  const { app } = await import(`../src/server.js?case=${Date.now()}-${Math.random()}`);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('debug config route returns safe runtime configuration values', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/debug/config`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(typeof body.headless, 'boolean');
    assert.equal(typeof body.dryRun, 'boolean');
    assert.equal(body.mobileDevice, process.env.MOBILE_DEVICE ?? 'Pixel 7');
    assert.equal(typeof body.hasChromeCdpUrl, 'boolean');
    assert.equal(typeof body.debugPauseMs, 'number');
    assert.equal(typeof body.keepBrowserOpenOnError, 'boolean');
    assert.equal(typeof body.debugStepMode, 'boolean');
    assert.equal(Object.hasOwn(body, 'whatsappAuthToken'), false);
    assert.equal(Object.hasOwn(body, 'whatsappWebhookUrl'), false);
  });
});
