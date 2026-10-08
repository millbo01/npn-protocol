// Deterministic test keys from fixed seeds. Test keys only; never used by a node.

import { publicKeyFromSeed } from '../../lib/ed25519.js';
import { formatPublicKey } from '../../lib/ssh.js';

export async function testKey(fill) {
  const seed = new Uint8Array(32).fill(fill);
  const publicRaw = await publicKeyFromSeed(seed);
  return { seed, publicRaw, line: formatPublicKey(publicRaw) };
}

export function testNode(nodeId, key, extra = {}) {
  return {
    node_id: nodeId,
    public_key: key.line,
    key_from_seq: 0,
    retired_keys: [],
    repo_url: `https://example.org/test/${nodeId}`,
    name_store_url: null,
    operator: 'Test operator',
    hosting_platform: 'Test',
    ci_platform: 'Test',
    operating_system: 'Test',
    conflict_disclosure: 'Test node.',
    independence: 'none',
    ...extra,
  };
}
