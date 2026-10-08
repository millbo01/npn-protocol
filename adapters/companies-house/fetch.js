// Fetches company profiles from the Companies House API.
// Rate limit: 600 requests per 5 minutes per key. Requests are spaced at least 1 second apart,
// so a node makes at most 300 requests per 5 minutes, half the limit.

export const API_BASE = 'https://api.company-information.service.gov.uk';
export const REQUEST_SPACING_MS = 1000;
const RETRY_WAIT_MS = 10_000;
const MAX_RETRIES = 2;

// Stops the whole round: carrying on would only repeat the failure or breach the rate limit.
export class AbortRound extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortRound';
  }
}

export function authHeader(apiKey) {
  return 'Basic ' + btoa(`${apiKey}:`);
}

export function createProfileFetcher({
  apiKey,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  spacingMs = REQUEST_SPACING_MS,
  now = () => new Date(),
}) {
  let lastRequest = 0;

  async function spaced(url, headers) {
    const wait = lastRequest + spacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    return fetchImpl(url, { headers });
  }

  return async function fetchProfile(companyNumber, extraHeaders = {}) {
    const url = `${API_BASE}/company/${encodeURIComponent(companyNumber)}`;
    const headers = { Authorization: authHeader(apiKey), Accept: 'application/json', ...extraHeaders };
    for (let attempt = 0; ; attempt++) {
      const retrievedAt = now();
      let res;
      try {
        res = await spaced(url, headers);
      } catch {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_WAIT_MS);
          continue;
        }
        throw new Error('network error');
      }
      if (res.status === 429) {
        throw new AbortRound('rate limited by Companies House (HTTP 429); round stopped');
      }
      if (res.status === 401 || res.status === 403) {
        throw new AbortRound(`Companies House refused the API key (HTTP ${res.status}); check the CH_API_KEY secret`);
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_WAIT_MS);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, bytes, retrievedAt, etagHeader: res.headers.get('etag') };
    }
  };
}
