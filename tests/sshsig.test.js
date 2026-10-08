// SSH signatures: our implementation against stock OpenSSH (ssh-keygen), in both directions.
// CI runs on Ubuntu with OpenSSH installed; these tests fail there, rather than skip, if it is missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { utf8 } from '../lib/bytes.js';
import { formatPublicKey, parsePrivateKey, parsePublicKey } from '../lib/ssh.js';
import * as sshsig from '../lib/sshsig.js';
import { testKey } from './helpers/keys.js';

const haveSshKeygen = spawnSync('ssh-keygen', ['-V']).error === undefined || spawnSync('ssh', ['-V']).status === 0;
const opensshTest = (name, fn) => test(name, { skip: !haveSshKeygen && !process.env.CI && 'ssh-keygen not installed' }, fn);

function run(args, input, cwd) {
  const r = spawnSync('ssh-keygen', args, { input, cwd });
  return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr) };
}

async function withTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'npn-sshsig-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('sign then verify, and the checks that must fail', async () => {
  const key = await testKey(7);
  const message = utf8('manifest bytes\n');
  const sig = await sshsig.sign(key, message, 'npn-manifest');
  assert.equal((await sshsig.verify(sig, message, 'npn-manifest')).valid, true);
  assert.equal((await sshsig.verify(sig, utf8('manifest bytes!'), 'npn-manifest')).valid, false);
  assert.match((await sshsig.verify(sig, message, 'npn-checkpoint')).reason, /namespace/);
  assert.equal((await sshsig.verify('not a signature', message, 'npn-manifest')).valid, false);
});

opensshTest('our signature is byte-identical to ssh-keygen -Y sign, and each verifies the other', async () => {
  await withTemp(async (dir) => {
    assert.equal(run(['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', join(dir, 'k')]).status, 0);
    const key = await parsePrivateKey(await readFile(join(dir, 'k'), 'utf8'));
    assert.deepEqual(key.publicRaw, parsePublicKey(await readFile(join(dir, 'k.pub'), 'utf8')));

    const message = utf8('{"record_type":"manifest","sequence":0}');
    await writeFile(join(dir, 'm'), message);
    const signed = run(['-q', '-Y', 'sign', '-f', join(dir, 'k'), '-n', 'npn-manifest', join(dir, 'm')]);
    assert.equal(signed.status, 0, signed.stderr);
    const theirs = await readFile(join(dir, 'm.sig'), 'utf8');
    const ours = await sshsig.sign(key, message, 'npn-manifest');
    assert.equal(ours, theirs);

    assert.equal((await sshsig.verify(theirs, message, 'npn-manifest')).valid, true);
    await writeFile(join(dir, 'ours.sig'), ours);
    await writeFile(join(dir, 'allowed'), `npn-node-test namespaces="npn-manifest" ${formatPublicKey(key.publicRaw)}\n`);
    const verified = run(['-Y', 'verify', '-f', join(dir, 'allowed'), '-I', 'npn-node-test', '-n', 'npn-manifest', '-s', join(dir, 'ours.sig')], message);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout + verified.stderr, /Good "npn-manifest" signature for npn-node-test/);

    const tampered = run(['-Y', 'verify', '-f', join(dir, 'allowed'), '-I', 'npn-node-test', '-n', 'npn-manifest', '-s', join(dir, 'ours.sig')], utf8('{"record_type":"manifest","sequence":1}'));
    assert.notEqual(tampered.status, 0);
  });
});

opensshTest('an encrypted private key is refused without revealing anything', async () => {
  await withTemp(async (dir) => {
    assert.equal(run(['-q', '-t', 'ed25519', '-N', 'a passphrase', '-f', join(dir, 'k')]).status, 0);
    await assert.rejects(parsePrivateKey(await readFile(join(dir, 'k'), 'utf8')), /encrypted private keys are not supported/);
  });
});

test('a public key line round-trips without its comment', async () => {
  const key = await testKey(9);
  assert.deepEqual(parsePublicKey(`${key.line} some comment`), key.publicRaw);
  assert.equal(formatPublicKey(parsePublicKey(`${key.line} x`)), key.line);
  assert.throws(() => parsePublicKey('ssh-rsa AAAA'), /not an ssh-ed25519/);
});
