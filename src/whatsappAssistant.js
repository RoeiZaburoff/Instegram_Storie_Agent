const CONFIRM_RE = /^(confirm|approve|approved|yes|y|ok|post|send|schedule|אשר|מאשר|מאשרת|כן|יאללה|פרסם|תזמן)$/i;
const CANCEL_RE = /^(cancel|no|stop|abort|בטל|לא|עצור)$/i;

export class ConfirmationManager {
  constructor({ ttlMs = 30 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.drafts = new Map();
  }

  save(draft) {
    const requestId = draft.requestId ?? randomId();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const stored = { ...draft, requestId, expiresAt };
    this.drafts.set(draft.chatId, stored);
    return stored;
  }

  get(chatId) {
    const draft = this.drafts.get(chatId);
    if (!draft) return undefined;
    if (draft.expiresAt.getTime() < Date.now()) {
      this.drafts.delete(chatId);
      return undefined;
    }
    return draft;
  }

  consume(chatId) {
    const draft = this.get(chatId);
    if (draft) this.drafts.delete(chatId);
    return draft;
  }

  cancel(chatId) {
    return this.drafts.delete(chatId);
  }
}

export class StoryScheduler {
  constructor({ execute, now = () => new Date() } = {}) {
    this.execute = execute;
    this.now = now;
    this.jobs = new Map();
  }

