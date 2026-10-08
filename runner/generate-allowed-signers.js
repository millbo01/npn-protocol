// Regenerates signers/<list>.allowed_signers from signers/<list>.json, the canonical file.
//   node runner/generate-allowed-signers.js [list name, default genesis] [--check]
// --check writes nothing and exits 1 if the file is out of date.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { generateAllowedSigners } from '../lib/signers.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { check: { type: 'boolean' } } });
const name = positionals[0] ?? 'genesis';
const dir = new URL('../signers/', import.meta.url);
const list = JSON.parse(await readFile(new URL(`${name}.json`, dir), 'utf8'));
const generated = generateAllowedSigners(list, name);
const target = new URL(`${name}.allowed_signers`, dir);

if (values.check) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== generated) {
    console.error(`signers/${name}.allowed_signers is out of date; run node runner/generate-allowed-signers.js ${name}`);
    process.exit(1);
  }
  console.log(`signers/${name}.allowed_signers matches signers/${name}.json`);
} else {
  await writeFile(target, generated);
  console.log(`wrote signers/${name}.allowed_signers`);
}
