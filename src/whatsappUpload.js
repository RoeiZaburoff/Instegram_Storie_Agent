import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const ACCEPTED_MEDIA_FIELDS = new Set(['media', 'image', 'photo', 'file']);
const MIME_EXTENSION = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['video/mp4', '.mp4'],
  ['video/quicktime', '.mov']
]);

export function createWhatsAppUploadMiddleware({ uploadDir }) {
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = extensionFor(file);
      cb(null, `whatsapp-${Date.now()}-${randomId()}${ext}`);
    }
  });

  return multer({
    storage,
    limits: {
      files: 1,
      fileSize: 100 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
      if (!ACCEPTED_MEDIA_FIELDS.has(file.fieldname)) {
        cb(new Error('Unsupported file field. Use media, image, photo, or file.'));
        return;
      }
      if (!isAcceptedMedia(file)) {
        cb(new Error('Unsupported media upload. Use jpg, png, webp, mp4, or mov.'));
        return;
      }
      cb(null, true);
    }
  }).any();
}

export function normalizeMultipartUpload(body = {}, files = []) {
  const mediaFile = files.find((file) => ACCEPTED_MEDIA_FIELDS.has(file.fieldname));
  if (!mediaFile) {
    throw new Error('Missing uploaded media file. Send multipart/form-data with a media, image, photo, or file field.');
  }

  return {
    command: body.command ?? 'Upload Story',
    request_id: body.request_id ?? body.requestId,
    chat_id: body.chat_id ?? body.chatId ?? body.from,
    media: { whatsapp_file: mediaFile.path },
    caption: body.caption ?? '',
    Location_Tag: body.Location_Tag ?? body.location_tag,
    Business_Tag: body.Business_Tag ?? body.business_tag,
    Hashtags: parseMultipartHashtags(body.Hashtags ?? body.hashtags)
  };
}

function parseMultipartHashtags(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function extensionFor(file) {
  const originalExt = path.extname(file.originalname ?? '').toLowerCase();
  return originalExt || MIME_EXTENSION.get(file.mimetype) || '.jpg';
}

function isAcceptedMedia(file) {
  if (MIME_EXTENSION.has(file.mimetype)) return true;
  const ext = path.extname(file.originalname ?? '').toLowerCase();
  return [...MIME_EXTENSION.values()].includes(ext);
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}
