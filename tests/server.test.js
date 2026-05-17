import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { InstagramStoryUploader } from '../src/instagramStoryUploader.js';

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

test('normalizes Twilio WhatsApp From and Body fields', async () => {
  const { normalizeTwilioWhatsAppPayload } = await import(`../src/server.js?case=twilio-normalize-${Date.now()}-${Math.random()}`);

  const payload = normalizeTwilioWhatsAppPayload({
    MessageSid: 'SM123',
    From: 'whatsapp:+972501234567',
    Body: 'תעלה עכשיו עם הכיתוב בדיקה',
    NumMedia: '0'
  });

  assert.equal(payload.from, 'whatsapp:+972501234567');
  assert.equal(payload.chat_id, 'whatsapp:+972501234567');
  assert.equal(payload.text, 'תעלה עכשיו עם הכיתוב בדיקה');
  assert.equal(payload.command, 'תעלה עכשיו עם הכיתוב בדיקה');
  assert.equal(payload.rawProvider, 'twilio');
});

test('normalizes Twilio WhatsApp media fields to media url metadata', async () => {
  const { normalizeTwilioWhatsAppPayload } = await import(`../src/server.js?case=twilio-media-${Date.now()}-${Math.random()}`);

  const payload = normalizeTwilioWhatsAppPayload({
    MessageSid: 'SM123',
    From: 'whatsapp:+972501234567',
    Body: 'תעלה את זה',
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/SM123/Media/ME123',
    MediaContentType0: 'image/jpeg'
  });

  assert.deepEqual(payload.media, {
    url: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/SM123/Media/ME123',
    contentType: 'image/jpeg',
    provider: 'twilio'
  });
});

test('rejects malformed Twilio WhatsApp payloads without From', async () => {
  const { normalizeTwilioWhatsAppPayload } = await import(`../src/server.js?case=twilio-missing-from-${Date.now()}-${Math.random()}`);

  assert.throws(() => normalizeTwilioWhatsAppPayload({
    MessageSid: 'SM123',
    Body: 'confirm',
    NumMedia: '0'
  }), /Missing Twilio WhatsApp From field/);
});

test('urlencoded Twilio WhatsApp webhook uses From as chat id', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await withServer(async (baseUrl) => {
      const body = new URLSearchParams();
      body.set('MessageSid', 'SM123');
      body.set('From', 'whatsapp:+972501234567');
      body.set('Body', 'תעלה עכשיו עם הכיתוב בדיקה מטוויליו');
      body.set('NumMedia', '0');

      const response = await fetch(`${baseUrl}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body
      });

      assert.equal(response.status, 202);
      const payload = await response.json();
      assert.equal(payload.accepted, true);
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.some((line) => line.includes('[twilio-whatsapp] incoming:')), true);
  assert.equal(logs.some((line) => line.includes('"chat_id":"whatsapp:+972501234567"')), true);
  assert.equal(logs.some((line) => line.includes('Missing WhatsApp chat id')), false);
});

test('WhatsApp confirm flow calls uploader with saved tmp/whatsapp media path', async () => {
  const mediaPath = path.join(process.cwd(), 'tmp', 'whatsapp', 'whatsapp-regression.jpeg');
  const uploaded = [];
  const originalUploadStory = InstagramStoryUploader.prototype.uploadStory;

  await fs.mkdir(path.dirname(mediaPath), { recursive: true });
  await fs.writeFile(mediaPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  InstagramStoryUploader.prototype.uploadStory = async (payload) => {
    uploaded.push(payload);
    return { verified: true };
  };

  try {
    const moduleId = `../src/server.js?case=confirm-${Date.now()}-${Math.random()}`;
    const { handleWhatsAppMessage, confirmations } = await import(moduleId);
    const chatId = `chat-${Date.now()}`;

    const draftResult = await handleWhatsAppMessage({
      requestId: 'req-tmp-media',
      chatId,
      text: 'upload this to story now',
      media: { whatsappFilePath: mediaPath },
      raw: {}
    });

    assert.equal(draftResult.type, 'draft');
    assert.equal(confirmations.get(chatId).media.whatsappFilePath, mediaPath);

    const confirmResult = await handleWhatsAppMessage({
      requestId: 'req-confirm',
      chatId,
      text: 'confirm',
      raw: {}
    });

    assert.equal(confirmResult.type, 'confirm');
    await waitFor(() => uploaded.length === 1);
    assert.equal(uploaded[0].mediaPath, mediaPath);
  } finally {
    InstagramStoryUploader.prototype.uploadStory = originalUploadStory;
    await fs.rm(mediaPath, { force: true });
  }
});

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for condition.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
