// Byte helpers shared by the signing, log and verification code.
// No imports, so the same file runs in Node and in the browser.

export function utf8(text) {
  return new TextEncoder().encode(text);
}

export function fromUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function concat(...parts) {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function equal(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
  if (!/^([0-9a-f]{2})*$/.test(hex)) throw new Error('not lowercase hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Standard base64 with padding. Rejects anything that does not re-encode to the same text,
// as C2SP signed notes and checkpoints require.
export function fromBase64(text) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new Error('not canonical base64');
  }
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  if (toBase64(out) !== text) throw new Error('not canonical base64');
  return out;
}

export function uint16(n) {
  return Uint8Array.of((n >>> 8) & 0xff, n & 0xff);
}

export function uint32(n) {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

// SSH wire format string: uint32 length, then the bytes (RFC 4251 section 5).
export function sshString(bytes) {
  return concat(uint32(bytes.length), bytes);
}

// Reads SSH wire format fields. Every read is bounds-checked.
export class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  take(n) {
    if (n < 0 || this.offset + n > this.bytes.length) throw new Error('truncated data');
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  u32() {
    const b = this.take(4);
    return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }

  string() {
    return this.take(this.u32());
  }

  text() {
    return fromUtf8(this.string());
  }

  done() {
    if (this.offset !== this.bytes.length) throw new Error('unexpected trailing data');
  }
}
