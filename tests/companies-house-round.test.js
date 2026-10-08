import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalise } from '../lib/canonicalise.js';
import { sha256Hex } from '../lib/hash.js';
import { runRound } from '../adapters/companies-house/round.js';

// Synthetic fixture: an invented company and address, never a real response.
const fixtureBytes = readFileSync(new URL('./fixtures/companies-house/profile-synthetic.json', import.meta.url));
const FULL_ADDRESS_PARTS = ['Fictional House 7', '1 Invented Lane', 'Unreal Quarter', 'Testshire', 'ZX1 2YW', '2 Pretend Road'];

const watchlist = {
  version: 1,
  entries: [
    { source: 'companies-house', type: 'company-profile', id: 'ZZ000001' },
    { source: 'companies-house', type: 'company-profile', id: 'ZZ000002' },
  ],
};
const adaptersConfig = { version: 1, protocol_tag: 'v0.0.0-test', adapters: { 'companies-house': 1 } };

async function fakeFetch(id) {
  if (id === 'ZZ000001') return { status: 200, bytes: new Uint8Array(fixtureBytes), retrievedAt: new Date('2026-10-08T06:17:05Z') };
  return { status: 404, bytes: new Uint8Array(), retrievedAt: new Date('2026-10-08T06:17:06Z') };
}

async function withDirs(fn) {
  const root = await mkdtemp(join(tmpdir(), 'npn-round-'));
  try {
    await fn({ dataDir: join(root, 'data'), logDir: join(root, 'log') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const silent = { warn() {} };

function round(dirs, at, overrides = {}) {
  return runRound({
    watchlist,
    adaptersConfig,
    fetchProfile: fakeFetch,
    nodeId: 'npn-node-test',
    protocolTag: 'v0.0.0-test',
    protocolCommit: '0000000000000000000000000000000000000000',
    now: () => new Date(at),
    log: silent,
    ...dirs,
    ...overrides,
  });
}

async function allFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(join(entry.parentPath, entry.name));
  }
  return out;
}

test('two runs on unchanged data: same hashes, unchanged data file, one round record each', async () => {
  await withDirs(async (dirs) => {
    const first = await round(dirs, '2026-10-08T06:17:00Z');
    const dataPath = join(dirs.dataDir, 'companies-house', 'company-profile', 'ZZ000001.json');
    const dataAfterFirst = await readFile(dataPath);
    const second = await round(dirs, '2026-10-09T06:17:00Z');
    const dataAfterSecond = await readFile(dataPath);

    assert.deepEqual(dataAfterSecond, dataAfterFirst);
    assert.equal(first.record.entries[0].canonical_hash, second.record.entries[0].canonical_hash);
    assert.equal(first.record.entries[0].raw_hash, second.record.entries[0].raw_hash);
    assert.equal(await sha256Hex(dataAfterFirst), first.record.entries[0].canonical_hash);

    const rounds = await readdir(join(dirs.logDir, 'rounds'));
    assert.deepEqual(rounds.sort(), ['20261008T061700Z.json', '20261009T061700Z.json']);
  });
});

test('round record lists the required fields and is itself canonical', async () => {
  await withDirs(async (dirs) => {
    const { path, record } = await round(dirs, '2026-10-08T06:17:00Z');
    const text = await readFile(path, 'utf8');
    assert.equal(canonicalise(JSON.parse(text)), text);
    assert.equal(record.watchlist_version, 1);
    assert.equal(record.adapters_config_version, 1);
    assert.equal(record.protocol_tag, 'v0.0.0-test');
    assert.equal(record.protocol_commit, '0000000000000000000000000000000000000000');
    assert.deepEqual(Object.keys(record.entries[0]).sort(), [
      'adapter_version', 'canonical_hash', 'raw_hash', 'record_id', 'retrieved_at', 'source', 'version_key',
    ]);
    assert.equal(record.entries[0].record_id, 'company-profile/ZZ000001');
    assert.equal(record.entries[0].version_key, '0123456789abcdef0123456789abcdef01234567');
    assert.equal(record.entries[0].retrieved_at, '2026-10-08T06:17:05Z');
    assert.deepEqual(record.errors, [{ record_id: 'company-profile/ZZ000002', error: 'HTTP 404' }]);
  });
});

test('no raw response and no full registered office address in any output file', async () => {
  await withDirs(async (dirs) => {
    await round(dirs, '2026-10-08T06:17:00Z');
    const files = [...(await allFiles(dirs.dataDir)), ...(await allFiles(dirs.logDir))];
    assert.ok(files.length >= 2);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const part of FULL_ADDRESS_PARTS) assert.ok(!text.includes(part), `${file} contains ${part}`);
      assert.ok(!text.includes('"links"'), `${file} contains raw response fields`);
    }
  });
});

test('a pin that does not match the code stops the round', async () => {
  await withDirs(async (dirs) => {
    await assert.rejects(
      round(dirs, '2026-10-08T06:17:00Z', { adaptersConfig: { ...adaptersConfig, adapters: { 'companies-house': 2 } } }),
      /pins companies-house at 2/,
    );
    await assert.rejects(round(dirs, '2026-10-08T06:17:00Z', { protocolTag: 'v9.9.9' }), /pins tag/);
  });
});

test('a rate-limit abort stops the round and writes nothing', async () => {
  await withDirs(async (dirs) => {
    const abort = async () => {
      const err = new Error('rate limited');
      err.name = 'AbortRound';
      throw err;
    };
    await assert.rejects(round(dirs, '2026-10-08T06:17:00Z', { fetchProfile: abort }), /rate limited/);
    await assert.rejects(readdir(dirs.logDir), { code: 'ENOENT' });
  });
});

test('a watchlist id that is not a company number stops the round', async () => {
  await withDirs(async (dirs) => {
    const bad = { version: 1, entries: [{ source: 'companies-house', type: 'company-profile', id: '123' }] };
    await assert.rejects(round(dirs, '2026-10-08T06:17:00Z', { watchlist: bad }), /8-character/);
  });
});
