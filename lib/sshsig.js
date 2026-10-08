// SSH signatures (OpenSSH PROTOCOL.sshsig), Ed25519 only.
// sign() produces the same bytes as `ssh-keygen -Y sign` with the same key, namespace and
// message (Ed25519 is deterministic; ssh-keygen hashes with SHA-512 and wraps base64 at 70).
// verify() accepts SHA-256 and SHA-512 signatures, as the format allows.

import { Reader, concat, fromBase64, sshString, toBase64, uint32, utf8 } from './bytes.js';
import * as ed25519 from './ed25519.js';
import { sha256, sha512 } from './hash.js';
import { parsePublicKeyBlob, publicKeyBlob } from './ssh.js';

const MAGIC = utf8('SSHSIG');
const VERSION = 1;
const BEGIN = '-----BEGIN SSH SIGNATURE-----';
const END = '-----END SSH SIGNATURE-----';
const EMPTY = new Uint8Array();

async function digest(hashAlg, message) {
  if (hashAlg === 'sha512') return sha512(message);
  if (hashAlg === 'sha256') return sha256(message);
  throw new Error(`unsupported hash algorithm ${hashAlg}`);
}

// The bytes the Ed25519 signature covers.
export async function signedData(namespace, hashAlg, message) {
  return concat(
    MAGIC,
    sshString(utf8(namespace)),
    sshString(EMPTY),
    sshString(utf8(hashAlg)),
    sshString(await digest(hashAlg, message)),
  );
}

export async function sign(key, message, namespace) {
  if (!namespace) throw new Error('a namespace is required');
  const signature = await ed25519.sign(key.seed, await signedData(namespace, 'sha512', message));
  const blob = concat(
    MAGIC,
    uint32(VERSION),
    sshString(publicKeyBlob(key.publicRaw)),
    sshString(utf8(namespace)),
    sshString(EMPTY),
    sshString(utf8('sha512')),
    sshString(concat(sshString(utf8('ssh-ed25519')), sshString(signature))),
  );
  const lines = toBase64(blob).match(/.{1,70}/g);
  return `${BEGIN}\n${lines.join('\n')}\n${END}\n`;
}

export function parse(armored) {
  const text = String(armored).trim();
  if (!text.startsWith(BEGIN) || !text.endsWith(END)) throw new Error('not an armored SSH signature');
  const blob = fromBase64(text.slice(BEGIN.length, text.length - END.length).replace(/\s+/g, ''));
  const r = new Reader(blob);
  if (r.take(6).some((b, i) => b !== MAGIC[i])) throw new Error('not an SSHSIG blob');
  if (r.u32() !== VERSION) throw new Error('unsupported SSHSIG version');
  const publicRaw = parsePublicKeyBlob(r.string());
  const namespace = r.text();
  r.string(); // reserved
  const hashAlg = r.text();
  const s = new Reader(r.string());
  r.done();
  if (s.text() !== 'ssh-ed25519') throw new Error('not an Ed25519 signature');
  const signature = new Uint8Array(s.string());
  s.done();
  if (signature.length !== 64) throw new Error('Ed25519 signature must be 64 bytes');
  return { publicRaw, namespace, hashAlg, signature };
}

// { valid, publicRaw, reason }. Checks the signature only; whether the key is allowed is the caller's question.
export async function verify(armored, message, namespace) {
  let parsed;
  try {
    parsed = parse(armored);
  } catch (err) {
    return { valid: false, reason: `unreadable signature: ${err.message}` };
  }
  if (parsed.namespace !== namespace) {
    return { valid: false, publicRaw: parsed.publicRaw, reason: `signature namespace is ${parsed.namespace}, expected ${namespace}` };
  }
  let data;
  try {
    data = await signedData(namespace, parsed.hashAlg, message);
  } catch (err) {
    return { valid: false, publicRaw: parsed.publicRaw, reason: err.message };
  }
  const ok = await ed25519.verify(parsed.publicRaw, parsed.signature, data);
  return ok
    ? { valid: true, publicRaw: parsed.publicRaw }
    : { valid: false, publicRaw: parsed.publicRaw, reason: 'signature does not match the signed bytes' };
}
