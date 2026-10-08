import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHex, uint32 } from '../lib/bytes.js';
import { sha256 } from '../lib/hash.js';
import { consistencyProof, inclusionProof, leafHash, memorySource, treeRoot, verifyConsistency, verifyInclusion } from '../lib/merkle.js';
import { buildTiles, encodeIndex, entriesPath, tilePath, tileSource } from '../lib/tiles.js';

async function entries(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await sha256(uint32(i)));
  return out;
}

async function memoryRoot(list) {
  const hashes = [];
  for (const e of list) hashes.push(await leafHash(e));
  return treeRoot(memorySource(hashes), list.length);
}

const reader = (files) => async (path) => {
  if (!files.has(path)) throw new Error(`missing ${path}`);
  return files.get(path);
};

test('tile index encoding (c2sp.org/tlog-tiles)', () => {
  assert.equal(encodeIndex(0), '000');
  assert.equal(encodeIndex(5), '005');
  assert.equal(encodeIndex(999), '999');
  assert.equal(encodeIndex(1000), 'x001/000');
  assert.equal(encodeIndex(1234067), 'x001/x234/067');
  assert.equal(tilePath(0, 1234067, 256), 'tile/0/x001/x234/067');
  assert.equal(tilePath(2, 0, 7), 'tile/2/000.p/7');
  assert.equal(entriesPath(1, 3), 'tile/entries/001.p/3');
});

test('tile and entry bundle files for 257 entries', async () => {
  const files = await buildTiles(await entries(257));
  assert.deepEqual([...files.keys()].sort(), [
    'tile/0/000',
    'tile/0/001.p/1',
    'tile/1/000.p/1',
    'tile/entries/000',
    'tile/entries/001.p/1',
  ]);
  assert.equal(files.get('tile/0/000').length, 256 * 32);
  assert.equal(files.get('tile/entries/001.p/1').length, 2 + 32);
  assert.deepEqual(files.get('tile/entries/001.p/1').slice(0, 2), Uint8Array.of(0, 32));
});

test('the root computed from tiles equals the in-memory root', async () => {
  for (const n of [1, 2, 3, 255, 256, 257, 511, 512, 513, 1000]) {
    const list = await entries(n);
    const files = await buildTiles(list);
    assert.equal(toHex(await treeRoot(tileSource(n, reader(files)), n)), toHex(await memoryRoot(list)), `size ${n}`);
  }
});

test('an inclusion proof computed from tiles verifies against the checkpointed root', async () => {
  const list = await entries(600);
  const files = await buildTiles(list);
  const source = tileSource(600, reader(files));
  const root = await memoryRoot(list);
  for (const i of [0, 1, 255, 256, 511, 512, 599]) {
    const proof = await inclusionProof(source, i, 600);
    assert.equal(await verifyInclusion(await leafHash(list[i]), i, 600, proof, root), true, `entry ${i}`);
  }
});

test('old partial tiles stay readable, so old roots and consistency proofs still work', async () => {
  const list = await entries(700);
  const all = new Map();
  for (const n of [300, 700]) for (const [p, b] of await buildTiles(list.slice(0, n))) all.set(p, b);
  assert.ok(all.has('tile/0/001.p/44') && all.has('tile/0/002.p/188'));
  const oldRoot = await treeRoot(tileSource(300, reader(all)), 300);
  assert.equal(toHex(oldRoot), toHex(await memoryRoot(list.slice(0, 300))));
  const source = tileSource(700, reader(all));
  const proof = await consistencyProof(source, 300, 700);
  assert.equal(await verifyConsistency(300, 700, proof, oldRoot, await treeRoot(source, 700)), true);
});

test('full tiles never change as the log grows', async () => {
  const list = await entries(600);
  const a = await buildTiles(list.slice(0, 520));
  const b = await buildTiles(list);
  for (const [path, bytes] of a) if (!path.includes('.p/')) assert.deepEqual(b.get(path), bytes, path);
});

test('a level-2 tile appears at 65536 entries', async () => {
  const list = await entries(65537);
  const files = await buildTiles(list);
  assert.ok(files.has('tile/2/000.p/1'));
  assert.equal(toHex(await treeRoot(tileSource(65537, reader(files)), 65537)), toHex(await memoryRoot(list)));
});
