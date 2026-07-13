import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWhatsAppCommand,
  ConfirmationManager,
  draftToCommand,
  formatDraftConfirmation,
  normalizeWhatsAppMessage,
  StoryScheduler,
  validateDraft
} from '../src/whatsappAssistant.js';

test('prepares a draft from Hebrew WhatsApp image text without uploading', () => {
  const now = new Date('2026-05-17T12:00:00.000Z');
  const message = normalizeWhatsAppMessage({
    from: '+972500000000',
    media: { whatsapp_file: '/tmp/story.jpg' },
    text: 'תעלה את זה לסטורי היום ב-19:30\nכיתוב: Pilates at the studio today ✨\nהאשטגים: pilates, reformer, telaviv'
  });

  const decision = analyzeWhatsAppCommand(message, { now });

  assert.equal(decision.type, 'draft');
  assert.equal(decision.draft.chatId, '+972500000000');
  assert.equal(decision.draft.caption, 'Pilates at the studio today ✨');
  assert.deepEqual(decision.draft.metadata.hashtags, ['#pilates', '#reformer', '#telaviv']);
  assert.equal(decision.draft.scheduledAt.toISOString(), '2026-05-17T19:30:00.000Z');
  assert.equal(validateDraft(decision.draft).valid, true);
  assert.match(formatDraftConfirmation(decision.draft), /I will not upload until you confirm/);
});

test('requires clarification when upload intent has no media', () => {
  const message = normalizeWhatsAppMessage({
    from: '+15551234567',
    text: 'upload this to story today at 19:30'
  });

  const decision = analyzeWhatsAppCommand(message);

  assert.equal(decision.type, 'ask');
  assert.match(decision.message, /attach an image or video/i);
});

test('turns confirmation into the pending draft command only after explicit approval', () => {
  const confirmations = new ConfirmationManager();
  const draft = confirmations.save({
    requestId: 'req-1',
    chatId: 'chat-1',
    media: { whatsappFilePath: '/tmp/story.jpg' },
    caption: 'Ready',
    metadata: { hashtags: ['#ready'] }
  });

  const decision = analyzeWhatsAppCommand(normalizeWhatsAppMessage({ from: 'chat-1', text: 'אשר' }));
  const command = draftToCommand(confirmations.consume(decision.chatId));

  assert.equal(decision.type, 'confirm');
  assert.equal(command.requestId, draft.requestId);
  assert.equal(command.caption, 'Ready');
  assert.deepEqual(command.metadata.hashtags, ['#ready']);
  assert.equal(confirmations.get('chat-1'), undefined);
});

test('scheduler defers future Story uploads instead of executing immediately', async () => {
  const executed = [];
  const scheduler = new StoryScheduler({
    execute: async (command) => executed.push(command.requestId),
    now: () => new Date('2026-05-17T12:00:00.000Z')
  });

  const result = scheduler.schedule({ requestId: 'later', scheduledAt: new Date('2026-05-17T19:30:00.000Z') });

  assert.equal(result.scheduled, true);
  assert.equal(executed.length, 0);
  clearTimeout(scheduler.jobs.get('later').timer);
});
