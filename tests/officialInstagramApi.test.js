import test from 'node:test';
import assert from 'node:assert/strict';
import { OfficialInstagramApi, normalizeOfficialStoryRequest } from '../src/officialInstagramApi.js';

test('normalizes official Story requests from public image URLs', () => {
  const request = normalizeOfficialStoryRequest({ media: { url: 'https://cdn.example.com/story.jpg' } });

  assert.equal(request.mediaUrl, 'https://cdn.example.com/story.jpg');
  assert.equal(request.mediaType, 'IMAGE');
  assert.equal(request.waitForContainer, false);
});

test('rejects local files because Meta requires public HTTPS media URLs', () => {
  assert.throws(
    () => normalizeOfficialStoryRequest({ media: { url: '/tmp/story.jpg' } }),
    /absolute public HTTPS URL/
  );
});

test('publishes an image Story through Meta create-container and publish endpoints', async () => {
  const calls = [];
  const api = new OfficialInstagramApi({
    accessToken: 'token-123',
    instagramBusinessAccountId: 'ig-123',
    graphApiVersion: 'v25.0',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/ig-123/media')) {
        return jsonResponse({ id: 'container-123' });
      }
      if (String(url).endsWith('/ig-123/media_publish')) {
        return jsonResponse({ id: 'story-123' });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const result = await api.publishStory({ mediaUrl: 'https://cdn.example.com/story.png', mediaType: 'IMAGE' });

  assert.equal(result.containerId, 'container-123');
  assert.equal(result.publishId, 'story-123');
  assert.equal(calls[0].url, 'https://graph.facebook.com/v25.0/ig-123/media');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body.get('media_type'), 'STORIES');
  assert.equal(calls[0].options.body.get('image_url'), 'https://cdn.example.com/story.png');
  assert.equal(calls[1].url, 'https://graph.facebook.com/v25.0/ig-123/media_publish');
  assert.equal(calls[1].options.body.get('creation_id'), 'container-123');
});

test('dry run returns the exact official endpoint URLs without calling fetch', async () => {
  const api = new OfficialInstagramApi({
    accessToken: 'token-123',
    instagramBusinessAccountId: 'ig-123',
    dryRun: true,
    fetchImpl: async () => {
      throw new Error('fetch should not be called during dry run');
    }
  });

  const result = await api.publishStory({ mediaUrl: 'https://cdn.example.com/story.mov', mediaType: 'VIDEO' });

  assert.equal(result.dryRun, true);
  assert.equal(result.createContainerUrl, 'https://graph.facebook.com/v25.0/ig-123/media');
  assert.equal(result.publishUrl, 'https://graph.facebook.com/v25.0/ig-123/media_publish');
  assert.equal(result.request.mediaType, 'VIDEO');
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body
  };
}
