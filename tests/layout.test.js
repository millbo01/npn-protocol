import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Folder layout from docs/DESIGN.md section 2.
const folders = [
  'docs',
  'lib',
  'adapters',
  'mapping',
  'node-template',
  'signers',
  'site',
  'tests',
  '.github/workflows',
];

test('repo layout matches DESIGN.md section 2', () => {
  for (const folder of folders) {
    assert.ok(existsSync(join(root, folder)), `missing folder: ${folder}`);
  }
});
