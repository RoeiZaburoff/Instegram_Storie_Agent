import 'dotenv/config';
import path from 'node:path';

const DEFAULT_STORIES_DIR = process.platform === 'win32' ? 'C:/Stories' : path.resolve('Stories');
const DEFAULT_CHROME_USER_DATA_DIR = path.resolve('playwright-profile');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  storiesDir: process.env.STORIES_DIR ? path.resolve(process.env.STORIES_DIR) : DEFAULT_STORIES_DIR,
  screenshotDir: process.env.SCREENSHOT_DIR ? path.resolve(process.env.SCREENSHOT_DIR) : path.resolve('screenshots'),
  downloadDir: process.env.DOWNLOAD_DIR ? path.resolve(process.env.DOWNLOAD_DIR) : path.resolve('tmp'),
  whatsappUploadDir: process.env.WHATSAPP_UPLOAD_DIR ? path.resolve(process.env.WHATSAPP_UPLOAD_DIR) : path.resolve('tmp', 'whatsapp'),
  instagramUrl: process.env.INSTAGRAM_URL ?? 'https://www.instagram.com/',
  chromeUserDataDir: process.env.CHROME_USER_DATA_DIR
    ? path.resolve(process.env.CHROME_USER_DATA_DIR)
    : DEFAULT_CHROME_USER_DATA_DIR,
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH,
  chromeCdpUrl: process.env.CHROME_CDP_URL,
  headless: process.env.HEADLESS === 'true',
  whatsappWebhookUrl: process.env.WHATSAPP_WEBHOOK_URL,
  whatsappAuthToken: process.env.WHATSAPP_AUTH_TOKEN,
  dryRun: process.env.DRY_RUN === 'true',
  mobileEmulation: process.env.MOBILE_EMULATION !== 'false',
  mobileDevice: process.env.MOBILE_DEVICE ?? 'iPhone 13',
  debugPauseMs: Number(process.env.DEBUG_PAUSE_MS ?? 0),
  keepBrowserOpenOnError: process.env.KEEP_BROWSER_OPEN_ON_ERROR === 'true'
};
