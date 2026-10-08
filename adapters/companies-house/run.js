// Command line entry for a node round. Called by the node workflow (node-template/).
// Reads the API key from CH_API_KEY and never prints it.

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createProfileFetcher } from './fetch.js';
import { runRound } from './round.js';

const { values } = parseArgs({
  options: {
    'config-dir': { type: 'string' },
    'data-dir': { type: 'string' },
    'log-dir': { type: 'string' },
    'node-id': { type: 'string' },
    'protocol-tag': { type: 'string' },
    'protocol-commit': { type: 'string' },
  },
});

for (const name of ['config-dir', 'data-dir', 'log-dir', 'node-id', 'protocol-tag', 'protocol-commit']) {
  if (!values[name]) {
    console.error(`missing --${name}`);
    process.exit(1);
  }
}
const apiKey = process.env.CH_API_KEY;
if (!apiKey) {
  console.error('CH_API_KEY is not set');
  process.exit(1);
}

const readJson = async (name) => JSON.parse(await readFile(join(values['config-dir'], name), 'utf8'));

try {
  const { roundId, path, record } = await runRound({
    watchlist: await readJson('watchlist.json'),
    adaptersConfig: await readJson('adapters.json'),
    fetchProfile: createProfileFetcher({ apiKey }),
    dataDir: values['data-dir'],
    logDir: values['log-dir'],
    nodeId: values['node-id'],
    protocolTag: values['protocol-tag'],
    protocolCommit: values['protocol-commit'],
  });
  for (const e of record.errors) console.error(`${e.record_id}: ${e.error}`);
  console.log(`round ${roundId}: ${record.entries.length} records, ${record.errors.length} errors, written to ${path}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `round_id=${roundId}\nerrors=${record.errors.length}\n`);
  }
} catch (err) {
  console.error(`round failed: ${err.message}`);
  process.exit(1);
}
