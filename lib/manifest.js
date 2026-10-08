// Round manifests (DESIGN.md section 4): building, first_seq, parsing.

import { canonicalBytes, canonicalise } from './canonicalise.js';
import { fromUtf8 } from './bytes.js';

export const MANIFEST_FORMAT = 1;
export const PROTOCOL_VERSION = 1;

// The key nodes vote on (DESIGN.md section 5).
export function entryKey(entry) {
  return JSON.stringify([entry.source, entry.record_id, entry.version_key, entry.adapter_version]);
}

// For each key, the sequence number of the node's first manifest entry for it.
export function firstSeqIndex(manifests) {
  const index = new Map();
  for (const m of manifests) {
    for (const e of m.entries) if (!index.has(entryKey(e))) index.set(entryKey(e), m.sequence);
  }
  return index;
}

const byKey = (a, b) => {
  const ka = entryKey(a);
  const kb = entryKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

export function buildManifest({
  nodeId,
  sequence,
  previousManifestHash,
  protocolTag,
  protocolCommit,
  signerListVersion,
  watchlistVersion,
  adaptersConfigVersion,
  startedAt,
  completedAt,
  entries,
  errors,
  firstSeqs,
  peerCheckpoints = [],
}) {
  if (sequence === 0 && previousManifestHash !== null) throw new Error('manifest 0 has no previous manifest');
  if (sequence > 0 && typeof previousManifestHash !== 'string') throw new Error('previous manifest hash is required');
  return {
    record_type: 'manifest',
    format_version: MANIFEST_FORMAT,
    protocol_version: PROTOCOL_VERSION,
    protocol_tag: protocolTag,
    protocol_commit: protocolCommit,
    node_id: nodeId,
    sequence,
    previous_manifest_hash: previousManifestHash,
    signer_list_version: signerListVersion,
    watchlist_version: watchlistVersion,
    adapters_config_version: adaptersConfigVersion,
    started_at: startedAt,
    completed_at: completedAt,
    entries: entries
      .map((e) => ({ ...e, first_seq: firstSeqs.get(entryKey(e)) ?? sequence }))
      .sort(byKey),
    errors,
    peer_checkpoints: peerCheckpoints,
  };
}

export function manifestBytes(manifest) {
  return canonicalBytes(manifest);
}

export function manifestPath(sequence) {
  return `manifests/${String(sequence).padStart(6, '0')}.json`;
}

// Parses manifest bytes and checks they are exactly the canonical form.
export function parseManifest(bytes) {
  const text = fromUtf8(bytes);
  const manifest = JSON.parse(text);
  if (canonicalise(manifest) !== text) throw new Error('manifest bytes are not in RFC 8785 canonical form');
  if (manifest.record_type !== 'manifest') throw new Error('not a manifest');
  if (!Number.isSafeInteger(manifest.sequence) || manifest.sequence < 0) throw new Error('manifest sequence is invalid');
  if (typeof manifest.node_id !== 'string') throw new Error('manifest node_id is missing');
  if (!Array.isArray(manifest.entries)) throw new Error('manifest entries are missing');
  return manifest;
}
