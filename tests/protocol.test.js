import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { normalizeCommand, normalizeHashtags, resolveMediaFile, summarizePost } from '../src/protocol.js';
import { normalizeMultipartUpload } from '../src/whatsappUpload.js';

test('normalizes Upload Story commands from WhatsApp JSON', () => {
  const command = normalizeCommand({
    command: 'Upload Story',
    from: '+15551234567',
    media: { whatsapp_file: '/tmp/story.jpg' },
    caption: 'Morning walk',
    Location_Tag: 'Central Park',
    Business_Tag: '@coffee_shop',
    Hashtags: 'Nature, NYC'
  });

  assert.equal(command.chatId, '+15551234567');
  assert.equal(command.media.whatsappFilePath, '/tmp/story.jpg');
  assert.deepEqual(command.metadata.hashtags, ['#Nature', '#NYC']);
  assert.equal(command.metadata.locationTag, 'Central Park');
});

test('rejects unsupported commands', () => {
  assert.throws(() => normalizeCommand({ command: 'Ping' }), /Unsupported command/);
});

test('normalizes hashtag arrays and free-form strings', () => {
  assert.deepEqual(normalizeHashtags(['travel', '#sunset']), ['#travel', '#sunset']);
  assert.deepEqual(normalizeHashtags('food,coffee happy'), ['#food', '#coffee', '#happy']);
});

test('summarizes posted content for WhatsApp confirmations', () => {
  const command = normalizeCommand({
    action: 'upload_story',
    chat_id: 'chat-1',
    media: { path: 'story.png' },
    hashtags: ['Launch']
  });

  assert.equal(summarizePost(command, '/Stories/story.png'), 'story.png with #Launch');
});

test('normalizes multipart WhatsApp media uploads into Upload Story commands', () => {
  const payload = normalizeMultipartUpload(
    {
      from: '+15550001111',
      caption: 'Fresh image',
      Hashtags: '["Nature","Launch"]',
      Location_Tag: 'Tel Aviv'
    },
    [{ fieldname: 'image', path: '/tmp/whatsapp/story.jpg' }]
  );

  const command = normalizeCommand(payload);
  assert.equal(command.chatId, '+15550001111');
  assert.equal(command.media.whatsappFilePath, '/tmp/whatsapp/story.jpg');
  assert.deepEqual(command.metadata.hashtags, ['#Nature', '#Launch']);
  assert.equal(command.metadata.locationTag, 'Tel Aviv');
});

test('rejects multipart uploads without media files', () => {
  assert.throws(() => normalizeMultipartUpload({ from: '+15550001111' }, []), /Missing uploaded media file/);
});

test('retries protected Twilio media URLs with basic auth after 401', async () => {
  const expectedAuth = `Basic ${Buffer.from('AC123:secret').toString('base64')}`;
  const authorizations = [];
  const server = http.createServer((req, res) => {
    authorizations.push(req.headers.authorization);
    if (req.headers.authorization !== expectedAuth) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end('auth required');
      return;
    }

    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  });
  const downloadDir = path.join(process.cwd(), 'tmp', 'protocol-twilio-auth');

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const mediaPath = await resolveMediaFile(
      {
        url: `http://127.0.0.1:${port}/2010-04-01/Accounts/AC123/Messages/SM123/Media/ME123`,
        contentType: 'image/jpeg',
        provider: 'twilio'
      },
      {
        downloadDir,
        twilioAccountSid: 'AC123',
        twilioAuthToken: 'secret'
      }
    );

    assert.equal(path.extname(mediaPath), '.jpg');
    assert.deepEqual(authorizations, [undefined, expectedAuth]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(downloadDir, { recursive: true, force: true });
  }
});
