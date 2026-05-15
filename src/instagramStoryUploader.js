import fs from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import path from 'node:path';

const SECURITY_PATTERNS = [/security/i, /verification/i, /two-factor/i, /two factor/i, /enter code/i, /suspicious/i];

export class SecurityCheckRequiredError extends Error {
  constructor(message = 'Instagram security verification screen detected.') {
    super(message);
    this.name = 'SecurityCheckRequiredError';
  }
}

export class InstagramStoryUploader {
  constructor(options) {
    this.options = options;
  }

  async uploadStory({ mediaPath, caption = '', metadata = {} }) {
    if (this.options.dryRun) {
      await humanDelay(50, 150);
      return { dryRun: true };
    }

    const browserSession = await this.openBrowser();
    const { browser, context, page, close } = browserSession;
    let uploadError;
    try {
      await page.goto(this.options.instagramUrl, { waitUntil: 'domcontentloaded' });
      await this.checkSecurity(page);
      await humanDelay();
      await naturalScroll(page);
      await this.openStoryComposer(page);
      await this.attachMedia(page, mediaPath);
      await this.decorateStory(page, caption, metadata);
      await this.share(page);
      await this.waitForUploadCompletion(page);
      return { browserConnected: Boolean(browser), contextPages: context.pages().length };
    } catch (error) {
      uploadError = error;
      if (!(error instanceof SecurityCheckRequiredError)) {
        error.screenshotPath = await this.screenshot(page).catch(() => undefined);
      }
      if (this.options.debugPauseMs > 0) {
        console.log(`[playwright-debug] Pausing ${this.options.debugPauseMs}ms before cleanup.`);
        await page.waitForTimeout(this.options.debugPauseMs).catch(() => null);
      }
      throw error;
    } finally {
      if (uploadError && this.options.keepBrowserOpenOnError) {
        console.log('[playwright-debug] Keeping browser open after error because KEEP_BROWSER_OPEN_ON_ERROR=true.');
      } else {
        await close();
      }
    }
  }

