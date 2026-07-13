const DEFAULT_GRAPH_API_HOST = 'https://graph.facebook.com';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
const SUPPORTED_MEDIA_TYPES = new Set(['IMAGE', 'VIDEO']);

export class OfficialInstagramApiError extends Error {
  constructor(message, { status, response } = {}) {
    super(message);
    this.name = 'OfficialInstagramApiError';
    this.status = status;
    this.response = response;
  }
}

export class OfficialInstagramApi {
  constructor({
    accessToken,
    instagramBusinessAccountId,
    graphApiVersion = 'v25.0',
    graphApiHost = DEFAULT_GRAPH_API_HOST,
    dryRun = false,
    fetchImpl = fetch,
    statusPollAttempts = 6,
    statusPollIntervalMs = 5000
  } = {}) {
    this.accessToken = accessToken;
    this.instagramBusinessAccountId = instagramBusinessAccountId;
    this.graphApiVersion = normalizeGraphApiVersion(graphApiVersion);
    this.graphApiHost = graphApiHost.replace(/\/$/, '');
    this.dryRun = dryRun;
    this.fetchImpl = fetchImpl;
    this.statusPollAttempts = statusPollAttempts;
    this.statusPollIntervalMs = statusPollIntervalMs;
  }

  async publishStory(input = {}) {
    const request = normalizeOfficialStoryRequest(input);
    this.assertConfigured();

    if (this.dryRun) {
      return {
        dryRun: true,
        mediaType: request.mediaType,
        createContainerUrl: this.endpoint(`/${this.instagramBusinessAccountId}/media`),
        publishUrl: this.endpoint(`/${this.instagramBusinessAccountId}/media_publish`),
        request
      };
    }

    const container = await this.createStoryContainer(request);
    const status = request.waitForContainer
      ? await this.waitForContainerReady(container.id)
      : undefined;
    const published = await this.publishContainer(container.id);

    return {
      mediaType: request.mediaType,
      containerId: container.id,
      status,
      publishId: published.id,
      raw: { container, published }
    };
  }

  async createStoryContainer(request) {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      media_type: 'STORIES'
    });

    if (request.mediaType === 'VIDEO') params.set('video_url', request.mediaUrl);
    else params.set('image_url', request.mediaUrl);

    return this.postForm(`/${this.instagramBusinessAccountId}/media`, params);
  }

  async publishContainer(containerId) {
    if (!containerId) throw new OfficialInstagramApiError('Missing Instagram media container id.');

    const params = new URLSearchParams({
      access_token: this.accessToken,
      creation_id: containerId
    });

    return this.postForm(`/${this.instagramBusinessAccountId}/media_publish`, params);
  }

  async getContainerStatus(containerId) {
    if (!containerId) throw new OfficialInstagramApiError('Missing Instagram media container id.');

    const url = new URL(this.endpoint(`/${containerId}`));
    url.searchParams.set('fields', 'status_code,status');
    url.searchParams.set('access_token', this.accessToken);

    const response = await this.fetchImpl(url, { method: 'GET' });
    return parseMetaResponse(response);
  }

  async waitForContainerReady(containerId) {
    let latest;
    for (let attempt = 1; attempt <= this.statusPollAttempts; attempt += 1) {
      latest = await this.getContainerStatus(containerId);
      if (latest.status_code === 'FINISHED') return latest;
      if (['ERROR', 'EXPIRED'].includes(latest.status_code)) {
        throw new OfficialInstagramApiError(`Instagram container is not publishable: ${latest.status_code}`, { response: latest });
      }
      if (attempt < this.statusPollAttempts) await delay(this.statusPollIntervalMs);
    }

    throw new OfficialInstagramApiError('Instagram media container was not ready before the polling timeout.', { response: latest });
  }

  async postForm(path, params) {
    const response = await this.fetchImpl(this.endpoint(path), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    return parseMetaResponse(response);
  }

  endpoint(path) {
    return `${this.graphApiHost}/${this.graphApiVersion}${path}`;
  }

  assertConfigured() {
    if (!this.accessToken) throw new OfficialInstagramApiError('META_ACCESS_TOKEN is required for the official Instagram API route.');
    if (!this.instagramBusinessAccountId) {
      throw new OfficialInstagramApiError('INSTAGRAM_BUSINESS_ACCOUNT_ID is required for the official Instagram API route.');
    }
  }
}

export function normalizeOfficialStoryRequest(payload = {}) {
  const media = payload.media ?? {};
  const mediaUrl = payload.media_url ?? payload.mediaUrl ?? payload.image_url ?? payload.imageUrl ?? payload.video_url ?? payload.videoUrl ?? media.url;
  if (!mediaUrl) {
    throw new OfficialInstagramApiError('Official Instagram Story publishing requires a public media URL. Provide media.url, media_url, image_url, or video_url.');
  }

  const parsedUrl = parsePublicUrl(mediaUrl);
  const mediaType = normalizeMediaType(payload.media_type ?? payload.mediaType ?? inferMediaType(parsedUrl.pathname));
  const waitForContainer = payload.wait_for_container ?? payload.waitForContainer ?? mediaType === 'VIDEO';

  return {
    mediaUrl: parsedUrl.toString(),
    mediaType,
    caption: payload.caption ?? '',
    metadata: payload.metadata ?? {},
    waitForContainer: Boolean(waitForContainer)
  };
}

async function parseMetaResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const message = body.error?.message ?? `${response.status} ${response.statusText}`;
    throw new OfficialInstagramApiError(`Meta Graph API request failed: ${message}`, { status: response.status, response: body });
  }
  return body;
}

function normalizeMediaType(value) {
  const mediaType = String(value ?? '').trim().toUpperCase();
  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
    throw new OfficialInstagramApiError('Unsupported official Instagram media type. Use IMAGE or VIDEO, with a public image_url or video_url.');
  }
  return mediaType;
}

function inferMediaType(pathname) {
  const lowerPath = pathname.toLowerCase();
  const extension = lowerPath.slice(lowerPath.lastIndexOf('.'));
  if (IMAGE_EXTENSIONS.has(extension)) return 'IMAGE';
  if (VIDEO_EXTENSIONS.has(extension)) return 'VIDEO';
  throw new OfficialInstagramApiError('Could not infer media type from URL. Provide media_type as IMAGE or VIDEO.');
}

function parsePublicUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new OfficialInstagramApiError('Official Instagram Story media must be an absolute public HTTPS URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new OfficialInstagramApiError('Official Instagram Story media URL must use HTTPS so Meta can fetch it.');
  }

  return parsed;
}

function normalizeGraphApiVersion(version) {
  const normalized = String(version || 'v25.0').trim();
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
