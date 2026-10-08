import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../lib/hash.js';

test('SHA-256 known vectors', async () => {
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('strings and their UTF-8 bytes hash the same', async () => {
  assert.equal(await sha256Hex('é'), await sha256Hex(new Uint8Array([0xc3, 0xa9])));
});
