// Verify a node's signed objects against a signer list, with the same library readers use.
//
//   node runner/verify.js manifest <manifest.json> <manifest.json.sig> --signers <list.json>
//   node runner/verify.js checkpoint <checkpoint> --node <node id> --signers <list.json>
//   node runner/verify.js log <log dir> --node <node id> --signers <list.json> [--since <older checkpoint>]
//
// `log` checks everything in a node's log directory: every manifest signature, the sequence
// and previous-hash chain, the latest checkpoint, the root recomputed from the tiles, the
// inclusion of every manifest, and consistency with every kept checkpoint and with --since.
// Prints VALID or INVALID with the reason; exits 0 only if everything is valid.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { equal } from '../lib/bytes.js';
import { sha256Hex } from '../lib/hash.js';
import { treeRoot } from '../lib/merkle.js';
import { tileSource } from '../lib/tiles.js';
import { verifyCheckpoint, verifyLogConsistency, verifyManifest, verifyManifestInclusion } from '../lib/verify.js';
import { readManifests } from './log-store.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { signers: { type: 'string' }, node: { type: 'string' }, since: { type: 'string' } },
});

const readText = (path) => readFile(path, 'utf8');
const readBytes = async (path) => new Uint8Array(await readFile(path));
const failures = [];
const report = (label, result) => {
  console.log(`${result.valid ? 'VALID  ' : 'INVALID'} ${label}${result.valid ? '' : `: ${result.reason}`}`);
  if (!result.valid) failures.push(label);
};

async function verifyLog(logDir, signerList, nodeId) {
  const manifests = await readManifests(logDir);
  let previousHash = null;
  for (const { sequence, bytes } of manifests) {
    const sig = await readText(join(logDir, 'manifests', `${String(sequence).padStart(6, '0')}.json.sig`));
    const result = await verifyManifest({ manifestBytes: bytes, signature: sig, signerList });
    if (result.valid && result.nodeId !== nodeId) Object.assign(result, { valid: false, reason: `belongs to ${result.nodeId}` });
    if (result.valid && result.manifest.previous_manifest_hash !== previousHash) {
      Object.assign(result, { valid: false, reason: 'previous_manifest_hash does not match the previous manifest' });
    }
    report(`manifest ${sequence}`, result);
    previousHash = await sha256Hex(bytes);
  }

  const latest = await verifyCheckpoint({ note: await readText(join(logDir, 'checkpoint')), signerList, nodeId });
  report('latest checkpoint signature', latest);
  if (!latest.valid) return;
  report('checkpoint covers every manifest', latest.size === manifests.length
    ? { valid: true }
    : { valid: false, reason: `checkpoint size ${latest.size}, manifests ${manifests.length}` });

  const source = tileSource(latest.size, (path) => readBytes(join(logDir, path)));
  const root = await treeRoot(source, latest.size);
  report('root recomputed from tiles', equal(root, latest.root) ? { valid: true } : { valid: false, reason: 'tiles give a different root' });
  for (const { sequence, bytes } of manifests.slice(0, latest.size)) {
    report(`manifest ${sequence} included`, await verifyManifestInclusion({
      manifestHashHex: await sha256Hex(bytes), sequence, checkpoint: latest, source,
    }));
  }

  const kept = (await readdir(join(logDir, 'checkpoints')).catch(() => []))
    .filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  for (const size of kept) {
    const older = await verifyCheckpoint({ note: await readText(join(logDir, 'checkpoints', String(size))), signerList, nodeId });
    report(`kept checkpoint ${size} signature`, older);
    if (older.valid) report(`latest checkpoint extends checkpoint ${size}`, await verifyLogConsistency({ older, newer: latest, source }));
  }
  if (values.since) {
    const older = await verifyCheckpoint({ note: await readText(values.since), signerList, nodeId });
    report(`--since checkpoint signature`, older);
    if (older.valid) report('latest checkpoint extends --since checkpoint', await verifyLogConsistency({ older, newer: latest, source }));
  }
}

const [mode, ...args] = positionals;
if (!values.signers || !mode) {
  console.error('usage: see the comment at the top of runner/verify.js');
  process.exit(2);
}
const signerList = JSON.parse(await readText(values.signers));

if (mode === 'manifest' && args.length === 2) {
  report(args[0], await verifyManifest({ manifestBytes: await readBytes(args[0]), signature: await readText(args[1]), signerList }));
} else if (mode === 'checkpoint' && args.length === 1 && values.node) {
  report(args[0], await verifyCheckpoint({ note: await readText(args[0]), signerList, nodeId: values.node }));
} else if (mode === 'log' && args.length === 1 && values.node) {
  await verifyLog(args[0], signerList, values.node);
} else {
  console.error('usage: see the comment at the top of runner/verify.js');
  process.exit(2);
}
process.exit(failures.length === 0 ? 0 : 1);
