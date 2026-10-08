import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { equal } from '../lib/bytes.js';
import { sha256Hex } from '../lib/hash.js';
import { treeRoot } from '../lib/merkle.js';
import { tileSource } from '../lib/tiles.js';
import { verifyCheckpoint, verifyLogConsistency, verifyManifest, verifyManifestInclusion } from '../lib/verify.js';
import { runNodeRound } from '../runner/round.js';
import { testKey, testNode } from './helpers/keys.js';

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

async function setup() {
  const key = await testKey(5);
  const signerList = { nodes: [testNode('npn-node-test', key)] };
  const root = await mkdtemp(join(tmpdir(), 'npn-round-'));
  return { key, signerList, root, dataDir: join(root, 'data'), logDir: join(root, 'log') };
}

function round(ctx, at, overrides = {}) {
  return runNodeRound({
    watchlist,
    adaptersConfig,
    signerList: ctx.signerList,
    fetchers: { 'companies-house': fakeFetch },
    dataDir: ctx.dataDir,
    logDir: ctx.logDir,
    nodeId: 'npn-node-test',
    protocolTag: 'v0.0.0-test',
    protocolCommit: '0'.repeat(40),
    signingKey: ctx.key,
    now: () => new Date(at),
    log: { warn() {} },
    ...overrides,
  });
}

async function withNode(fn) {
  const ctx = await setup();
  try {
    await fn(ctx);
  } finally {
    await rm(ctx.root, { recursive: true, force: true });
  }
}

async function allFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(join(entry.parentPath, entry.name));
  }
  return out;
}

const bytesOf = async (path) => new Uint8Array(await readFile(path));
const textOf = (path) => readFile(path, 'utf8');

test('two rounds on unchanged data: same hashes, unchanged data, two signed manifests in a consistent log', async () => {
  await withNode(async (ctx) => {
    await round(ctx, '2026-10-08T06:17:00Z');
    const dataPath = join(ctx.dataDir, 'companies-house', 'company-profile', 'ZZ000001.json');
    const dataAfterFirst = await bytesOf(dataPath);
    const firstCheckpoint = await textOf(join(ctx.logDir, 'checkpoint'));
    await round(ctx, '2026-10-09T06:17:00Z');
    assert.deepEqual(await bytesOf(dataPath), dataAfterFirst);

    const m0 = await bytesOf(join(ctx.logDir, 'manifests', '000000.json'));
    const m1 = await bytesOf(join(ctx.logDir, 'manifests', '000001.json'));
    const p0 = JSON.parse(new TextDecoder().decode(m0));
    const p1 = JSON.parse(new TextDecoder().decode(m1));
    assert.equal(p0.sequence, 0);
    assert.equal(p0.previous_manifest_hash, null);
    assert.equal(p1.previous_manifest_hash, await sha256Hex(m0));
    assert.equal(p1.entries[0].canonical_hash, p0.entries[0].canonical_hash);
    assert.equal(p1.entries[0].raw_hash, p0.entries[0].raw_hash);
    assert.equal(p0.entries[0].first_seq, 0);
    assert.equal(p1.entries[0].first_seq, 0, 'first_seq points at the first entry for the same key');
    assert.equal(p1.entries[0].canonical_hash, await sha256Hex(dataAfterFirst));
    assert.deepEqual(p1.peer_checkpoints, []);
    assert.deepEqual(p1.errors, [{ record_id: 'company-profile/ZZ000002', error: 'HTTP 404' }]);

    for (const [bytes, seq] of [[m0, 0], [m1, 1]]) {
      const signature = await textOf(join(ctx.logDir, 'manifests', `00000${seq}.json.sig`));
      const r = await verifyManifest({ manifestBytes: bytes, signature, signerList: ctx.signerList });
      assert.equal(r.valid, true, r.reason);
    }

    const latest = await verifyCheckpoint({ note: await textOf(join(ctx.logDir, 'checkpoint')), signerList: ctx.signerList, nodeId: 'npn-node-test' });
    const older = await verifyCheckpoint({ note: firstCheckpoint, signerList: ctx.signerList, nodeId: 'npn-node-test' });
    assert.equal(latest.valid && older.valid, true);
    assert.equal(latest.size, 2);
    const source = tileSource(2, async (p) => bytesOf(join(ctx.logDir, p)));
    assert.ok(equal(await treeRoot(source, 2), latest.root));
    assert.equal((await verifyLogConsistency({ older, newer: latest, source })).valid, true);
    assert.equal((await verifyManifestInclusion({ manifestHashHex: await sha256Hex(m0), sequence: 0, checkpoint: latest, source })).valid, true);
    assert.equal(await textOf(join(ctx.logDir, 'checkpoints', '1')), firstCheckpoint);
  });
});

