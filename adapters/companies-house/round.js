// One round for one node: fetch every watchlisted company profile, write changed canonical
// data, and write a round record (the unsigned precursor of the Phase 2 manifest).
// Raw response bytes are hashed and then dropped; they are never written anywhere.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalBytes } from '../../lib/canonicalise.js';
import {
  ADAPTER_ID,
  ADAPTER_VERSION,
  COMPANY_NUMBER,
  RECORD_TYPE,
  SOURCE_ID,
  processProfile,
} from './profile.js';

export const ROUND_RECORD_FORMAT = 1;

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

export function checkPin(adaptersConfig, protocolTag) {
  const pinned = adaptersConfig.adapters?.[ADAPTER_ID];
  if (pinned !== ADAPTER_VERSION) {
    throw new Error(`config/adapters.json pins ${ADAPTER_ID} at ${pinned}, but this code is version ${ADAPTER_VERSION}`);
  }
  if (adaptersConfig.protocol_tag !== protocolTag) {
    throw new Error(`config/adapters.json pins tag ${adaptersConfig.protocol_tag}, but the code that ran is ${protocolTag}`);
  }
}

export async function runRound({
  watchlist,
  adaptersConfig,
  fetchProfile,
  dataDir,
  logDir,
  nodeId,
  protocolTag,
  protocolCommit,
  now = () => new Date(),
  log = console,
}) {
  checkPin(adaptersConfig, protocolTag);
  const targets = watchlistTargets(watchlist);
  const startedAt = isoSeconds(now());
  const entries = [];
  const errors = [];

  for (const target of targets) {
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

  entries.sort((a, b) => compare(a.record_id, b.record_id));
  const record = {
    record_type: 'round-record',
    format_version: ROUND_RECORD_FORMAT,
    node_id: nodeId,
    protocol_tag: protocolTag,
    protocol_commit: protocolCommit,
    watchlist_version: watchlist.version,
    adapters_config_version: adaptersConfig.version,
    started_at: startedAt,
    completed_at: isoSeconds(now()),
    entries,
    errors,
  };
  const roundId = startedAt.replace(/[-:]/g, '');
  const path = join(logDir, 'rounds', `${roundId}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonicalBytes(record), { flag: 'wx' });
  return { roundId, path, record };
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

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
