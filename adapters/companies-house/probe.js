// Checks how the company profile etag behaves, against the live API.
// For each watchlisted company: fetch twice, compare the body etag, report the HTTP ETag
// header, and send a conditional request with that header to see whether the API answers 304.
// Prints only company numbers, etags and HTTP statuses. No response body is printed or kept.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createProfileFetcher } from './fetch.js';
import { watchlistTargets } from './round.js';

const { values } = parseArgs({ options: { 'config-dir': { type: 'string' } } });
const apiKey = process.env.CH_API_KEY;
if (!values['config-dir'] || !apiKey) {
  console.error('needs --config-dir and CH_API_KEY');
  process.exit(1);
}

const watchlist = JSON.parse(await readFile(join(values['config-dir'], 'watchlist.json'), 'utf8'));
const fetchProfile = createProfileFetcher({ apiKey });

const bodyEtag = (bytes) => {
  try {
    const etag = JSON.parse(new TextDecoder().decode(bytes)).etag;
    return typeof etag === 'string' ? etag : '(absent)';
  } catch {
    return '(unreadable)';
  }
};

for (const { id } of watchlistTargets(watchlist)) {
  const first = await fetchProfile(id);
  const second = await fetchProfile(id);
  const a = bodyEtag(first.bytes);
  const b = bodyEtag(second.bytes);
  console.log(`${id}: HTTP ${first.status}/${second.status}; body etag ${a}; repeat ${a === b ? 'same' : `different (${b})`}`);
  console.log(`${id}: HTTP ETag header ${first.etagHeader ?? '(absent)'}`);
  if (first.etagHeader) {
    const conditional = await fetchProfile(id, { 'If-None-Match': first.etagHeader });
    console.log(`${id}: If-None-Match with the header value gives HTTP ${conditional.status}`);
  }
}
