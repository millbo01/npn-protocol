// Signer lists (DESIGN.md section 6): validation, signer list version, key lookup by
// sequence number, and the generated OpenSSH allowed_signers file.

import { canonicalBytes } from './canonicalise.js';
import { sha256Hex } from './hash.js';
import { formatPublicKey, parsePublicKey } from './ssh.js';

export const NAMESPACES = Object.freeze({
  manifest: 'npn-manifest',
  checkpoint: 'npn-checkpoint',
  git: 'git',
});

const NODE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const isSeq = (n) => Number.isSafeInteger(n) && n >= 0;

export function validateSignerList(list) {
  if (!list || !Array.isArray(list.nodes)) throw new Error('signer list needs a nodes array');
  const seen = new Set();
  for (const node of list.nodes) {
    const id = node.node_id;
    if (typeof id !== 'string' || !NODE_ID.test(id)) throw new Error(`invalid node_id ${JSON.stringify(id)}`);
    if (seen.has(id)) throw new Error(`duplicate node_id ${id}`);
    seen.add(id);
    parsePublicKey(node.public_key);
    if (!isSeq(node.key_from_seq)) throw new Error(`${id}: key_from_seq must be a non-negative integer`);
    if (!Array.isArray(node.retired_keys)) throw new Error(`${id}: retired_keys must be an array`);
    const ranges = node.retired_keys.map((k) => {
      parsePublicKey(k.public_key);
      if (!isSeq(k.from_seq) || !isSeq(k.to_seq) || k.from_seq > k.to_seq) {
        throw new Error(`${id}: retired key range must be from_seq <= to_seq`);
      }
      return [k.from_seq, k.to_seq];
    });
    ranges.push([node.key_from_seq, Infinity]);
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i][0] <= ranges[i - 1][1]) throw new Error(`${id}: key sequence ranges overlap`);
    }
    if (typeof node.repo_url !== 'string' || !/^https:\/\/[^\s]+[^/]$/.test(node.repo_url)) {
      throw new Error(`${id}: repo_url must be an https URL with no trailing slash`);
    }
    if (typeof node.independence !== 'string') throw new Error(`${id}: independence is required`);
  }
  return list;
}

const normaliseKey = (line) => formatPublicKey(parsePublicKey(line));

// SHA-256 of the RFC 8785 form of the sorted node ids and keys only. Node metadata is
// excluded, so editing it does not change the version (DESIGN.md section 6).
export async function signerListVersion(list) {
  validateSignerList(list);
  const core = list.nodes
    .map((n) => ({
      node_id: n.node_id,
      public_key: normaliseKey(n.public_key),
      key_from_seq: n.key_from_seq,
      retired_keys: n.retired_keys
        .map((k) => ({ public_key: normaliseKey(k.public_key), from_seq: k.from_seq, to_seq: k.to_seq }))
        .sort((a, b) => a.from_seq - b.from_seq),
    }))
    .sort((a, b) => (a.node_id < b.node_id ? -1 : a.node_id > b.node_id ? 1 : 0));
  return sha256Hex(canonicalBytes(core));
}

export function findNode(list, nodeId) {
  return list.nodes.find((n) => n.node_id === nodeId) ?? null;
}

// The node's public key valid for a sequence number, or null.
export function keyForSequence(list, nodeId, sequence) {
  const node = findNode(list, nodeId);
  if (!node || !isSeq(sequence)) return null;
  if (sequence >= node.key_from_seq) return parsePublicKey(node.public_key);
  const retired = node.retired_keys.find((k) => sequence >= k.from_seq && sequence <= k.to_seq);
  return retired ? parsePublicKey(retired.public_key) : null;
}

// The log origin and checkpoint key name: the node repo URL without its scheme.
export function logOrigin(node) {
  return node.repo_url.replace(/^https:\/\//, '');
}

// OpenSSH allowed_signers file. Stock OpenSSH cannot express sequence ranges, so it accepts
// a retired key for any sequence; lib/verify.js enforces the ranges.
export function generateAllowedSigners(list, listName) {
  validateSignerList(list);
  const namespaces = `namespaces="${[NAMESPACES.manifest, NAMESPACES.checkpoint, NAMESPACES.git].join(',')}"`;
  const lines = [
    `# Generated from signers/${listName}.json by runner/generate-allowed-signers.js. Do not edit.`,
    '# Retired keys are listed for verifying old signatures; their sequence ranges are in the JSON file.',
  ];
  const nodes = [...list.nodes].sort((a, b) => (a.node_id < b.node_id ? -1 : 1));
  for (const node of nodes) {
    lines.push(`${node.node_id} ${namespaces} ${normaliseKey(node.public_key)}`);
    for (const k of [...node.retired_keys].sort((a, b) => a.from_seq - b.from_seq)) {
      lines.push(`# ${node.node_id} retired key, sequences ${k.from_seq} to ${k.to_seq}`);
      lines.push(`${node.node_id} ${namespaces} ${normaliseKey(k.public_key)}`);
    }
  }
  return lines.join('\n') + '\n';
}
