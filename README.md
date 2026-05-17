# Instegram_Storie_Agent

WhatsApp-controlled Instagram Story uploader for a pre-authenticated Chrome profile.

## What it does

- Accepts WhatsApp webhook messages through `POST /webhook/whatsapp` and multipart media through `POST /webhook/whatsapp/upload-story`.
- Adds a practical WhatsApp management layer before Instagram automation: incoming message → assistant/safety gate → validator → draft/confirmation manager → scheduler or uploader → WhatsApp reply.
- Keeps the AI assistant/safety gate from directly uploading. It only understands the WhatsApp message, extracts intent, asks clarifying questions, prepares a draft, and waits for explicit confirmation.
- Resolves media from `C:/Stories/`, direct media URLs, or a file path supplied by WhatsApp.
- Opens Instagram Web in Chrome/Playwright using an existing user profile or a Chrome DevTools Protocol endpoint.
- Uses Pixel 7 mobile emulation by default with the persistent `playwright-profile-pixel7` profile.
- Mimics human activity with randomized delays, natural scrolling, and varied typing speed.
- Supports optional story metadata placeholders: `[Location_Tag]`, `[Business_Tag]`, and `[Hashtags]`.
- Stops on security/2FA screens and sends a concise WhatsApp alert.
- Sends WhatsApp success/error summaries with status emojis.

## WhatsApp assistant flow

The assistant is intentionally MVP-level and deterministic. It recognizes upload/schedule intent in English and Hebrew, extracts captions and hashtags from common WhatsApp text formats, and stores one pending draft per chat until the user confirms or cancels.

Example incoming image caption:

```text
תעלה את זה לסטורי היום ב-19:30
כיתוב: Pilates at the studio today ✨
האשטגים: pilates, reformer, telaviv
```

Assistant reply:

```text
📝 Draft ready. I will not upload until you confirm.
When: 2026-05-17 19:30
Caption: Pilates at the studio today ✨
Hashtags: #pilates #reformer #telaviv
Reply "confirm" / "אשר" to proceed, or "cancel" / "בטל".
```

Only after a later message such as `confirm`, `אשר`, `yes`, or `כן` does the system call the immediate uploader or in-memory scheduler. Cancellation words such as `cancel`, `בטל`, `no`, or `לא` discard the draft.

## Setup

```bash
npm install
npx playwright install
cp .env.example .env # optional, if you create one for your environment
npm start
```

## Useful routes

- `GET /health` — safe health check.
- `GET /debug/config` — safe runtime configuration values without WhatsApp secrets.
- `POST /webhook/whatsapp` — JSON WhatsApp webhook receiver for text/media references and confirmation messages.
- `POST /webhook/whatsapp/upload-story` — multipart WhatsApp media receiver. Accepted media fields: `media`, `image`, `photo`, or `file`.

## Tests

```bash
npm test
```
