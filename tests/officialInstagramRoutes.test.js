import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createOfficialInstagramRouter } from '../src/officialInstagramRoutes.js';

test('official Instagram route publishes through an injected API without touching legacy WhatsApp routes', async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use('/api/instagram/official', createOfficialInstagramRouter({
    config: {
      metaGraphApiVersion: 'v25.0',
      metaAccessToken: 'token-123',
      instagramBusinessAccountId: 'ig-123',
      officialInstagramDryRun: false
    },
    officialInstagramApi: {
      publishStory: async (request) => {
        calls.push(request);
        return { containerId: 'container-123', publishId: 'story-123', mediaType: request.mediaType };
      }
    }
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/instagram/official/story`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_url: 'https://cdn.example.com/story.jpg' })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.accepted, true);
    assert.equal(body.official_api, true);
    assert.equal(body.result.publishId, 'story-123');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mediaUrl, 'https://cdn.example.com/story.jpg');
    assert.equal(calls[0].mediaType, 'IMAGE');
  });
});

test('official Instagram route rejects non-public media URLs before calling Meta', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/instagram/official', createOfficialInstagramRouter({
    config: {
      metaGraphApiVersion: 'v25.0',
      metaAccessToken: 'token-123',
      instagramBusinessAccountId: 'ig-123',
      officialInstagramDryRun: false
    },
    officialInstagramApi: {
      publishStory: async () => {
        throw new Error('publishStory should not be called');
      }
    }
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/instagram/official/story`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_url: 'file:///tmp/story.jpg' })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.accepted, false);
    assert.match(body.error, /HTTPS/);
  });
});

async function withServer(app, callback) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}
