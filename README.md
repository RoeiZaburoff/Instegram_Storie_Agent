# Instegram_Storie_Agent

WhatsApp-controlled Instagram Story uploader for a pre-authenticated Chrome profile.

## What it does

- Accepts a WhatsApp JSON webhook command named `Upload Story`.
- Resolves media from `C:/Stories/`, direct media URLs, or a file path supplied by WhatsApp.
- Opens Instagram Web in Chrome/Playwright using an existing user profile or a Chrome DevTools Protocol endpoint.
- Mimics human activity with randomized delays, natural scrolling, and varied typing speed.
- Supports optional story metadata placeholders: `[Location_Tag]`, `[Business_Tag]`, and `[Hashtags]`.
- Stops on security/2FA screens and sends a concise WhatsApp alert.
- Sends WhatsApp success/error summaries with status emojis.

## Setup

```bash
npm install
cp .env.example .env # optional, if you create one for your environment
npm start
```

Important environment variables:

| Variable | Purpose |
| --- | --- |
| `STORIES_DIR` | Folder used for relative media paths. Defaults to `C:/Stories` on Windows and `./Stories` elsewhere. |
| `CHROME_USER_DATA_DIR` | Chrome profile directory that is already logged in to Instagram. |
| `CHROME_EXECUTABLE_PATH` | Optional Chrome executable path. |
| `CHROME_CDP_URL` | Optional running Chrome DevTools URL, for example `http://127.0.0.1:9222`. |
| `WHATSAPP_WEBHOOK_URL` | Outbound WhatsApp provider endpoint used for status messages. |
| `WHATSAPP_AUTH_TOKEN` | Optional bearer token for the WhatsApp provider endpoint. |
| `DRY_RUN` | Set to `true` to test webhook parsing and notifications without browser automation. |

## WhatsApp webhook payload

POST JSON to `/webhook/whatsapp`:

```json
{
  "command": "Upload Story",
  "from": "+15551234567",
  "media": { "path": "story.jpg" },
  "caption": "Morning launch",
  "Location_Tag": "Central Park",
  "Business_Tag": "@coffee_shop",
  "Hashtags": ["Nature", "NYC"]
}
```

Media can be provided as one of:

- `media.path`: absolute path or file name relative to `STORIES_DIR`.
- `media.url`: direct URL to a supported image/video file.
- `media.whatsapp_file`: local path where your WhatsApp integration saved an attachment.

Supported media extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.mp4`, `.mov`.

## Security and reporting behavior

- `🔒 Security Check Required. Please provide the code.` is sent when Instagram shows a 2FA/security challenge.
- `✅ Success: Story uploaded successfully! [Timestamp]` is sent after upload completion.
- `⚠️ Error: ...` is sent when media resolution or browser automation fails.

## Development

```bash
npm test
```
