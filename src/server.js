import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { InstagramStoryUploader, SecurityCheckRequiredError } from './instagramStoryUploader.js';
import { WhatsAppNotifier } from './notifier.js';
import { resolveMediaFile, summarizePost } from './protocol.js';
import { createWhatsAppUploadMiddleware, normalizeMultipartUpload } from './whatsappUpload.js';
import {
  analyzeWhatsAppCommand,
  ConfirmationManager,
  draftToCommand,
  formatDraftConfirmation,
  formatScheduledReply,
  normalizeWhatsAppMessage,
  StoryScheduler,
  validateDraft
} from './whatsappAssistant.js';

const app = express();
app.use(express.json({ limit: '25mb' }));

const notifier = new WhatsAppNotifier({
  webhookUrl: config.whatsappWebhookUrl,
  authToken: config.whatsappAuthToken,
  dryRun: config.dryRun
});
const uploader = new InstagramStoryUploader(config);
const whatsappUpload = createWhatsAppUploadMiddleware({ uploadDir: config.whatsappUploadDir });
const confirmations = new ConfirmationManager();
const scheduler = new StoryScheduler({ execute: handleUploadStory });

app.get('/health', (_req, res) => {
  res.json({ ok: true, dryRun: config.dryRun });
});

app.get('/debug/config', (_req, res) => {
  res.json({
    headless: config.headless,
    dryRun: config.dryRun,
    mobileEmulation: config.mobileEmulation,
    mobileDevice: config.mobileDevice,
    chromeUserDataDir: config.chromeUserDataDir,
    hasChromeCdpUrl: Boolean(config.chromeCdpUrl),
    debugPauseMs: config.debugPauseMs,
    keepBrowserOpenOnError: config.keepBrowserOpenOnError,
    debugStepMode: config.debugStepMode
  });
});

app.post('/webhook/whatsapp/upload-story', (req, res) => {
  whatsappUpload(req, res, async (uploadError) => {
    try {
      if (uploadError) throw uploadError;
      const message = normalizeWhatsAppMessage(normalizeMultipartUpload(req.body, req.files ?? []));
      res.status(202).json({ accepted: true, request_id: message.requestId });
      await handleWhatsAppMessage(message);
    } catch (error) {
      const alreadyAccepted = res.headersSent;
      if (!alreadyAccepted) res.status(400).json({ accepted: false, error: error.message });
      else console.error('[upload-story:multipart]', error);
    }
  });
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const message = normalizeWhatsAppMessage(req.body);
    res.status(202).json({ accepted: true, request_id: message.requestId });
    await handleWhatsAppMessage(message);
  } catch (error) {
    const alreadyAccepted = res.headersSent;
    if (!alreadyAccepted) res.status(400).json({ accepted: false, error: error.message });
    else console.error('[whatsapp]', error);
  }
});


async function handleWhatsAppMessage(message) {
  const decision = analyzeWhatsAppCommand(message);

  if (decision.type === 'ask') {
    await notifier.send(message.chatId, `🤖 ${decision.message}`);
    return decision;
  }

  if (decision.type === 'cancel') {
    const cancelled = confirmations.cancel(decision.chatId);
    await notifier.send(decision.chatId, cancelled ? '🗑️ Draft cancelled.' : 'No active draft to cancel.');
    return decision;
  }

  if (decision.type === 'confirm') {
    const draft = confirmations.consume(decision.chatId);
    if (!draft) {
      await notifier.send(decision.chatId, 'No active draft to confirm. Please send the Story media and instructions first.');
      return decision;
    }
    const command = draftToCommand(draft);
    const scheduled = scheduler.schedule(command);
    await notifier.send(command.chatId, formatScheduledReply(command));
    return { ...decision, command, scheduled };
  }

  const validation = validateDraft(decision.draft);
  if (!validation.valid) {
    await notifier.error(decision.draft.chatId, `Draft is incomplete: ${validation.errors.join(', ')}`);
    return { ...decision, validation };
  }

  const draft = confirmations.save(decision.draft);
  await notifier.send(draft.chatId, formatDraftConfirmation(draft));
  return { ...decision, draft };
}

async function handleUploadStory(command) {
  let summary = 'Story request';

  try {
    const mediaPath = await resolveMediaFile(command.media, config);
    summary = summarizePost(command, mediaPath);
    await uploader.uploadStory({
      mediaPath,
      caption: command.caption,
      metadata: command.metadata
    });
    await notifier.success(command.chatId, `Posted: ${summary}`);
  } catch (error) {
    if (error instanceof SecurityCheckRequiredError) {
      await notifier.security(command.chatId);
      return;
    }
    await notifier.error(command.chatId, error.message, { summary, screenshot: error.screenshotPath });
  }
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`Instagram Story agent listening on :${config.port}`);
  });
}

export { app, handleUploadStory, handleWhatsAppMessage, confirmations, scheduler };
