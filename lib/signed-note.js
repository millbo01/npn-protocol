// C2SP signed notes (c2sp.org/signed-note), Ed25519 signature type only.
// Signature lines start with U+2014 because the format requires it; the no-em-dash rule
// for prose does not apply to this wire format.

import { concat, equal, fromBase64, toBase64, toHex, utf8 } from './bytes.js';
import * as ed25519 from './ed25519.js';
import { sha256 } from './hash.js';

const DASH = '—';
const ED25519_TYPE = 0x01;
const MAX_SIGNATURES = 100;

function checkName(name) {
  if (typeof name !== 'string' || name === '' || /[\s+]/u.test(name)) {
    throw new Error('key name must be non-empty with no spaces or plus signs');
  }
}

function checkText(text) {
  if (typeof text !== 'string' || text === '' || !text.endsWith('\n')) throw new Error('note text must end with a newline');
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) throw new Error('note text contains a control character');
}

export async function keyId(name, publicRaw) {
  return (await sha256(concat(utf8(name), Uint8Array.of(0x0a, ED25519_TYPE), publicRaw))).slice(0, 4);
}

// Verifier key string: <name>+<hex key id>+<base64(type || public key)>.
export async function verifierKey(name, publicRaw) {
  checkName(name);
  return `${name}+${toHex(await keyId(name, publicRaw))}+${toBase64(concat(Uint8Array.of(ED25519_TYPE), publicRaw))}`;
}

export async function signNote(text, name, key) {
  checkText(text);
  checkName(name);
  const signature = await ed25519.sign(key.seed, utf8(text));
  return `${text}\n${DASH} ${name} ${toBase64(concat(await keyId(name, key.publicRaw), signature))}\n`;
}

export function parseNote(note) {
  if (typeof note !== 'string' || !note.endsWith('\n')) throw new Error('note must end with a newline');
  const split = note.lastIndexOf('\n\n');
  if (split < 0) throw new Error('note has no blank line before its signatures');
  const text = note.slice(0, split + 1);
  checkText(text);
  const lines = note.slice(split + 2, -1).split('\n');
  if (lines.length > MAX_SIGNATURES) throw new Error('too many signatures');
  const signatures = lines.map((line) => {
    const parts = line.split(' ');
    if (parts.length !== 3 || parts[0] !== DASH) throw new Error('malformed signature line');
    checkName(parts[1]);
    const bytes = fromBase64(parts[2]);
    if (bytes.length < 5) throw new Error('signature too short');
    return { name: parts[1], keyId: bytes.slice(0, 4), signature: bytes.slice(4) };
  });
  return { text, signatures };
}

// { valid, text, reason }. Signatures from other keys are ignored, as the format requires.
export async function verifyNote(note, name, publicRaw) {
  let parsed;
  try {
    parsed = parseNote(note);
  } catch (err) {
    return { valid: false, reason: `unreadable note: ${err.message}` };
  }
  const id = await keyId(name, publicRaw);
  const ours = parsed.signatures.filter((s) => s.name === name && equal(s.keyId, id));
  if (ours.length === 0) return { valid: false, text: parsed.text, reason: `no signature from ${name} with the expected key` };
  for (const s of ours) {
    if (!(await ed25519.verify(publicRaw, s.signature, utf8(parsed.text)))) {
      return { valid: false, text: parsed.text, reason: `signature from ${name} does not verify` };
    }
  }
  return { valid: true, text: parsed.text };
}
