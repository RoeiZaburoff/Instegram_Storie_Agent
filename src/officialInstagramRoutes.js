import express from 'express';
import { OfficialInstagramApi, normalizeOfficialStoryRequest } from './officialInstagramApi.js';

export function createOfficialInstagramRouter({ officialInstagramApi, config } = {}) {
  const router = express.Router();
  const api = officialInstagramApi ?? new OfficialInstagramApi({
    accessToken: config.metaAccessToken,
    instagramBusinessAccountId: config.instagramBusinessAccountId,
    graphApiVersion: config.metaGraphApiVersion,
    dryRun: config.officialInstagramDryRun
  });

  router.get('/config', (_req, res) => {
    res.json({
      graphApiVersion: config.metaGraphApiVersion,
      hasMetaAccessToken: Boolean(config.metaAccessToken),
      hasInstagramBusinessAccountId: Boolean(config.instagramBusinessAccountId),
      dryRun: config.officialInstagramDryRun
    });
  });

  router.post('/story', async (req, res) => {
    try {
      const request = normalizeOfficialStoryRequest(req.body);
      const result = await api.publishStory(request);
      res.status(result.dryRun ? 202 : 201).json({ accepted: true, official_api: true, result });
    } catch (error) {
      res.status(error.status && error.status >= 400 ? error.status : 400).json({
        accepted: false,
        official_api: true,
        error: error.message,
        meta: error.response
      });
    }
  });

  return router;
}
