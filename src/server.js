import express from 'express';
import { config } from './config.js';
import { InstagramStoryUploader, SecurityCheckRequiredError } from './instagramStoryUploader.js';
import { WhatsAppNotifier } from './notifier.js';
import { normalizeCommand, resolveMediaFile, summarizePost } from './protocol.js';
import { createWhatsAppUploadMiddleware, normalizeMultipartUpload } from './whatsappUpload.js';

const app = express();
app.use(express.json({ limit: '25mb' }));

const notifier = new WhatsAppNotifier({
  webhookUrl: config.whatsappWebhookUrl,
  authToken: config.whatsappAuthToken,
  dryRun: config.dryRun
});
const uploader = new InstagramStoryUploader(config);
const whatsappUpload = createWhatsAppUploadMiddleware({ uploadDir: config.whatsappUploadDir });

app.get('/health', (_req, res) => {
  res.json({ ok: true, dryRun: config.dryRun });
});

app.post('/webhook/whatsapp/upload-story', (req, res) => {
  whatsappUpload(req, res, async (uploadError) => {
    let command;
    try {
      if (uploadError) throw uploadError;
      command = normalizeCommand(normalizeMultipartUpload(req.body, req.files ?? []));
      res.status(202).json({ accepted: true, request_id: command.requestId });
      await handleUploadStory(command);
    } catch (error) {
      const alreadyAccepted = res.headersSent;
      if (!alreadyAccepted) res.status(400).json({ accepted: false, error: error.message });
      else console.error('[upload-story:multipart]', error);
      if (!alreadyAccepted && command?.chatId) await notifier.error(command.chatId, error.message);
    }
  });
});

app.post('/webhook/whatsapp', async (req, res) => {
  let command;
  try {
    command = normalizeCommand(req.body);
    res.status(202).json({ accepted: true, request_id: command.requestId });
    await handleUploadStory(command);
  } catch (error) {
    const alreadyAccepted = res.headersSent;
    if (!alreadyAccepted) res.status(400).json({ accepted: false, error: error.message });
    else console.error('[upload-story]', error);
    if (!alreadyAccepted && command?.chatId) await notifier.error(command.chatId, error.message);
  }
});

async function handleUploadStory(command) {
  const mediaPath = await resolveMediaFile(command.media, config);
  const summary = summarizePost(command, mediaPath);

  try {
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

export { app, handleUploadStory };
