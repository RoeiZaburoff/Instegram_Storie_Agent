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
