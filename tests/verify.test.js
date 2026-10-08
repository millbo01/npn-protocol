import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex, utf8 } from '../lib/bytes.js';
import { signCheckpoint } from '../lib/checkpoint.js';
import { sha256Hex } from '../lib/hash.js';
import { buildManifest, manifestBytes } from '../lib/manifest.js';
import { leafHash, memorySource, treeRoot } from '../lib/merkle.js';
import { NAMESPACES, logOrigin } from '../lib/signers.js';
import * as sshsig from '../lib/sshsig.js';
import { buildTiles, tileSource } from '../lib/tiles.js';
import { verifyCheckpoint, verifyLogConsistency, verifyManifest, verifyManifestInclusion } from '../lib/verify.js';
import { testKey, testNode } from './helpers/keys.js';

function manifest(nodeId, sequence, previous) {
  return manifestBytes(buildManifest({
    nodeId,
    sequence,
    previousManifestHash: previous,
    protocolTag: 'v0.0.0-test',
    protocolCommit: '0'.repeat(40),
    signerListVersion: 'f'.repeat(64),
    watchlistVersion: 1,
    adaptersConfigVersion: 1,
    startedAt: '2026-10-08T06:17:00Z',
    completedAt: '2026-10-08T06:17:30Z',
    entries: [{ source: 'test', record_id: `r/${sequence}`, version_key: 'v', adapter_version: 1, canonical_hash: 'a'.repeat(64), raw_hash: 'b'.repeat(64), retrieved_at: '2026-10-08T06:17:05Z' }],
    errors: [],
    firstSeqs: new Map(),
  }));
}

async function setup() {
  const key = await testKey(1);
  const other = await testKey(2);
  const list = { nodes: [testNode('node-a', key), testNode('node-b', other)] };
  return { key, other, list };
}

test('a valid manifest verifies', async () => {
  const { key, list } = await setup();
  const bytes = manifest('node-a', 0, null);
  const signature = await sshsig.sign(key, bytes, NAMESPACES.manifest);
  const result = await verifyManifest({ manifestBytes: bytes, signature, signerList: list });
  assert.equal(result.valid, true, result.reason);
});

test('a manifest with one changed byte fails', async () => {
  const { key, list } = await setup();
  const bytes = manifest('node-a', 0, null);
  const signature = await sshsig.sign(key, bytes, NAMESPACES.manifest);
  const text = new TextDecoder().decode(bytes);
  const i = text.indexOf('"r/0"') + 3;
  const changed = utf8(text.slice(0, i) + '1' + text.slice(i + 1));
  assert.equal(changed.length, bytes.length);
  const result = await verifyManifest({ manifestBytes: changed, signature, signerList: list });
  assert.equal(result.valid, false);
  assert.match(result.reason, /does not match/);
});

