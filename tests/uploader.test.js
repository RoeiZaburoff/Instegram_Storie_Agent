import test from 'node:test';
import assert from 'node:assert/strict';
import { InstagramStoryUploader } from '../src/instagramStoryUploader.js';

test('builds mobile persistent context options from the requested device', () => {
  const uploader = new InstagramStoryUploader({
    headless: false,
    chromeExecutablePath: undefined,
    mobileEmulation: true,
    mobileDevice: 'Pixel 7'
  });

  const options = uploader.contextOptions();
  assert.equal(options.isMobile, true);
  assert.equal(options.hasTouch, true);
  assert.equal(options.headless, false);
  assert.equal(options.viewport.width, 412);
  assert.match(options.userAgent, /Pixel 7|Android/);
  assert.equal(options.defaultBrowserType, 'chromium');
});

test('keeps desktop context options when mobile emulation is disabled', () => {
  const uploader = new InstagramStoryUploader({
    headless: true,
    chromeExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    mobileEmulation: false,
    mobileDevice: 'Pixel 7'
  });

  const options = uploader.contextOptions();
  assert.deepEqual(options, {
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
});

test('throws a clear error when the requested mobile device is unknown', () => {
  const uploader = new InstagramStoryUploader({
    headless: false,
    mobileEmulation: true,
    mobileDevice: 'Not A Real Device'
  });

  assert.throws(() => uploader.contextOptions(), /Unknown Playwright mobile device: Not A Real Device/);
});

test('rejects CDP when mobile emulation is enabled', async () => {
  const uploader = new InstagramStoryUploader({
    mobileEmulation: true,
    chromeCdpUrl: 'http://127.0.0.1:9222'
  });

  await assert.rejects(() => uploader.openBrowser(), /CHROME_CDP_URL cannot be used with MOBILE_EMULATION=true/);
});
