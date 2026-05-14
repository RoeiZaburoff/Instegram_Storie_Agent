import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

async function loadConfigWithEnv(envValue) {
  const previous = process.env.CHROME_USER_DATA_DIR;
  if (envValue === undefined) delete process.env.CHROME_USER_DATA_DIR;
  else process.env.CHROME_USER_DATA_DIR = envValue;

  try {
    const moduleUrl = new URL(`../src/config.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
    return (await import(moduleUrl)).config;
  } finally {
    if (previous === undefined) delete process.env.CHROME_USER_DATA_DIR;
    else process.env.CHROME_USER_DATA_DIR = previous;
  }
}

test('defaults Chrome user data dir to an absolute playwright-profile path', async () => {
  const config = await loadConfigWithEnv(undefined);
  assert.equal(config.chromeUserDataDir, path.resolve('playwright-profile'));
  assert.equal(path.isAbsolute(config.chromeUserDataDir), true);
});

test('resolves provided Chrome user data dir to an absolute path', async () => {
  const config = await loadConfigWithEnv('./custom-profile');
  assert.equal(config.chromeUserDataDir, path.resolve('./custom-profile'));
  assert.equal(path.isAbsolute(config.chromeUserDataDir), true);
});

test('defaults mobile emulation to iPhone 13', async () => {
  const previousEmulation = process.env.MOBILE_EMULATION;
  const previousDevice = process.env.MOBILE_DEVICE;
  delete process.env.MOBILE_EMULATION;
  delete process.env.MOBILE_DEVICE;

  try {
    const moduleUrl = new URL(`../src/config.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
    const config = (await import(moduleUrl)).config;
    assert.equal(config.mobileEmulation, true);
    assert.equal(config.mobileDevice, 'iPhone 13');
  } finally {
    if (previousEmulation === undefined) delete process.env.MOBILE_EMULATION;
    else process.env.MOBILE_EMULATION = previousEmulation;
    if (previousDevice === undefined) delete process.env.MOBILE_DEVICE;
    else process.env.MOBILE_DEVICE = previousDevice;
  }
});

test('allows mobile emulation to be disabled', async () => {
  const previous = process.env.MOBILE_EMULATION;
  process.env.MOBILE_EMULATION = 'false';

  try {
    const moduleUrl = new URL(`../src/config.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
    const config = (await import(moduleUrl)).config;
    assert.equal(config.mobileEmulation, false);
  } finally {
    if (previous === undefined) delete process.env.MOBILE_EMULATION;
    else process.env.MOBILE_EMULATION = previous;
  }
});
