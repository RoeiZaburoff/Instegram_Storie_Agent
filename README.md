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
npx playwright install
cp .env.example .env # optional, if you create one for your environment
npm start
```

Important environment variables:

| Variable | Purpose |
| --- | --- |
| `STORIES_DIR` | Folder used for relative media paths. Defaults to `C:/Stories` on Windows and `./Stories` elsewhere. |
| `CHROME_USER_DATA_DIR` | Persistent Chrome profile directory that stores the Instagram login session. Defaults to `./playwright-profile`. |
| `CHROME_EXECUTABLE_PATH` | Optional Chrome executable path. |
| `CHROME_CDP_URL` | Optional running Chrome DevTools URL, for example `http://127.0.0.1:9222`. |
| `WHATSAPP_WEBHOOK_URL` | Outbound WhatsApp provider endpoint used for status messages. |
| `WHATSAPP_AUTH_TOKEN` | Optional bearer token for the WhatsApp provider endpoint. |
| `DRY_RUN` | Set to `true` to test webhook parsing and notifications without browser automation. |
| `WHATSAPP_UPLOAD_DIR` | Folder where multipart WhatsApp media uploads are saved before posting. Defaults to `./tmp/whatsapp`. |
| `MOBILE_EMULATION` | Set to `false` for desktop mode. Defaults to mobile mode because Instagram Story upload requires mobile web controls. |
| `MOBILE_DEVICE` | Playwright device descriptor used for mobile mode. Defaults to `iPhone 13`. |


## Local Instagram login setup

Use a persistent Playwright profile so Instagram cookies/session data survive across runs:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install Playwright browsers:

   ```bash
   npx playwright install
   ```

3. Start the agent with a visible browser and a fixed profile folder:

   ```bash
   HEADLESS=false CHROME_USER_DATA_DIR="$(pwd)/playwright-profile" MOBILE_EMULATION=true MOBILE_DEVICE="iPhone 13" npm start
   ```

4. Send a test webhook request, for example with `DRY_RUN=false` and a valid local media file:

   ```bash
   curl -X POST http://localhost:3000/webhook/whatsapp \
     -H 'content-type: application/json' \
     -d '{"command":"Upload Story","from":"local-test","media":{"path":"story.jpg"},"caption":"Login test"}'
   ```

5. Log in to Instagram in the opened browser and approve any 2FA/security checks.
6. Rerun the same webhook request after login. The session should be reused from `playwright-profile`.

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

### Direct WhatsApp image upload route

If your WhatsApp provider can forward the received image as `multipart/form-data`, send it to:

```http
POST /webhook/whatsapp/upload-story
Content-Type: multipart/form-data
```

Accepted file field names: `media`, `image`, `photo`, or `file`.

Example:

```bash
curl -X POST http://localhost:3000/webhook/whatsapp/upload-story \
  -F 'from=+15551234567' \
  -F 'caption=Image from WhatsApp' \
  -F 'Hashtags=["Nature","Launch"]' \
  -F 'Location_Tag=Central Park' \
  -F 'image=@/path/to/story.jpg'
```

The route saves the uploaded WhatsApp media to `WHATSAPP_UPLOAD_DIR` and reuses the same Instagram Story upload workflow.


## Debug runtime config

To verify what the running server actually loaded from `.env`, call:

```bash
curl http://localhost:3000/debug/config
```

The response intentionally excludes webhook URLs and auth tokens.

## Troubleshooting

### Instagram opens, but there is no Story upload button

Instagram Web only exposes Story upload controls in mobile/app-like web mode. Make sure mobile emulation is enabled:

```bash
HEADLESS=false CHROME_USER_DATA_DIR="$(pwd)/playwright-profile" MOBILE_EMULATION=true MOBILE_DEVICE="iPhone 13" npm start
```

If you intentionally need desktop mode, set `MOBILE_EMULATION=false`; Story upload may not be available in that mode.

## Security and reporting behavior

- `🔒 Security Check Required. Please provide the code.` is sent when Instagram shows a 2FA/security challenge.
- `✅ Success: Story uploaded successfully! [Timestamp]` is sent after upload completion.
- `⚠️ Error: ...` is sent when media resolution or browser automation fails.

## Development

```bash
npm test
```
