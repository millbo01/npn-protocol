// Verification against a signer list: manifests, checkpoints, log consistency and inclusion.
// Every function returns { valid, reason, ... } rather than throwing, so callers can report why.

import { equal, fromHex } from './bytes.js';
import { parseCheckpointText } from './checkpoint.js';
import { parseManifest } from './manifest.js';
import { consistencyProof, inclusionProof, leafHash, verifyConsistency, verifyInclusion } from './merkle.js';
import { verifyNote } from './signed-note.js';
import { NAMESPACES, findNode, keyForSequence, logOrigin } from './signers.js';
import * as sshsig from './sshsig.js';

const invalid = (reason, extra = {}) => ({ valid: false, reason, ...extra });

export async function verifyManifest({ manifestBytes, signature, signerList }) {
  let manifest;
  try {
    manifest = parseManifest(manifestBytes);
  } catch (err) {
    return invalid(`not a valid manifest: ${err.message}`);
  }
  const { node_id: nodeId, sequence } = manifest;
  if (!findNode(signerList, nodeId)) return invalid(`node ${nodeId} is not on the signer list`, { nodeId, sequence });
  const expected = keyForSequence(signerList, nodeId, sequence);
  if (!expected) return invalid(`no key of node ${nodeId} covers sequence ${sequence}`, { nodeId, sequence });
  const sig = await sshsig.verify(signature, manifestBytes, NAMESPACES.manifest);
  if (!sig.valid) return invalid(sig.reason, { nodeId, sequence });
  if (!equal(sig.publicRaw, expected)) {
    return invalid(`signed by a key that is not node ${nodeId}'s key for sequence ${sequence}`, { nodeId, sequence });
  }
  return { valid: true, nodeId, sequence, manifest };
}

// A checkpoint of size n is signed with the key valid for sequence n - 1, the last manifest it covers.
export async function verifyCheckpoint({ note, signerList, nodeId }) {
  const node = findNode(signerList, nodeId);
  if (!node) return invalid(`node ${nodeId} is not on the signer list`);
  const origin = logOrigin(node);
  let body;
  try {
    const end = note.lastIndexOf('\n\n');
    body = parseCheckpointText(end < 0 ? note : note.slice(0, end + 1));
  } catch (err) {
    return invalid(`not a valid checkpoint: ${err.message}`);
  }
  if (body.origin !== origin) return invalid(`checkpoint origin is ${body.origin}, expected ${origin}`);
  if (body.size === 0) return invalid('checkpoint of an empty log');
  const key = keyForSequence(signerList, nodeId, body.size - 1);
  if (!key) return invalid(`no key of node ${nodeId} covers sequence ${body.size - 1}`);
  const result = await verifyNote(note, origin, key);
  if (!result.valid) return invalid(result.reason);
  return { valid: true, size: body.size, root: body.root, origin };
}

// Is the newer checkpoint an append-only extension of the older one? The proof is computed
// from the newer log's tiles (source) and checked against both signed roots.
export async function verifyLogConsistency({ older, newer, source }) {
  if (newer.size < older.size) return invalid('newer checkpoint is smaller than the older one');
  let proof;
  try {
    proof = await consistencyProof(source, older.size, newer.size);
  } catch (err) {
    return invalid(`cannot build a consistency proof from the tiles: ${err.message}`);
  }
  const ok = await verifyConsistency(older.size, newer.size, proof, older.root, newer.root);
  return ok ? { valid: true } : invalid('the newer log does not extend the older one: history was rewritten or the tiles are wrong');
}

// Is the manifest with this hash at this sequence number in the checkpointed tree?
export async function verifyManifestInclusion({ manifestHashHex, sequence, checkpoint, source }) {
  let proof;
  try {
    proof = await inclusionProof(source, sequence, checkpoint.size);
  } catch (err) {
    return invalid(`cannot build an inclusion proof from the tiles: ${err.message}`);
  }
  const leaf = await leafHash(fromHex(manifestHashHex));
  const ok = await verifyInclusion(leaf, sequence, checkpoint.size, proof, checkpoint.root);
  return ok ? { valid: true } : invalid(`manifest ${sequence} is not in the checkpointed log with that hash`);
}
