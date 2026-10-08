// SHA-256 and SHA-512 through WebCrypto, so the same file runs in Node and in the browser.

const toBytes = (input) => (typeof input === 'string' ? new TextEncoder().encode(input) : input);

export async function sha256(input) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', toBytes(input)));
}

export async function sha512(input) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-512', toBytes(input)));
}

export async function sha256Hex(input) {
  return Array.from(await sha256(input), (b) => b.toString(16).padStart(2, '0')).join('');
}
