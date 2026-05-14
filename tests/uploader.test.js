import test from 'node:test';
import assert from 'node:assert/strict';
import { InstagramStoryUploader } from '../src/instagramStoryUploader.js';

test('builds mobile persistent context options from the requested device', () => {
  const uploader = new InstagramStoryUploader({
    headless: false,
    chromeExecutablePath: undefined,
    mobileEmulation: true,
    mobileDevice: 'iPhone 13'
  });

  const options = uploader.contextOptions();
  assert.equal(options.isMobile, true);
  assert.equal(options.hasTouch, true);
  assert.equal(options.headless, false);
  assert.equal(options.viewport.width, 390);
  assert.match(options.userAgent, /iPhone/);
});

test('keeps desktop context options when mobile emulation is disabled', () => {
  const uploader = new InstagramStoryUploader({
    headless: true,
    chromeExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    mobileEmulation: false,
    mobileDevice: 'iPhone 13'
  });

  const options = uploader.contextOptions();
  assert.deepEqual(options, {
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
});
