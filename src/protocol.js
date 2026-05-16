import fs from 'node:fs/promises';
import path from 'node:path';

const SUPPORTED_MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov']);

export function normalizeCommand(payload = {}, options = {}) {
  const action = String(payload.command ?? payload.action ?? '').trim().toLowerCase();
  if (!['upload story', 'upload_story', 'story.upload'].includes(action)) {
    throw new Error('Unsupported command. Expected "Upload Story".');
  }

  const source = payload.media ?? payload.source ?? {};
  const mediaSource = typeof source === 'string' ? { path: source } : source;
  const normalized = {
    requestId: payload.request_id ?? payload.requestId ?? cryptoRandomId(),
    chatId: payload.chat_id ?? payload.chatId ?? payload.from,
    media: {
      path: mediaSource.path ?? mediaSource.localPath,
      url: mediaSource.url,
      whatsappFilePath: mediaSource.whatsapp_file ?? mediaSource.whatsappFilePath
    },
    caption: payload.caption ?? '',
    metadata: {
      locationTag: payload.Location_Tag ?? payload.location_tag ?? payload.metadata?.Location_Tag ?? payload.metadata?.locationTag,
      businessTag: payload.Business_Tag ?? payload.business_tag ?? payload.metadata?.Business_Tag ?? payload.metadata?.businessTag,
      hashtags: normalizeHashtags(payload.Hashtags ?? payload.hashtags ?? payload.metadata?.Hashtags ?? payload.metadata?.hashtags)
    }
  };

  if (!normalized.media.path && !normalized.media.url && !normalized.media.whatsappFilePath) {
    throw new Error('Missing media source. Provide media.path, media.url, or media.whatsapp_file.');
  }

  return normalized;
}

export function normalizeHashtags(input) {
  if (!input) return [];
  const values = Array.isArray(input) ? input : String(input).split(/[\s,]+/);
  return values
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
}

export async function resolveMediaFile(media, options) {
  const source = media.whatsappFilePath ?? media.path;
  if (source) {
    const candidate = path.isAbsolute(source) ? source : path.resolve(options.storiesDir, source);
    await assertSupportedFile(candidate);
    return candidate;
  }

  if (media.url) {
    return downloadMedia(media.url, options.downloadDir);
  }

  throw new Error('No media file could be resolved.');
}

export async function assertSupportedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_MEDIA_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported media type: ${ext || 'unknown'}`);
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Media source is not a file: ${filePath}`);
  }
}

async function downloadMedia(url, downloadDir) {
  await fs.mkdir(downloadDir, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Media download failed: ${response.status} ${response.statusText}`);
  }
  const ext = path.extname(new URL(url).pathname).toLowerCase() || '.jpg';
  if (!SUPPORTED_MEDIA_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported media URL type: ${ext}`);
  }
  const fileName = `${Date.now()}-${cryptoRandomId()}${ext}`;
  const output = path.join(downloadDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(output, buffer);
  return output;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function summarizePost(command, mediaPath) {
  const parts = [];
  if (command.media.whatsappFilePath) parts.push('WhatsApp file');
  else if (command.media.url) parts.push('URL media');
  else parts.push(path.basename(mediaPath));

  if (command.metadata.locationTag) parts.push(`location ${command.metadata.locationTag}`);
  if (command.metadata.businessTag) parts.push(`business ${command.metadata.businessTag}`);
  if (command.metadata.hashtags.length) parts.push(command.metadata.hashtags.join(' '));
  return parts.join(' with ');
}
