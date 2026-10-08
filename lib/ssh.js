// OpenSSH Ed25519 key formats: public key lines and unencrypted private key files.
// Error messages never include key material.

import { Reader, concat, equal, fromBase64, sshString, toBase64, utf8 } from './bytes.js';
import { publicKeyFromSeed } from './ed25519.js';
import { sha256 } from './hash.js';

const KEY_TYPE = 'ssh-ed25519';

export function publicKeyBlob(raw) {
  return concat(sshString(utf8(KEY_TYPE)), sshString(raw));
}

export function parsePublicKeyBlob(blob) {
  const r = new Reader(blob);
  if (r.text() !== KEY_TYPE) throw new Error('not an ssh-ed25519 key');
  const raw = r.string();
  r.done();
  if (raw.length !== 32) throw new Error('Ed25519 public key must be 32 bytes');
  return new Uint8Array(raw);
}

// "ssh-ed25519 AAAA... [comment]" to the 32-byte public key.
export function parsePublicKey(line) {
  const parts = String(line).trim().split(/\s+/);
  if (parts[0] !== KEY_TYPE || parts.length < 2) throw new Error('not an ssh-ed25519 public key line');
  return parsePublicKeyBlob(fromBase64(parts[1]));
}

// The key line without its comment, as used in signer lists.
export function formatPublicKey(raw) {
  return `${KEY_TYPE} ${toBase64(publicKeyBlob(raw))}`;
}

export async function fingerprint(raw) {
  return 'SHA256:' + toBase64(await sha256(publicKeyBlob(raw))).replace(/=+$/, '');
}

// An unencrypted OpenSSH private key file ("openssh-key-v1") to { seed, publicRaw }.
export async function parsePrivateKey(text) {
  const match = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)-----END OPENSSH PRIVATE KEY-----/.exec(String(text));
  if (!match) throw new Error('not an OpenSSH private key file');
  let bytes;
  try {
    bytes = fromBase64(match[1].replace(/\s+/g, ''));
  } catch {
    throw new Error('OpenSSH private key is not valid base64');
  }
  const magic = utf8('openssh-key-v1\0');
  if (!equal(bytes.subarray(0, magic.length), magic)) throw new Error('not an openssh-key-v1 file');
  const r = new Reader(bytes.subarray(magic.length));
  const cipher = r.text();
  const kdf = r.text();
  r.string(); // kdf options
  if (cipher !== 'none' || kdf !== 'none') {
    throw new Error('encrypted private keys are not supported; the node key must have no passphrase');
  }
  if (r.u32() !== 1) throw new Error('expected exactly one key in the file');
  const publicRaw = parsePublicKeyBlob(r.string());
  const p = new Reader(r.string());
  r.done();
  if (p.u32() !== p.u32()) throw new Error('private key check bytes do not match');
  if (p.text() !== KEY_TYPE) throw new Error('not an ssh-ed25519 private key');
  if (!equal(p.string(), publicRaw)) throw new Error('private key section does not match its public key');
  const secret = p.string();
  if (secret.length !== 64 || !equal(secret.subarray(32), publicRaw)) throw new Error('malformed Ed25519 private key');
  const seed = new Uint8Array(secret.subarray(0, 32));
  p.string(); // comment
  const padding = p.take(p.bytes.length - p.offset);
  padding.forEach((b, i) => {
    if (b !== i + 1) throw new Error('malformed private key padding');
  });
  if (!equal(await publicKeyFromSeed(seed), publicRaw)) throw new Error('private key does not match its public key');
  return { seed, publicRaw };
}
