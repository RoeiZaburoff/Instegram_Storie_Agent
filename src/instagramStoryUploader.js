import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const SECURITY_PATTERNS = [/security/i, /verification/i, /two-factor/i, /two factor/i, /enter code/i, /suspicious/i];
const UPLOAD_ERROR_PATTERNS = [/couldn't upload/i, /couldn’t upload/i, /upload failed/i, /try again/i, /something went wrong/i, /not uploaded/i];
const ADD_TO_STORY_PATTERN = /add to your story/i;
const SHARE_BUTTON_PATTERN = /share to story|your story|share|add to your story/i;

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

    const requestedDevice = this.options.mobileDevice || 'Pixel 7';
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
    console.log('[instagram-flow] Opening Instagram home');
    await page.goto(this.options.instagramUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(3000);
    await this.checkSecurity(page);

    console.log('[instagram-flow] Clicking Home if available');
    await page.getByRole('navigation').getByRole('link', { name: 'Home' }).click({ timeout: 8000 }).catch(() => null);

    await this.screenshot(page, 'before-story-story').catch(() => null);

    const storyButton = page.getByRole('button', { name: /Story Story/i });
    await storyButton.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[instagram-flow] Story Story button is visible');
  }

  async attachMedia(page, mediaPath) {
    const storyButton = page.getByRole('button', { name: /Story Story/i });

    let chooserPromise;
    try {
      console.log('[instagram-flow] Preparing file chooser before clicking Story Story');
      chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
      console.log('[instagram-flow] Clicking Story Story button');
      await storyButton.click({ timeout: 15000 });
      const chooser = await chooserPromise;
      console.log('[instagram-flow] Setting file:', mediaPath);
      await chooser.setFiles(mediaPath);
      await this.afterMediaSelected(page);
      return;
    } catch (error) {
      if (chooserPromise) await chooserPromise.catch(() => null);
      console.log('[instagram-flow] filechooser flow failed:', error.message);
    }

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      console.log('[instagram-flow] Setting file:', mediaPath);
      await fileInput.setInputFiles(mediaPath);
      await this.afterMediaSelected(page);
      return;
    }

    await storyButton.setInputFiles(mediaPath)
      .then(async () => {
        console.log('[instagram-flow] Setting file:', mediaPath);
        await this.afterMediaSelected(page);
      })
      .catch((error) => {
        throw new Error(`Unable to attach media: filechooser, input[type=file], and Story Story setInputFiles all failed. ${error.message}`);
      });
  }

  async afterMediaSelected(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(3000);
    await this.checkSecurity(page);
    await this.verifyMediaSelected(page);
  }

  async verifyMediaSelected(page) {
    await this.screenshot(page, 'after-file-selected').catch(() => null);
    console.log('[instagram-flow] current URL:', page.url());

    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (UPLOAD_ERROR_PATTERNS.some((pattern) => pattern.test(bodyText))) {
      throw new Error('Instagram reported an upload error after selecting the file.');
    }

    console.log('[instagram-flow] checking media preview');
    const mediaPreviewVisible = await this.hasMediaPreview(page);

    console.log('[instagram-flow] checking Add to your story button');
    const addButtonVisible = await this.addToStoryButton(page).isVisible({ timeout: 10000 }).catch(() => false);
    console.log('[instagram-flow] Add to your story button exists:', addButtonVisible);

    if (!mediaPreviewVisible || !addButtonVisible) {
      throw new Error('Selected media was not confirmed in the Instagram story editor.');
    }
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

    page.once('dialog', async (dialog) => {
      console.log(`[instagram-dialog] ${dialog.message()}`);
      await dialog.dismiss().catch(() => {});
    });

    console.log('[instagram-flow] current URL:', page.url());
    console.log('[instagram-flow] checking media preview');
    const mediaPreviewVisible = await this.hasMediaPreview(page);
    if (!mediaPreviewVisible) {
      throw new Error('Cannot share because the Instagram story editor media preview is not visible.');
    }

    console.log('[instagram-flow] checking Add to your story button');
    const addButton = this.addToStoryButton(page);
    await addButton.waitFor({ state: 'visible', timeout: 20000 });

    await this.screenshot(page, 'before-share').catch(() => null);
    await humanDelay();

    console.log('[instagram-flow] Clicking Add to your story');
    await clickFirst(page, this.shareLocators(page), 'Add to your story button');
    console.log('[instagram-flow] clicked Add to your story');
  }

  async waitForUploadCompletion(page) {
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(randomInt(10000, 20000));
    await this.checkSecurity(page);
    return this.verifyStoryUploaded(page);
  }

  async verifyStoryUploaded(page) {
    console.log('[instagram-verify] verifying uploaded story');
    await this.screenshot(page, 'verify-before').catch(() => null);

    await this.waitForPostShareSignal(page);
    const verifyUrl = this.options.verifyProfileUrl || this.options.instagramUrl;
    await page.goto(verifyUrl, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(5000);
    await this.checkSecurity(page);
    await this.screenshot(page, 'verify-home').catch(() => null);

    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (UPLOAD_ERROR_PATTERNS.some((pattern) => pattern.test(bodyText))) {
      await this.screenshot(page, 'verify-failed').catch(() => null);
      console.log('[instagram-verify] verification failed');
      throw new Error('Story upload could not be verified from Instagram UI.');
    }

    const ownStory = this.ownStoryLocators(page);
    if (await anyLocatorVisible(ownStory, 8000)) {
      await clickFirst(page, ownStory, 'Your story indicator').catch(() => null);
      await page.waitForTimeout(3000);
      await this.screenshot(page, 'verify-story-opened').catch(() => null);
      const viewerOpened = await this.storyViewerVisible(page);
      if (viewerOpened) {
        console.log('[instagram-verify] verification passed');
        return true;
      }
    }

    await this.screenshot(page, 'verify-failed').catch(() => null);
    console.log('[instagram-verify] verification failed');
    throw new Error('Story upload could not be verified from Instagram UI.');
  }

  async waitForPostShareSignal(page) {
    const addButton = this.addToStoryButton(page);
    await page.waitForFunction(() => {
      const text = document.body?.innerText ?? '';
      return /Your story/i.test(text) || !/Add to your story/i.test(text);
    }, { timeout: 20000 }).catch(() => null);
    await addButton.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => null);
  }

  async hasMediaPreview(page) {
    return anyLocatorVisible([
      page.locator('video'),
      page.locator('canvas'),
      page.locator('img').filter({ hasNotText: /profile/i }),
      page.locator('[style*="background-image"]'),
      page.locator('[aria-label*="Photo" i]'),
      page.locator('[aria-label*="Video" i]')
    ], 10000);
  }

  addToStoryButton(page) {
    return page.getByRole('button', { name: ADD_TO_STORY_PATTERN }).first();
  }

  shareLocators(page) {
    return [
      page.getByRole('button', { name: ADD_TO_STORY_PATTERN }),
      page.getByRole('button', { name: SHARE_BUTTON_PATTERN }),
      page.getByText(SHARE_BUTTON_PATTERN)
    ];
  }

  ownStoryLocators(page) {
    return [
      page.getByRole('button', { name: /your story/i }),
      page.getByRole('link', { name: /your story/i }),
      page.getByText(/your story/i),
      page.locator('[aria-label*="Your story" i]')
    ];
  }

  async storyViewerVisible(page) {
    return anyLocatorVisible([
      page.getByRole('dialog'),
      page.getByRole('button', { name: /close/i }),
      page.getByText(/reply|send message|pause|mute/i),
      page.locator('video'),
      page.locator('canvas')
    ], 5000);
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

async function anyLocatorVisible(locators, timeout = 5000) {
  for (const locator of locators) {
    if (await locator.first().isVisible({ timeout }).catch(() => false)) return true;
  }
  return false;
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
