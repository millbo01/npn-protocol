// Command line entry for a node round, called by the node workflow (node-template/).
// Reads the Companies House key from CH_API_KEY and the node signing key from --key-file.
// Never prints either.

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createProfileFetcher } from '../adapters/companies-house/fetch.js';
import { fingerprint, parsePrivateKey } from '../lib/ssh.js';
import { runNodeRound } from './round.js';

const REQUIRED = ['config-dir', 'signers', 'data-dir', 'log-dir', 'node-id', 'protocol-tag', 'protocol-commit', 'key-file'];
const { values } = parseArgs({ options: Object.fromEntries(REQUIRED.map((n) => [n, { type: 'string' }])) });
for (const name of REQUIRED) {
  if (!values[name]) {
    console.error(`missing --${name}`);
    process.exit(1);
  }
}
if (!process.env.CH_API_KEY) {
  console.error('CH_API_KEY is not set');
  process.exit(1);
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

try {
  const signingKey = await parsePrivateKey(await readFile(values['key-file'], 'utf8'));
  console.log(`signing key ${await fingerprint(signingKey.publicRaw)}`);
  const { sequence, size, path, manifest } = await runNodeRound({
    watchlist: await readJson(join(values['config-dir'], 'watchlist.json')),
    adaptersConfig: await readJson(join(values['config-dir'], 'adapters.json')),
    signerList: await readJson(values.signers),
    fetchers: { 'companies-house': createProfileFetcher({ apiKey: process.env.CH_API_KEY }) },
    dataDir: values['data-dir'],
    logDir: values['log-dir'],
    nodeId: values['node-id'],
    protocolTag: values['protocol-tag'],
    protocolCommit: values['protocol-commit'],
    signingKey,
  });
  for (const e of manifest.errors) console.error(`${e.record_id}: ${e.error}`);
  console.log(`manifest ${sequence} (${path}): ${manifest.entries.length} records, ${manifest.errors.length} errors; checkpoint size ${size}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `sequence=${sequence}\nerrors=${manifest.errors.length}\n`);
  }
} catch (err) {
  console.error(`round failed: ${err.message}`);
  process.exit(1);
}
