// C2SP checkpoints (c2sp.org/tlog-checkpoint): origin, tree size, root hash, as a signed note.

import { fromBase64, toBase64 } from './bytes.js';
import { signNote } from './signed-note.js';

export function checkpointText(origin, size, root) {
  if (!origin || /[\s]/.test(origin)) throw new Error('origin must be non-empty with no spaces');
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('tree size must be a non-negative integer');
  if (root.length !== 32) throw new Error('root hash must be 32 bytes');
  return `${origin}\n${size}\n${toBase64(root)}\n`;
}

export function parseCheckpointText(text) {
  const lines = text.split('\n');
  if (lines.pop() !== '' || lines.length < 3) throw new Error('checkpoint needs origin, size and root lines');
  const [origin, sizeText, rootText, ...extensions] = lines;
  if (!origin) throw new Error('checkpoint origin is empty');
  if (!/^(0|[1-9][0-9]*)$/.test(sizeText)) throw new Error('checkpoint size is not a decimal integer');
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size)) throw new Error('checkpoint size is too large');
  const root = fromBase64(rootText);
  if (root.length !== 32) throw new Error('checkpoint root is not 32 bytes');
  if (extensions.some((l) => l === '')) throw new Error('checkpoint extension lines must be non-empty');
  return { origin, size, root, extensions };
}

// The log signs with its origin as the key name, as c2sp.org/tlog-checkpoint recommends.
export async function signCheckpoint(origin, size, root, key) {
  const text = checkpointText(origin, size, root);
  return { text, note: await signNote(text, origin, key) };
}
