# Instegram_Storie_Agent

WhatsApp-controlled Instagram Story uploader for a pre-authenticated Chrome profile.

## What it does

- Accepts WhatsApp webhook messages through `POST /webhook/whatsapp` and multipart media through `POST /webhook/whatsapp/upload-story`.
- Adds a separate official Meta Graph API route at `POST /api/instagram/official/story` so the existing Playwright WhatsApp routes can keep working untouched while the official API path evolves independently.
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

## Official Instagram API route

The official API route is intentionally separate from the working WhatsApp/Playwright flow. It uses Meta Graph API content publishing endpoints and requires public HTTPS media URLs because Meta must be able to fetch the image or video directly. Local WhatsApp upload files are still handled by the legacy Playwright route.

Required environment variables for live official API calls:

```env
META_ACCESS_TOKEN=your_long_lived_meta_token
INSTAGRAM_BUSINESS_ACCOUNT_ID=your_ig_business_or_creator_account_id
META_GRAPH_API_VERSION=v25.0
OFFICIAL_INSTAGRAM_DRY_RUN=false
```

Dry-run official API calls can be tested without contacting Meta:

```env
OFFICIAL_INSTAGRAM_DRY_RUN=true
META_ACCESS_TOKEN=dummy
INSTAGRAM_BUSINESS_ACCOUNT_ID=dummy_ig_id
```

Example request:

```bash
curl -X POST http://localhost:3000/api/instagram/official/story \
  -H 'content-type: application/json' \
  -d '{"media_url":"https://cdn.example.com/story.jpg","media_type":"IMAGE"}'
```

The route creates an Instagram media container with `media_type=STORIES`, using `image_url` for images or `video_url` for videos, then publishes it through `/{ig-user-id}/media_publish`.

## Useful routes

- `GET /health` — safe health check.
- `GET /debug/config` — safe runtime configuration values without WhatsApp or Meta secrets.
- `GET /api/instagram/official/config` — safe official API configuration check with booleans instead of tokens.
- `POST /api/instagram/official/story` — separate official Meta Graph API Story publishing route for public HTTPS image/video URLs.
- `POST /webhook/whatsapp` — JSON WhatsApp webhook receiver for text/media references and confirmation messages.
- `POST /webhook/whatsapp/upload-story` — multipart WhatsApp media receiver. Accepted media fields: `media`, `image`, `photo`, or `file`.

## Tests

```bash
npm test
```