  async openBrowser() {
    if (this.options.mobileEmulation && this.options.chromeCdpUrl) {
      throw new Error('CHROME_CDP_URL cannot be used with MOBILE_EMULATION=true. Unset CHROME_CDP_URL.');
    }

    if (this.options.chromeCdpUrl) {
      console.log(`[browser] Connecting to existing Chrome over CDP: ${this.options.chromeCdpUrl}`);
      const browser = await chromium.connectOverCDP(this.options.chromeCdpUrl);
      const context = browser.contexts()[0] ?? await browser.newContext();
      const page = context.pages()[0] ?? await context.newPage();
      return { browser, context, page, close: () => browser.close() };
    }

    const userDataDir = this.options.chromeUserDataDir;
    if (!userDataDir) {
      throw new Error('CHROME_USER_DATA_DIR is required for persistent Playwright profile launch.');
    }

    await fs.mkdir(userDataDir, { recursive: true });

    console.log('[playwright] userDataDir:', userDataDir);
    console.log('[playwright] headless:', this.options.headless);
    console.log('[playwright] mobileEmulation:', this.options.mobileEmulation);
    console.log('[playwright] mobileDevice:', this.options.mobileDevice);

    const contextOptions = this.contextOptions();
    const context = await chromium.launchPersistentContext(userDataDir, contextOptions);
    const page = context.pages()[0] || await context.newPage();

    console.log('[playwright-debug]', await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      width: window.innerWidth,
      height: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints
    })));

    return { context, page, close: () => context.close() };
  }

  contextOptions() {
    const baseOptions = {
      headless: this.options.headless,
      executablePath: this.options.chromeExecutablePath
    };

    if (!this.options.mobileEmulation) {
      console.log('[playwright] device descriptor:', null);
      console.log('[browser] Reminder: Instagram Story upload normally requires mobile web mode.');
      return baseOptions;
    }

    const requestedDevice = this.options.mobileDevice || 'iPhone 13';
    const device = devices[requestedDevice];
    if (!device) {
      throw new Error(`Unknown Playwright mobile device: ${requestedDevice}`);
    }

    const contextOptions = {
      ...device,
      headless: this.options.headless,
      executablePath: this.options.chromeExecutablePath
    };

    console.log('[playwright] device descriptor:', device);
    console.log(`[browser] Mobile viewport: ${device.viewport.width}x${device.viewport.height} @ ${device.deviceScaleFactor}x`);
    console.log(`[browser] Mobile user agent: ${device.userAgent}`);
    console.log('[browser] Reminder: Instagram Story upload requires mobile web mode.');
    return contextOptions;
  }

  async openStoryComposer(page) {
    await clickFirst(page, [
      page.getByRole('link', { name: /create/i }),
      page.getByRole('button', { name: /create/i }),
      page.locator('svg[aria-label="New post"]').locator('xpath=ancestor::*[@role="button" or @role="link"][1]')
    ], 'Create button');
    await humanDelay();
    await clickFirst(page, [
      page.getByRole('menuitem', { name: /story/i }),
      page.getByText(/^story$/i),
      page.getByRole('button', { name: /story/i })
    ], 'Story option');
  }

  async attachMedia(page, mediaPath) {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await humanDelay();
    const directInput = page.locator('input[type="file"]').first();
    if (await directInput.count()) {
      await directInput.setInputFiles(mediaPath);
      return;
    }
    await clickFirst(page, [
      page.getByRole('button', { name: /select from computer|upload|choose/i }),
      page.getByText(/select from computer|upload|choose/i)
    ], 'Media upload button');
    const chooser = await chooserPromise;
    if (!chooser) throw new Error('File chooser did not open.');
    await chooser.setFiles(mediaPath);
  }

  async decorateStory(page, caption, metadata) {
    const textEntries = [caption, ...(metadata.hashtags ?? [])].filter(Boolean);
    if (textEntries.length) {
      await addText(page, textEntries.join(' '));
    }
    if (metadata.locationTag) await addStickerBySearch(page, 'location', metadata.locationTag);
    if (metadata.businessTag) await addStickerBySearch(page, 'mention', metadata.businessTag);
  }

  async share(page) {
    await this.checkSecurity(page);
    await humanDelay();
    await clickFirst(page, [
      page.getByRole('button', { name: /share to story|your story|share/i }),
      page.getByText(/share to story|your story|share/i)
    ], 'Share to Story button');
  }

  async waitForUploadCompletion(page) {
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(randomInt(3000, 6000));
    await this.checkSecurity(page);
  }

  async checkSecurity(page) {
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    if (SECURITY_PATTERNS.some((pattern) => pattern.test(bodyText))) {
      throw new SecurityCheckRequiredError();
    }
  }

  async screenshot(page, label = 'instagram-error') {
    await fs.mkdir(this.options.screenshotDir, { recursive: true });
    const output = path.join(this.options.screenshotDir, `${label}-${Date.now()}.png`);
    await page.screenshot({ path: output, fullPage: true });
    return output;
  }
}

async function addText(page, text) {
  await humanDelay();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+T' : 'Control+T').catch(() => null);
  await humanDelay();
  await page.mouse.click(randomInt(320, 620), randomInt(280, 520));
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomInt(35, 145) });
  }
}

async function addStickerBySearch(page, stickerKind, query) {
  await humanDelay();
  await clickFirst(page, [
    page.getByRole('button', { name: /sticker/i }),
    page.locator('svg[aria-label*="Sticker" i]').locator('xpath=ancestor::*[@role="button"][1]')
  ], `${stickerKind} sticker button`);
  await humanDelay();
  await clickFirst(page, [page.getByText(new RegExp(stickerKind, 'i'))], `${stickerKind} sticker`);
  const search = page.getByRole('textbox').last();
  await search.fill('');
  for (const char of query) await search.type(char, { delay: randomInt(45, 160) });
  await humanDelay();
  await clickFirst(page, [page.getByText(new RegExp(escapeRegExp(query), 'i')).first()], `${stickerKind} search result`);
}

async function clickFirst(page, locators, label) {
  for (const locator of locators) {
    if (await locator.count().catch(() => 0)) {
      await locator.first().click({ timeout: 8000 });
      return;
    }
  }
  throw new Error(`${label} not found.`);
}

async function naturalScroll(page) {
  await page.mouse.wheel(0, randomInt(180, 420));
  await humanDelay();
  await page.mouse.wheel(0, -randomInt(80, 220));
}

async function humanDelay(min = 2000, max = 7000) {
  await new Promise((resolve) => setTimeout(resolve, randomInt(min, max)));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
