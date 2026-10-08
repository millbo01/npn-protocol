// C2SP tlog-tiles (c2sp.org/tlog-tiles): the static file layout of a manifest log.
// buildTiles() writes the files; tileSource() reads them back as a Merkle hash source,
// so any reader can compute inclusion and consistency proofs with no server.

import { concat, uint16 } from './bytes.js';
import { leafHash, nodeHash } from './merkle.js';

export const TILE_HEIGHT = 8;
export const TILE_WIDTH = 256;
const HASH_SIZE = 32;

// 1234067 -> "x001/x234/067".
export function encodeIndex(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('tile index must be a non-negative integer');
  let digits = String(n);
  digits = digits.padStart(Math.ceil(digits.length / 3) * 3, '0');
  const groups = digits.match(/.{3}/g);
  return groups.map((g, i) => (i < groups.length - 1 ? `x${g}` : g)).join('/');
}

const widthSuffix = (width) => (width === TILE_WIDTH ? '' : `.p/${width}`);

export function tilePath(level, index, width) {
  return `tile/${level}/${encodeIndex(index)}${widthSuffix(width)}`;
}

export function entriesPath(index, width) {
  return `tile/entries/${encodeIndex(index)}${widthSuffix(width)}`;
}

async function fullTileRoot(hashes) {
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(await nodeHash(level[i], level[i + 1]));
    level = next;
  }
  return level[0];
}

// All tile and entry bundle files for a log whose entries are given in order.
// Returns Map(path -> bytes). Full tiles never change; partial tiles get a new path per width.
export async function buildTiles(entries) {
  const files = new Map();
  for (let t = 0; t * TILE_WIDTH < entries.length; t++) {
    const slice = entries.slice(t * TILE_WIDTH, (t + 1) * TILE_WIDTH);
    for (const e of slice) if (e.length > 0xffff) throw new Error('log entry larger than 65535 bytes');
    files.set(entriesPath(t, slice.length), concat(...slice.map((e) => concat(uint16(e.length), e))));
  }
  let hashes = [];
  for (const e of entries) hashes.push(await leafHash(e));
  for (let level = 0; hashes.length > 0; level++) {
    const next = [];
    for (let t = 0; t * TILE_WIDTH < hashes.length; t++) {
      const slice = hashes.slice(t * TILE_WIDTH, (t + 1) * TILE_WIDTH);
      files.set(tilePath(level, t, slice.length), concat(...slice));
      if (slice.length === TILE_WIDTH) next.push(await fullTileRoot(slice));
    }
    hashes = next;
  }
  return files;
}

// A Merkle hash source over the tiles of a tree of the given size.
// read(path) returns the file's bytes (from disk, or fetched from a node's repo).
export function tileSource(size, read) {
  const tiles = new Map();
  const memo = new Map();

  function tile(tileLevel, index) {
    const count = Math.floor(size / TILE_WIDTH ** tileLevel);
    const width = Math.min(TILE_WIDTH, count - index * TILE_WIDTH);
    if (width <= 0) throw new Error('hash is outside the tree');
    const path = tilePath(tileLevel, index, width);
    if (!tiles.has(path)) {
      tiles.set(path, (async () => {
        const bytes = await read(path);
        if (bytes.length !== width * HASH_SIZE) throw new Error(`${path} has the wrong length`);
        return bytes;
      })());
    }
    return tiles.get(path);
  }

  async function getNode(level, index) {
    if (level % TILE_HEIGHT === 0) {
      const bytes = await tile(level / TILE_HEIGHT, Math.floor(index / TILE_WIDTH));
      const pos = index % TILE_WIDTH;
      return bytes.slice(pos * HASH_SIZE, (pos + 1) * HASH_SIZE);
    }
    const key = `${level}/${index}`;
    if (!memo.has(key)) {
      memo.set(key, (async () => nodeHash(await getNode(level - 1, 2 * index), await getNode(level - 1, 2 * index + 1)))());
    }
    return memo.get(key);
  }

  return { getNode };
}