test('log files are add-only: a second round changes nothing it wrote before, except the latest checkpoint', async () => {
  await withNode(async (ctx) => {
    await round(ctx, '2026-10-08T06:17:00Z');
    const before = new Map();
    for (const f of await allFiles(ctx.logDir)) before.set(f, await bytesOf(f));
    await round(ctx, '2026-10-09T06:17:00Z');
    for (const [f, bytes] of before) {
      const name = f.slice(ctx.logDir.length + 1).replace(/\\/g, '/');
      if (name === 'checkpoint' || name === 'checkpoint.sshsig') continue;
      assert.deepEqual(await bytesOf(f), bytes, `${name} changed`);
    }
  });
});

test('no raw response and no full registered office address in any file', async () => {
  await withNode(async (ctx) => {
    await round(ctx, '2026-10-08T06:17:00Z');
    const files = [...(await allFiles(ctx.dataDir)), ...(await allFiles(ctx.logDir))];
    for (const file of files) {
      const text = (await readFile(file)).toString('latin1');
      for (const part of FULL_ADDRESS_PARTS) assert.ok(!text.includes(part), `${file} contains ${part}`);
      assert.ok(!text.includes('"links"'), `${file} contains raw response fields`);
    }
  });
});

test('a signing key that is not the listed key stops the round before anything is fetched or written', async () => {
  await withNode(async (ctx) => {
    let fetched = false;
    const spy = async (id) => {
      fetched = true;
      return fakeFetch(id);
    };
    await assert.rejects(
      round(ctx, '2026-10-08T06:17:00Z', { signingKey: await testKey(6), fetchers: { 'companies-house': spy } }),
      /not node npn-node-test's listed key/,
    );
    assert.equal(fetched, false);
    await assert.rejects(stat(ctx.logDir), { code: 'ENOENT' });
  });
});

test('a tampered earlier manifest stops the next round', async () => {
  await withNode(async (ctx) => {
    await round(ctx, '2026-10-08T06:17:00Z');
    const path = join(ctx.logDir, 'manifests', '000000.json');
    const text = await textOf(path);
    await writeFile(path, text.replace('"watchlist_version":1', '"watchlist_version":2'));
    await assert.rejects(round(ctx, '2026-10-09T06:17:00Z'), /does not extend the previous checkpoint/);
  });
});

test('a pin that does not match the code stops the round', async () => {
  await withNode(async (ctx) => {
    await assert.rejects(
      round(ctx, '2026-10-08T06:17:00Z', { adaptersConfig: { ...adaptersConfig, adapters: { 'companies-house': 2 } } }),
      /pins companies-house at 2/,
    );
    await assert.rejects(round(ctx, '2026-10-08T06:17:00Z', { protocolTag: 'v9.9.9' }), /pins tag/);
  });
});

test('a rate-limit abort stops the round and writes no log', async () => {
  await withNode(async (ctx) => {
    const abort = async () => {
      const err = new Error('rate limited');
      err.name = 'AbortRound';
      throw err;
    };
    await assert.rejects(round(ctx, '2026-10-08T06:17:00Z', { fetchers: { 'companies-house': abort } }), /rate limited/);
    await assert.rejects(stat(ctx.logDir), { code: 'ENOENT' });
  });
});

test('a watchlist id that is not a company number stops the round', async () => {
  await withNode(async (ctx) => {
    const bad = { version: 1, entries: [{ source: 'companies-house', type: 'company-profile', id: '123' }] };
    await assert.rejects(round(ctx, '2026-10-08T06:17:00Z', { watchlist: bad }), /8-character/);
  });
});
