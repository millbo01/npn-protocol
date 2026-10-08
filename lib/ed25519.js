// Ed25519 (RFC 8032) through WebCrypto, so the same file runs in Node and in the browser.
// A private key is handled as its 32-byte seed and never leaves memory.

import { concat, fromHex } from './bytes.js';

const subtle = () => globalThis.crypto.subtle;

// PKCS #8 wrapper for a raw Ed25519 seed (RFC 8410).
const PKCS8_PREFIX = fromHex('302e020100300506032b657004220420');

async function privateKey(seed, extractable = false) {
  if (seed.length !== 32) throw new Error('Ed25519 seed must be 32 bytes');
  return subtle().importKey('pkcs8', concat(PKCS8_PREFIX, seed), { name: 'Ed25519' }, extractable, ['sign']);
}

export async function sign(seed, data) {
  return new Uint8Array(await subtle().sign({ name: 'Ed25519' }, await privateKey(seed), data));
}

export async function verify(publicKey, signature, data) {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  const key = await subtle().importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
  return subtle().verify({ name: 'Ed25519' }, key, signature, data);
}

export async function publicKeyFromSeed(seed) {
  const jwk = await subtle().exportKey('jwk', await privateKey(seed, true));
  const binary = atob(jwk.x.replace(/-/g, '+').replace(/_/g, '/') + '=');
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
