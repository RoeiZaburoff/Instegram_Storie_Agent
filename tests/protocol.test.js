import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCommand, normalizeHashtags, summarizePost } from '../src/protocol.js';

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
