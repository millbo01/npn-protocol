import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateAllowedSigners, keyForSequence, logOrigin, signerListVersion, validateSignerList } from '../lib/signers.js';
import { testKey, testNode } from './helpers/keys.js';

const genesisText = readFileSync(new URL('../signers/genesis.json', import.meta.url), 'utf8');
const allowedSigners = readFileSync(new URL('../signers/genesis.allowed_signers', import.meta.url), 'utf8');

test('the genesis list is valid and its allowed_signers file is up to date', () => {
  const genesis = JSON.parse(genesisText);
  validateSignerList(genesis);
  assert.equal(allowedSigners, generateAllowedSigners(genesis, 'genesis'));
  for (const node of genesis.nodes) assert.equal(node.independence, 'none', `${node.node_id} is a test node`);
});

test('editing node metadata leaves the signer list version unchanged', async () => {
  const a = await testKey(1);
  const b = await testKey(2);
  const list = { nodes: [testNode('node-a', a), testNode('node-b', b)] };
  const version = await signerListVersion(list);
  const edited = {
    curator: 'someone else',
    nodes: [
      testNode('node-b', b, { operating_system: 'Other', conflict_disclosure: 'Changed.', repo_url: 'https://example.org/moved' }),
      testNode('node-a', a, { hosting_platform: 'Other', name_store_url: 'https://names.example' }),
    ],
  };
  assert.equal(await signerListVersion(edited), version);
  assert.equal(await signerListVersion({ nodes: [testNode('node-a', a, { public_key: `${a.line} with a comment` }), testNode('node-b', b)] }), version);
});

test('changing a key, a key range or membership changes the version', async () => {
  const a = await testKey(1);
  const b = await testKey(2);
  const c = await testKey(3);
  const version = await signerListVersion({ nodes: [testNode('node-a', a), testNode('node-b', b)] });
  assert.notEqual(await signerListVersion({ nodes: [testNode('node-a', a), testNode('node-b', c)] }), version);
  assert.notEqual(await signerListVersion({ nodes: [testNode('node-a', a)] }), version);
  assert.notEqual(await signerListVersion({ nodes: [testNode('node-a', a), testNode('node-b', b, { key_from_seq: 1, retired_keys: [{ public_key: c.line, from_seq: 0, to_seq: 0 }] })] }), version);
});

test('key lookup by sequence follows rotations', async () => {
  const old = await testKey(1);
  const current = await testKey(2);
  const list = { nodes: [testNode('node-a', current, { key_from_seq: 10, retired_keys: [{ public_key: old.line, from_seq: 0, to_seq: 9 }] })] };
  validateSignerList(list);
  assert.deepEqual(keyForSequence(list, 'node-a', 0), old.publicRaw);
  assert.deepEqual(keyForSequence(list, 'node-a', 9), old.publicRaw);
  assert.deepEqual(keyForSequence(list, 'node-a', 10), current.publicRaw);
  assert.equal(keyForSequence(list, 'node-b', 0), null);
  assert.match(generateAllowedSigners(list, 'test'), /retired key, sequences 0 to 9/);
});

test('invalid lists are refused', async () => {
  const a = await testKey(1);
  assert.throws(() => validateSignerList({ nodes: [testNode('node-a', a), testNode('node-a', a)] }), /duplicate/);
  assert.throws(() => validateSignerList({ nodes: [testNode('Node A', a)] }), /invalid node_id/);
  assert.throws(() => validateSignerList({ nodes: [testNode('node-a', a, { key_from_seq: 5, retired_keys: [{ public_key: a.line, from_seq: 0, to_seq: 5 }] })] }), /overlap/);
  assert.throws(() => validateSignerList({ nodes: [testNode('node-a', a, { public_key: 'ssh-rsa AAAA' })] }), /ssh-ed25519/);
});

test('log origin is the repo URL without its scheme', async () => {
  assert.equal(logOrigin({ repo_url: 'https://github.com/millbo01/npn-node-1' }), 'github.com/millbo01/npn-node-1');
});
