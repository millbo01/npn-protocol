// Collects one round's company profiles: fetch each watchlisted company, write changed
// canonical data, and return the manifest entries. The runner (runner/round.js) turns the
// entries into a signed manifest. Raw response bytes are hashed and then dropped.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ADAPTER_VERSION, COMPANY_NUMBER, RECORD_TYPE, SOURCE_ID, processProfile } from './profile.js';

export { ADAPTER_ID, ADAPTER_VERSION } from './profile.js';

export function watchlistTargets(watchlist) {
  if (!Number.isInteger(watchlist.version) || !Array.isArray(watchlist.entries)) {
    throw new Error('watchlist needs an integer version and an entries array');
  }
  const targets = watchlist.entries.filter((e) => e.source === SOURCE_ID && e.type === RECORD_TYPE);
  for (const target of targets) {
    if (typeof target.id !== 'string' || !COMPANY_NUMBER.test(target.id)) {
      throw new Error(`watchlist id ${JSON.stringify(target.id)} is not an 8-character company number`);
    }
  }
  return targets;
}

export async function collect({ watchlist, fetchProfile, dataDir, log = console }) {
  const entries = [];
  const errors = [];
  for (const target of watchlistTargets(watchlist)) {
    const recordId = `${RECORD_TYPE}/${target.id}`;
    try {
      const response = await fetchProfile(target.id);
      if (response.status !== 200) {
        errors.push({ record_id: recordId, error: `HTTP ${response.status}` });
        continue;
      }
      const result = await processProfile(response.bytes, target.id);
      await writeIfChanged(join(dataDir, SOURCE_ID, RECORD_TYPE, `${target.id}.json`), result.canonical);
      entries.push({
        source: SOURCE_ID,
        record_id: result.recordId,
        version_key: result.versionKey,
        adapter_version: ADAPTER_VERSION,
        canonical_hash: result.canonicalHash,
        raw_hash: result.rawHash,
        retrieved_at: isoSeconds(response.retrievedAt),
      });
      for (const field of result.unknownFields) {
        log.warn(`${recordId}: unknown field ${field} dropped; review it for the allowlist`);
      }
    } catch (err) {
      if (err.name === 'AbortRound') throw err;
      errors.push({ record_id: recordId, error: err.message });
    }
  }
  return { entries, errors };
}

async function writeIfChanged(path, bytes) {
  let existing = null;
  try {
    existing = await readFile(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (existing && Buffer.from(bytes).equals(existing)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return true;
}

export function isoSeconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