test('a manifest signed by an unlisted key fails', async () => {
  const { list } = await setup();
  const stranger = await testKey(9);
  const bytes = manifest('node-a', 0, null);
  const signature = await sshsig.sign(stranger, bytes, NAMESPACES.manifest);
  const result = await verifyManifest({ manifestBytes: bytes, signature, signerList: list });
  assert.equal(result.valid, false);
  assert.match(result.reason, /not node node-a's key/);
});

test("a manifest signed with another listed node's key fails", async () => {
  const { other, list } = await setup();
  const bytes = manifest('node-a', 0, null);
  const signature = await sshsig.sign(other, bytes, NAMESPACES.manifest);
  assert.equal((await verifyManifest({ manifestBytes: bytes, signature, signerList: list })).valid, false);
});

test('a manifest from a node not on the list fails, and so does a wrong namespace', async () => {
  const { key, list } = await setup();
  const bytes = manifest('node-z', 0, null);
  const signature = await sshsig.sign(key, bytes, NAMESPACES.manifest);
  assert.match((await verifyManifest({ manifestBytes: bytes, signature, signerList: list })).reason, /not on the signer list/);
  const own = manifest('node-a', 0, null);
  const wrongNs = await sshsig.sign(key, own, NAMESPACES.checkpoint);
  assert.match((await verifyManifest({ manifestBytes: own, signature: wrongNs, signerList: list })).reason, /namespace/);
});

test('a non-canonical manifest fails even with a valid signature over its bytes', async () => {
  const { key, list } = await setup();
  const pretty = utf8(JSON.stringify(JSON.parse(new TextDecoder().decode(manifest('node-a', 0, null))), null, 2));
  const signature = await sshsig.sign(key, pretty, NAMESPACES.manifest);
  assert.match((await verifyManifest({ manifestBytes: pretty, signature, signerList: list })).reason, /canonical/);
});

test('a rotated key still verifies manifests from its sequence range, and only those', async () => {
  const old = await testKey(1);
  const current = await testKey(3);
  const list = { nodes: [testNode('node-a', current, { key_from_seq: 2, retired_keys: [{ public_key: old.line, from_seq: 0, to_seq: 1 }] })] };
  const m1 = manifest('node-a', 1, 'c'.repeat(64));
  const m2 = manifest('node-a', 2, 'd'.repeat(64));
  const ok = async (bytes, key) => (await verifyManifest({ manifestBytes: bytes, signature: await sshsig.sign(key, bytes, NAMESPACES.manifest), signerList: list })).valid;
  assert.equal(await ok(m1, old), true);
  assert.equal(await ok(m2, current), true);
  assert.equal(await ok(m2, old), false);
  assert.equal(await ok(m1, current), false);
});

async function buildLog(key, manifests) {
  const leaves = [];
  for (const m of manifests) leaves.push(fromHex(await sha256Hex(m)));
  const files = await buildTiles(leaves);
  const hashes = [];
  for (const l of leaves) hashes.push(await leafHash(l));
  const root = await treeRoot(memorySource(hashes), leaves.length);
  return { files, root, size: leaves.length };
}

const reader = (files) => async (p) => files.get(p) ?? Promise.reject(new Error(`missing ${p}`));

test('checkpoints verify against the node key and origin', async () => {
  const { key, other, list } = await setup();
  const origin = logOrigin(list.nodes[0]);
  const log = await buildLog(key, [manifest('node-a', 0, null)]);
  const { note } = await signCheckpoint(origin, log.size, log.root, key);
  const result = await verifyCheckpoint({ note, signerList: list, nodeId: 'node-a' });
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.size, 1);
  assert.equal((await verifyCheckpoint({ note, signerList: list, nodeId: 'node-b' })).valid, false);
  const forged = await signCheckpoint(origin, log.size, log.root, other);
  assert.equal((await verifyCheckpoint({ note: forged.note, signerList: list, nodeId: 'node-a' })).valid, false);
});

test('a later checkpoint is consistent with an earlier one, and inclusion verifies from tiles', async () => {
  const { key, list } = await setup();
  const origin = logOrigin(list.nodes[0]);
  const ms = [];
  for (let i = 0; i < 5; i++) ms.push(manifest('node-a', i, i === 0 ? null : await sha256Hex(ms[i - 1])));
  const early = await buildLog(key, ms.slice(0, 3));
  const late = await buildLog(key, ms);
  const older = await verifyCheckpoint({ note: (await signCheckpoint(origin, early.size, early.root, key)).note, signerList: list, nodeId: 'node-a' });
  const newer = await verifyCheckpoint({ note: (await signCheckpoint(origin, late.size, late.root, key)).note, signerList: list, nodeId: 'node-a' });
  const source = tileSource(late.size, reader(late.files));
  assert.equal((await verifyLogConsistency({ older, newer, source })).valid, true);
  for (let i = 0; i < 5; i++) {
    const r = await verifyManifestInclusion({ manifestHashHex: await sha256Hex(ms[i]), sequence: i, checkpoint: newer, source });
    assert.equal(r.valid, true, `manifest ${i}`);
  }
  const wrong = await verifyManifestInclusion({ manifestHashHex: await sha256Hex(ms[1]), sequence: 2, checkpoint: newer, source });
  assert.equal(wrong.valid, false);
});

test('a rewritten earlier manifest makes the consistency check fail', async () => {
  const { key, list } = await setup();
  const origin = logOrigin(list.nodes[0]);
  const ms = [];
  for (let i = 0; i < 5; i++) ms.push(manifest('node-a', i, i === 0 ? null : await sha256Hex(ms[i - 1])));
  const early = await buildLog(key, ms.slice(0, 3));
  const older = await verifyCheckpoint({ note: (await signCheckpoint(origin, early.size, early.root, key)).note, signerList: list, nodeId: 'node-a' });

  // The node rewrites manifest 1 and re-signs everything after. Each new object verifies on its own.
  const rewritten = [...ms];
  rewritten[1] = manifest('node-b', 1, await sha256Hex(ms[0]));
  const late = await buildLog(key, rewritten);
  const newer = await verifyCheckpoint({ note: (await signCheckpoint(origin, late.size, late.root, key)).note, signerList: list, nodeId: 'node-a' });
  assert.equal(newer.valid, true);
  const result = await verifyLogConsistency({ older, newer, source: tileSource(late.size, reader(late.files)) });
  assert.equal(result.valid, false);
  assert.match(result.reason, /rewritten/);
});
