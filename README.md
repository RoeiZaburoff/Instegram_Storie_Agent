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