// RFC 6962 / RFC 9162 Merkle trees: tree hashes, inclusion and consistency proofs, and
// their verification. Proofs are built from a hash source, so the same code works over leaves
// held in memory and over C2SP tlog-tiles fetched from a node (lib/tiles.js).
//
// A hash source has getNode(level, index): the hash of the complete subtree of 2^level
// leaves starting at leaf index * 2^level.

import { concat, equal } from './bytes.js';
import { sha256 } from './hash.js';

export async function leafHash(data) {
  return sha256(concat(Uint8Array.of(0x00), data));
}

export async function nodeHash(left, right) {
  return sha256(concat(Uint8Array.of(0x01), left, right));
}

const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;

function largestPowerOfTwoBelow(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

// Hash source over leaf hashes held in memory.
export function memorySource(leafHashes) {
  const memo = new Map();
  async function getNode(level, index) {
    if (level === 0) {
      if (index >= leafHashes.length) throw new Error('leaf out of range');
      return leafHashes[index];
    }
    const key = `${level}/${index}`;
    if (!memo.has(key)) {
      memo.set(key, (async () => nodeHash(await getNode(level - 1, 2 * index), await getNode(level - 1, 2 * index + 1)))());
    }
    return memo.get(key);
  }
  return { getNode };
}

// MTH(D[start:end]) per RFC 9162 section 2.1.1.
async function subtreeHash(source, start, end) {
  const n = end - start;
  if (n === 1) return source.getNode(0, start);
  if (isPowerOfTwo(n) && start % n === 0) return source.getNode(Math.log2(n), start / n);
  const k = largestPowerOfTwoBelow(n);
  return nodeHash(await subtreeHash(source, start, start + k), await subtreeHash(source, start + k, end));
}

export async function treeRoot(source, size) {
  if (size === 0) return sha256(new Uint8Array());
  return subtreeHash(source, 0, size);
}

// PATH(m, D[n]) per RFC 9162 section 2.1.3.1.
export async function inclusionProof(source, index, size) {
  if (!(index >= 0 && index < size)) throw new Error('leaf index out of range');
  async function path(m, start, end) {
    const n = end - start;
    if (n === 1) return [];
    const k = largestPowerOfTwoBelow(n);
    if (m < start + k) return [...(await path(m, start, start + k)), await subtreeHash(source, start + k, end)];
    return [...(await path(m, start + k, end)), await subtreeHash(source, start, start + k)];
  }
  return path(index, 0, size);
}

// PROOF(m, D[n]) per RFC 9162 section 2.1.4.1.
export async function consistencyProof(source, oldSize, newSize) {
  if (!(oldSize >= 0 && oldSize <= newSize)) throw new Error('old size out of range');
  if (oldSize === 0 || oldSize === newSize) return [];
  async function subproof(m, start, end, complete) {
    const n = end - start;
    if (m === n) return complete ? [] : [await subtreeHash(source, start, end)];
    const k = largestPowerOfTwoBelow(n);
    if (m <= k) return [...(await subproof(m, start, start + k, complete)), await subtreeHash(source, start + k, end)];
    return [...(await subproof(m - k, start + k, end, false)), await subtreeHash(source, start, start + k)];
  }
  return subproof(oldSize, 0, newSize, true);
}

// RFC 9162 section 2.1.3.2.
export async function verifyInclusion(leaf, index, size, proof, root) {
  if (!(index >= 0 && index < size)) return false;
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of proof) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      r = await nodeHash(p, r);
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>>= 1;
        sn >>>= 1;
      }
    } else {
      r = await nodeHash(r, p);
    }
    fn >>>= 1;
    sn >>>= 1;
  }
  return sn === 0 && equal(r, root);
}

// RFC 9162 section 2.1.4.2, plus the trivial cases it leaves out.
export async function verifyConsistency(oldSize, newSize, proof, oldRoot, newRoot) {
  if (!(oldSize >= 0 && oldSize <= newSize)) return false;
  if (oldSize === newSize) return proof.length === 0 && equal(oldRoot, newRoot);
  if (oldSize === 0) return proof.length === 0;
  if (proof.length === 0) return false;
  const path = isPowerOfTwo(oldSize) ? [oldRoot, ...proof] : [...proof];
  let fn = oldSize - 1;
  let sn = newSize - 1;
  while ((fn & 1) === 1) {
    fn >>>= 1;
    sn >>>= 1;
  }
  let fr = path[0];
  let sr = path[0];
  for (const c of path.slice(1)) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      fr = await nodeHash(c, fr);
      sr = await nodeHash(c, sr);
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>>= 1;
        sn >>>= 1;
      }
    } else {
      sr = await nodeHash(sr, c);
    }
    fn >>>= 1;
    sn >>>= 1;
  }
  return equal(fr, oldRoot) && equal(sr, newRoot) && sn === 0;
}
