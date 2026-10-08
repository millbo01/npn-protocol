// File access for a node's log directory (log/ on the node's main branch).
// Everything in the log is add-only: a file, once written, never changes. The only
// exceptions are `checkpoint` and `checkpoint.sshsig`, the latest checkpoint, which
// tlog-tiles serves at a fixed path. Every checkpoint is also kept under checkpoints/.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseManifest } from '../lib/manifest.js';

export const MUTABLE = new Set(['checkpoint', 'checkpoint.sshsig']);

export async function readManifests(logDir) {
  let names;
  try {
    names = await readdir(join(logDir, 'manifests'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = names.filter((n) => /^\d{6,}\.json$/.test(n)).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  const out = [];
  for (const [i, name] of files.entries()) {
    const bytes = new Uint8Array(await readFile(join(logDir, 'manifests', name)));
    const manifest = parseManifest(bytes);
    if (manifest.sequence !== i || Number.parseInt(name, 10) !== i) {
      throw new Error(`log is not contiguous: expected manifest ${i}, found ${name}`);
    }
    out.push({ sequence: i, bytes, manifest });
  }
  return out;
}

export async function readOptional(path) {
  try {
    return new Uint8Array(await readFile(path));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Writes a log file that must never change. Rewriting it with identical bytes is a no-op.
export async function writeOnce(logDir, relPath, bytes) {
  if (MUTABLE.has(relPath)) throw new Error(`${relPath} is mutable; use writeMutable`);
  const path = join(logDir, relPath);
  const existing = await readOptional(path);
  if (existing) {
    if (Buffer.from(existing).equals(Buffer.from(bytes))) return false;
    throw new Error(`log file ${relPath} already exists with different content; the log is add-only`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
  return true;
}

export async function writeMutable(logDir, relPath, bytes) {
  if (!MUTABLE.has(relPath)) throw new Error(`${relPath} is not one of the mutable log files`);
  const path = join(logDir, relPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
