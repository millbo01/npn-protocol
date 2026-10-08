import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex, toHex } from '../lib/bytes.js';
import { publicKeyFromSeed, sign, verify } from '../lib/ed25519.js';

// RFC 8032 section 7.1, test 1.
const SEED = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const PUBLIC = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const SIGNATURE = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

test('RFC 8032 test 1: public key, signature and verification', async () => {
  assert.equal(toHex(await publicKeyFromSeed(SEED)), PUBLIC);
  assert.equal(toHex(await sign(SEED, new Uint8Array())), SIGNATURE);
  assert.equal(await verify(fromHex(PUBLIC), fromHex(SIGNATURE), new Uint8Array()), true);
  assert.equal(await verify(fromHex(PUBLIC), fromHex(SIGNATURE), new Uint8Array([0])), false);
});

test('malformed keys and signatures do not verify', async () => {
  assert.equal(await verify(new Uint8Array(31), fromHex(SIGNATURE), new Uint8Array()), false);
  assert.equal(await verify(fromHex(PUBLIC), new Uint8Array(63), new Uint8Array()), false);
});
