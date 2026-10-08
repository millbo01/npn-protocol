import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Folder layout from docs/DESIGN.md section 2.
const folders = [
  'docs',
  'config',
  'lib',
  'adapters',
  'mapping',
  'node-template',
  'signers',
  'site',
  'tests',
  '.github/workflows',
];

const files = ['LICENSE', 'DATA-LICENCE.md', 'config/watchlist.json', 'config/adapters.json'];

test('repo layout matches DESIGN.md section 2', () => {
  for (const folder of folders) {
    assert.ok(existsSync(join(root, folder)), `missing folder: ${folder}`);
  }
  for (const file of files) {
    assert.ok(existsSync(join(root, file)), `missing file: ${file}`);
  }
});

test('watchlist has a version and a list of entries', () => {
  const watchlist = JSON.parse(readFileSync(join(root, 'config/watchlist.json'), 'utf8'));
  assert.equal(typeof watchlist.version, 'number');
  assert.ok(Array.isArray(watchlist.entries));
});

test('adapters config has an integer version and a map of adapter versions', () => {
  const adapters = JSON.parse(readFileSync(join(root, 'config/adapters.json'), 'utf8'));
  assert.ok(Number.isInteger(adapters.version) && adapters.version >= 0);
  assert.equal(typeof adapters.adapters, 'object');
  assert.ok(adapters.adapters !== null && !Array.isArray(adapters.adapters));
});
