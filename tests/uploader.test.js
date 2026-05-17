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

test('openStoryComposer waits for Story Story without clicking it', async () => {
  const calls = [];
  const storyButton = {
    waitFor: async (options) => calls.push(['story.waitFor', options]),
    click: async () => calls.push(['story.click'])
  };
  const homeLink = {
    click: async (options) => calls.push(['home.click', options])
  };
  const navigation = {
    getByRole: (_role, options) => {
      assert.equal(options.name, 'Home');
      return homeLink;
    }
  };
  const page = {
    goto: async (url, options) => calls.push(['goto', url, options]),
    waitForLoadState: async (state, options) => calls.push(['waitForLoadState', state, options]),
    waitForTimeout: async (ms) => calls.push(['waitForTimeout', ms]),
    getByRole: (role, options = {}) => {
      if (role === 'navigation') return navigation;
      if (role === 'button' && options.name.test('Story Story')) return storyButton;
      throw new Error(`Unexpected role lookup: ${role}`);
    }
  };
  const uploader = new InstagramStoryUploader({
    instagramUrl: 'https://www.instagram.com/',
    screenshotDir: '/tmp'
  });
  uploader.checkSecurity = async () => calls.push(['checkSecurity']);
  uploader.screenshot = async (_page, label) => calls.push(['screenshot', label]);

  await uploader.openStoryComposer(page);

  assert.deepEqual(calls.map((call) => call[0]), [
    'goto',
    'waitForLoadState',
    'waitForTimeout',
    'checkSecurity',
    'home.click',
    'screenshot',
    'story.waitFor'
  ]);
  assert.equal(calls.some((call) => call[0] === 'story.click'), false);
});

test('attachMedia arms file chooser before clicking Story Story once', async () => {
  const calls = [];
  const logs = [];
  const originalLog = console.log;
  const chooser = {
    setFiles: async (mediaPath) => calls.push(['chooser.setFiles', mediaPath])
  };
  const storyButton = {
    click: async (options) => calls.push(['story.click', options]),
    setInputFiles: async () => calls.push(['story.setInputFiles'])
  };
  const page = {
    getByRole: (role, options = {}) => {
      assert.equal(role, 'button');
      assert.equal(options.name.test('Story Story'), true);
      return storyButton;
    },
    waitForEvent: async (event, options) => {
      calls.push(['waitForEvent', event, options]);
      return chooser;
    },
    locator: () => ({
      first: () => ({
        count: async () => {
          calls.push(['input.count']);
          return 0;
        },
        setInputFiles: async () => calls.push(['input.setInputFiles'])
      })
    })
  };
  const uploader = new InstagramStoryUploader({});
  uploader.afterMediaSelected = async () => calls.push(['afterMediaSelected']);

  console.log = (...args) => logs.push(args.join(' '));
  try {
    await uploader.attachMedia(page, '/Stories/test.jpeg');
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls.map((call) => call[0]), [
    'waitForEvent',
    'story.click',
    'chooser.setFiles',
    'afterMediaSelected'
  ]);
  assert.equal(calls.filter((call) => call[0] === 'story.click').length, 1);
  assert.ok(logs.indexOf('[instagram-flow] Preparing file chooser before clicking Story Story') < logs.indexOf('[instagram-flow] Clicking Story Story button'));
});

test('waitForUploadCompletion rejects when story verification fails', async () => {
  const calls = [];
  const page = {
    waitForLoadState: async (state, options) => calls.push(['waitForLoadState', state, options]),
    waitForTimeout: async (ms) => calls.push(['waitForTimeout', ms])
  };
  const uploader = new InstagramStoryUploader({});
  uploader.checkSecurity = async () => calls.push(['checkSecurity']);
  uploader.verifyStoryUploaded = async () => {
    calls.push(['verifyStoryUploaded']);
    throw new Error('verification failed');
  };

  await assert.rejects(() => uploader.waitForUploadCompletion(page), /verification failed/);
  assert.deepEqual(calls.map((call) => call[0]), [
    'waitForLoadState',
    'waitForTimeout',
    'checkSecurity',
    'verifyStoryUploaded'
  ]);
});
