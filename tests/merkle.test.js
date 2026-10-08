import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concat, fromHex, toHex } from '../lib/bytes.js';
import { sha256 } from '../lib/hash.js';
import {
  consistencyProof,
  inclusionProof,
  leafHash,
  memorySource,
  treeRoot,
  verifyConsistency,
  verifyInclusion,
} from '../lib/merkle.js';

// RFC 6962 test data, as used by the Certificate Transparency reference implementations.
const LEAVES = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'].map(fromHex);
const ROOTS = [
  '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
];

// The RFC 6962 definition, written out directly, as an independent check.
async function naiveRoot(leaves) {
  if (leaves.length === 0) return sha256(new Uint8Array());
  if (leaves.length === 1) return sha256(concat(Uint8Array.of(0), leaves[0]));
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  return sha256(concat(Uint8Array.of(1), await naiveRoot(leaves.slice(0, k)), await naiveRoot(leaves.slice(k))));
}

async function sourceFor(leaves) {
  const hashes = [];
  for (const l of leaves) hashes.push(await leafHash(l));
  return { source: memorySource(hashes), hashes };
}

test('RFC 6962 test vectors', async () => {
  const { source } = await sourceFor(LEAVES);
  assert.equal(toHex(await treeRoot(source, 0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  for (let size = 1; size <= LEAVES.length; size++) {
    assert.equal(toHex(await treeRoot(source, size)), ROOTS[size - 1], `size ${size}`);
  }
});

const MANY = Array.from({ length: 21 }, (_, i) => Uint8Array.of(i, i * 7 % 256));

test('roots match the RFC definition for sizes 0 to 21', async () => {
  const { source } = await sourceFor(MANY);
  for (let size = 0; size <= MANY.length; size++) {
    assert.deepEqual(await treeRoot(source, size), await naiveRoot(MANY.slice(0, size)), `size ${size}`);
  }
});

test('every inclusion proof verifies; a wrong index, leaf or root does not', async () => {
  const { source, hashes } = await sourceFor(MANY);
  for (let size = 1; size <= MANY.length; size++) {
    const root = await treeRoot(source, size);
    for (let i = 0; i < size; i++) {
      const proof = await inclusionProof(source, i, size);
      assert.equal(await verifyInclusion(hashes[i], i, size, proof, root), true, `leaf ${i} of ${size}`);
      if (size > 1) {
        assert.equal(await verifyInclusion(hashes[(i + 1) % size], i, size, proof, root), false);
        assert.equal(await verifyInclusion(hashes[i], (i + 1) % size, size, proof, root), false);
      }
      assert.equal(await verifyInclusion(hashes[i], i, size, proof, await sha256('x')), false);
    }
  }
});

test('every consistency proof verifies; a wrong old root does not', async () => {
  const { source } = await sourceFor(MANY);
  for (let n = 1; n <= MANY.length; n++) {
    const newRoot = await treeRoot(source, n);
    for (let m = 0; m <= n; m++) {
      const oldRoot = await treeRoot(source, m);
      const proof = await consistencyProof(source, m, n);
      assert.equal(await verifyConsistency(m, n, proof, oldRoot, newRoot), true, `${m} to ${n}`);
      if (m > 0 && m < n) {
        assert.equal(await verifyConsistency(m, n, proof, await sha256('x'), newRoot), false, `bad old root ${m} to ${n}`);
        assert.equal(await verifyConsistency(m, n, proof, oldRoot, await sha256('x')), false, `bad new root ${m} to ${n}`);
      }
    }
  }
});

test('a rewritten leaf breaks consistency with the earlier tree', async () => {
  const { source } = await sourceFor(MANY.slice(0, 10));
  const oldRoot = await treeRoot(source, 6);
  const rewritten = [...MANY.slice(0, 10)];
  rewritten[2] = Uint8Array.of(99);
  const { source: forged } = await sourceFor(rewritten);
  const proof = await consistencyProof(forged, 6, 10);
  assert.equal(await verifyConsistency(6, 10, proof, oldRoot, await treeRoot(forged, 10)), false);
});