  schedule(command) {
    if (!command.scheduledAt || command.scheduledAt.getTime() <= this.now().getTime() + 1000) {
      queueMicrotask(() => this.execute(command));
      return { scheduled: false, scheduledAt: command.scheduledAt };
    }

    const delayMs = Math.min(command.scheduledAt.getTime() - this.now().getTime(), 2 ** 31 - 1);
    const timer = setTimeout(async () => {
      this.jobs.delete(command.requestId);
      await this.execute(command);
    }, delayMs);
    this.jobs.set(command.requestId, { command, timer });
    return { scheduled: true, scheduledAt: command.scheduledAt };
  }
}

export function normalizeWhatsAppMessage(payload = {}) {
  const text = firstString(
    payload.text,
    payload.body,
    payload.message,
    payload.caption,
    payload.description,
    payload.messages?.[0]?.text?.body,
    payload.messages?.[0]?.image?.caption
  );

  const mediaSource = payload.media ?? payload.source ?? payload.image ?? payload.photo ?? payload.file ?? payload.messages?.[0]?.image ?? {};
  const media = typeof mediaSource === 'string' ? { path: mediaSource } : {
    path: mediaSource.path ?? mediaSource.localPath,
    url: mediaSource.url ?? mediaSource.link,
    whatsappFilePath: mediaSource.whatsapp_file ?? mediaSource.whatsappFilePath ?? mediaSource.path
  };

  return {
    requestId: payload.request_id ?? payload.requestId ?? randomId(),
    chatId: payload.chat_id ?? payload.chatId ?? payload.from ?? payload.sender ?? payload.messages?.[0]?.from,
    text,
    media: emptyMedia(media) ? undefined : media,
    raw: payload
  };
}

export function analyzeWhatsAppCommand(message, { now = new Date() } = {}) {
  if (!message.chatId) return ask('Missing WhatsApp chat id. Please include chat_id/from in the webhook payload.');

  const text = (message.text ?? '').trim();
  if (CONFIRM_RE.test(text)) return { type: 'confirm', chatId: message.chatId };
  if (CANCEL_RE.test(text)) return { type: 'cancel', chatId: message.chatId };

  const intent = detectUploadIntent(text, message.media);
  if (!intent) return ask('I can help upload or schedule Instagram Stories. Send an image/video with text like: "upload this to story today at 19:30".');

  if (!message.media?.path && !message.media?.url && !message.media?.whatsappFilePath) {
    return ask('Please attach an image or video for the Story before I prepare the upload draft.');
  }

  const caption = extractLabel(text, ['כיתוב', 'caption']) ?? cleanCaption(text);
  const hashtags = uniqueTags([
    ...extractHashtags(text),
    ...normalizeExplicitHashtags(message.raw.Hashtags ?? message.raw.hashtags ?? message.raw.metadata?.Hashtags ?? message.raw.metadata?.hashtags)
  ]);
  const scheduledAt = extractSchedule(text, now);

  return {
    type: 'draft',
    draft: {
      requestId: message.requestId,
      chatId: message.chatId,
      media: message.media,
      caption,
      metadata: {
        hashtags,
        locationTag: extractLabel(text, ['מיקום', 'location']) ?? message.raw.Location_Tag ?? message.raw.location_tag ?? message.raw.metadata?.Location_Tag ?? message.raw.metadata?.locationTag,
        businessTag: extractLabel(text, ['עסק', 'business']) ?? message.raw.Business_Tag ?? message.raw.business_tag ?? message.raw.metadata?.Business_Tag ?? message.raw.metadata?.businessTag
      },
      scheduledAt,
      originalText: text
    }
  };
}

export function validateDraft(draft) {
  const errors = [];
  if (!draft.chatId) errors.push('missing chat id');
  if (!draft.media?.path && !draft.media?.url && !draft.media?.whatsappFilePath) errors.push('missing media');
  if (draft.scheduledAt && Number.isNaN(draft.scheduledAt.getTime())) errors.push('invalid schedule time');
  return { valid: errors.length === 0, errors };
}

export function draftToCommand(draft) {
  return {
    requestId: draft.requestId,
    chatId: draft.chatId,
    media: draft.media,
    caption: draft.caption ?? '',
    metadata: {
      locationTag: draft.metadata?.locationTag,
      businessTag: draft.metadata?.businessTag,
      hashtags: draft.metadata?.hashtags ?? []
    },
    scheduledAt: draft.scheduledAt
  };
}

export function formatDraftConfirmation(draft) {
  const when = draft.scheduledAt ? formatDate(draft.scheduledAt) : 'now';
  const caption = draft.caption ? `\nCaption: ${draft.caption}` : '\nCaption: (none)';
  const hashtags = draft.metadata?.hashtags?.length ? `\nHashtags: ${draft.metadata.hashtags.join(' ')}` : '';
  return `📝 Draft ready. I will not upload until you confirm.\nWhen: ${when}${caption}${hashtags}\nReply "confirm" / "אשר" to proceed, or "cancel" / "בטל".`;
}

export function formatScheduledReply(command) {
  if (!command.scheduledAt || command.scheduledAt.getTime() <= Date.now() + 1000) {
    return '✅ Confirmed. Uploading the Story now.';
  }
  return `✅ Confirmed. Story scheduled for ${formatDate(command.scheduledAt)}.`;
}

function ask(message) {
  return { type: 'ask', message };
}

function detectUploadIntent(text, media) {
  if (media && !text) return true;
  return /(story|סטורי|upload|post|תעלה|להעלות|העלה|פרסם|תזמן)/i.test(text);
}

function extractLabel(text, labels) {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const match = text.match(new RegExp(`^\\s*${escaped}\\s*[:：-]\\s*(.+)$`, 'im'));
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractHashtags(text) {
  const labeled = extractLabel(text, ['האשטגים', 'hashtags', 'hashtag']);
  const source = labeled ?? [...text.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]).join(' ');
  if (!source) return [];
  return source
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
}

function normalizeExplicitHashtags(input) {
  if (!input) return [];
  const values = Array.isArray(input) ? input : String(input).split(/[\s,]+/);
  return values
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
}

function uniqueTags(tags) {
  return [...new Set(tags)];
}

function cleanCaption(text) {
  const labeled = extractLabel(text, ['כיתוב', 'caption']);
  if (labeled) return labeled;
  return text
    .split('\n')
    .filter((line) => !/(האשטגים|hashtags|כיתוב|caption)\s*[:：-]/i.test(line))
    .join('\n')
    .trim();
}

function extractSchedule(text, now) {
  const timeMatch = text.match(/(?:ב-|at\s*)?(\d{1,2})[:.](\d{2})/i);
  if (!timeMatch) return undefined;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return new Date(Number.NaN);

  const scheduled = new Date(now);
  scheduled.setSeconds(0, 0);
  scheduled.setHours(hour, minute, 0, 0);

  if (/(tomorrow|מחר)/i.test(text)) scheduled.setDate(scheduled.getDate() + 1);
  else if (!/(today|היום)/i.test(text) && scheduled.getTime() <= now.getTime()) scheduled.setDate(scheduled.getDate() + 1);

  return scheduled;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function emptyMedia(media) {
  return !media.path && !media.url && !media.whatsappFilePath;
}

function formatDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}
