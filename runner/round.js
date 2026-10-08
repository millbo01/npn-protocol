// One node round (DESIGN.md sections 2 and 4): collect records from each adapter, write
// changed data, then append one signed manifest to the log, rebuild its tiles and publish a
// signed checkpoint. Everything is built and verified in memory before anything is written
// to the log, and the new log must extend the previous checkpoint.

import { join } from 'node:path';
import * as companiesHouse from '../adapters/companies-house/collect.js';
import { equal, fromHex, utf8 } from '../lib/bytes.js';
import { signCheckpoint } from '../lib/checkpoint.js';
import { sha256Hex } from '../lib/hash.js';
import { buildManifest, firstSeqIndex, manifestBytes, manifestPath } from '../lib/manifest.js';
import { leafHash, memorySource, treeRoot } from '../lib/merkle.js';
import { NAMESPACES, findNode, keyForSequence, logOrigin, signerListVersion, validateSignerList } from '../lib/signers.js';
import * as sshsig from '../lib/sshsig.js';
import { buildTiles, tileSource } from '../lib/tiles.js';
import { verifyCheckpoint, verifyLogConsistency, verifyManifest } from '../lib/verify.js';
import { readManifests, readOptional, writeMutable, writeOnce } from './log-store.js';

export const ADAPTERS = [companiesHouse];

export function checkPins(adaptersConfig, protocolTag, adapters = ADAPTERS) {
  if (adaptersConfig.protocol_tag !== protocolTag) {
    throw new Error(`config/adapters.json pins tag ${adaptersConfig.protocol_tag}, but the code that ran is ${protocolTag}`);
  }
  for (const adapter of adapters) {
    const pinned = adaptersConfig.adapters?.[adapter.ADAPTER_ID];
    if (pinned !== adapter.ADAPTER_VERSION) {
      throw new Error(`config/adapters.json pins ${adapter.ADAPTER_ID} at ${pinned}, but this code is version ${adapter.ADAPTER_VERSION}`);
    }
  }
}

const isoSeconds = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function runNodeRound({
  watchlist,
  adaptersConfig,
  signerList,
  fetchers,
  dataDir,
  logDir,
  nodeId,
  protocolTag,
  protocolCommit,
  signingKey,
  now = () => new Date(),
  log = console,
}) {
  // Checks that need no network and write nothing.
  checkPins(adaptersConfig, protocolTag);
  validateSignerList(signerList);
  const node = findNode(signerList, nodeId);
  if (!node) throw new Error(`node ${nodeId} is not on the signer list`);
  const prior = await readManifests(logDir);
  const sequence = prior.length;
  for (const p of prior) {
    if (p.manifest.node_id !== nodeId) throw new Error(`manifest ${p.sequence} belongs to ${p.manifest.node_id}, not ${nodeId}`);
  }
  const listedKey = keyForSequence(signerList, nodeId, sequence);
  if (!listedKey || !equal(listedKey, signingKey.publicRaw)) {
    throw new Error(`the signing key is not node ${nodeId}'s listed key for sequence ${sequence}`);
  }
  const previousNote = sequence > 0 ? await readOptional(join(logDir, 'checkpoint')) : null;
  if (sequence > 0 && !previousNote) throw new Error('log has manifests but no checkpoint');

  // Collect.
  const startedAt = isoSeconds(now());
  const entries = [];
  const errors = [];
  for (const adapter of ADAPTERS) {
    const result = await adapter.collect({ watchlist, fetchProfile: fetchers[adapter.ADAPTER_ID], dataDir, log });
    entries.push(...result.entries);
    errors.push(...result.errors);
  }

  // Manifest.
  const manifest = buildManifest({
    nodeId,
    sequence,
    previousManifestHash: sequence > 0 ? await sha256Hex(prior[sequence - 1].bytes) : null,
    protocolTag,
    protocolCommit,
    signerListVersion: await signerListVersion(signerList),
    watchlistVersion: watchlist.version,
    adaptersConfigVersion: adaptersConfig.version,
    startedAt,
    completedAt: isoSeconds(now()),
    entries,
    errors,
    firstSeqs: firstSeqIndex(prior.map((p) => p.manifest)),
  });
  const bytes = manifestBytes(manifest);
  const signature = await sshsig.sign(signingKey, bytes, NAMESPACES.manifest);

  // Log tree, tiles and checkpoint.
  const leaves = [];
  for (const p of prior) leaves.push(fromHex(await sha256Hex(p.bytes)));
  leaves.push(fromHex(await sha256Hex(bytes)));
  const tiles = await buildTiles(leaves);
  const leafHashes = [];
  for (const l of leaves) leafHashes.push(await leafHash(l));
  const size = leaves.length;
  const root = await treeRoot(memorySource(leafHashes), size);
  const checkpoint = await signCheckpoint(logOrigin(node), size, root, signingKey);
  const checkpointSig = await sshsig.sign(signingKey, utf8(checkpoint.text), NAMESPACES.checkpoint);

  // Verify before writing, with the same code readers use.
  const m = await verifyManifest({ manifestBytes: bytes, signature, signerList });
  if (!m.valid) throw new Error(`new manifest does not verify: ${m.reason}`);
  const c = await verifyCheckpoint({ note: checkpoint.note, signerList, nodeId });
  if (!c.valid) throw new Error(`new checkpoint does not verify: ${c.reason}`);
  if (previousNote) {
    const older = await verifyCheckpoint({ note: new TextDecoder().decode(previousNote), signerList, nodeId });
    if (!older.valid) throw new Error(`previous checkpoint does not verify: ${older.reason}`);
    const source = tileSource(size, async (path) => tiles.get(path) ?? Promise.reject(new Error(`missing ${path}`)));
    const consistent = await verifyLogConsistency({ older, newer: c, source });
    if (!consistent.valid) throw new Error(`new log does not extend the previous checkpoint: ${consistent.reason}`);
  }

  // Write: manifest and signature, tiles, then the checkpoint last.
  const path = manifestPath(sequence);
  await writeOnce(logDir, path, bytes);
  await writeOnce(logDir, `${path}.sig`, utf8(signature));
  for (const [tilePath, tileBytes] of tiles) await writeOnce(logDir, tilePath, tileBytes);
  await writeOnce(logDir, `checkpoints/${size}`, utf8(checkpoint.note));
  await writeOnce(logDir, `checkpoints/${size}.sshsig`, utf8(checkpointSig));
  await writeMutable(logDir, 'checkpoint', utf8(checkpoint.note));
  await writeMutable(logDir, 'checkpoint.sshsig', utf8(checkpointSig));

  return { sequence, size, path, manifest };
}
