import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromBase64, toHex } from '../lib/bytes.js';
import { keyId, parseNote, signNote, verifierKey, verifyNote } from '../lib/signed-note.js';
import { testKey } from './helpers/keys.js';

test('key id and verifier key match the c2sp.org/signed-note example', async () => {
  const vkey = 'example.com/foo+530d903a+AekyeRrm56hApGFkyQR4ZCbV54Id2LKaANYcrnKv3U2k';
  const publicRaw = fromBase64('AekyeRrm56hApGFkyQR4ZCbV54Id2LKaANYcrnKv3U2k').slice(1);
  assert.equal(toHex(await keyId('example.com/foo', publicRaw)), '530d903a');
  assert.equal(await verifierKey('example.com/foo', publicRaw), vkey);
});

test('sign then verify a note', async () => {
  const key = await testKey(3);
  const note = await signNote('example.org/log\n5\nAAAA\n', 'example.org/log', key);
  assert.match(note, /^example\.org\/log\n5\nAAAA\n\n— example\.org\/log [A-Za-z0-9+/]+=*\n$/);
  const result = await verifyNote(note, 'example.org/log', key.publicRaw);
  assert.equal(result.valid, true);
  assert.equal(result.text, 'example.org/log\n5\nAAAA\n');
});

test('an altered note, a wrong key or a wrong name does not verify', async () => {
  const key = await testKey(3);
  const other = await testKey(4);
  const note = await signNote('example.org/log\n5\nAAAA\n', 'example.org/log', key);
  assert.equal((await verifyNote(note.replace('\n5\n', '\n6\n'), 'example.org/log', key.publicRaw)).valid, false);
  assert.match((await verifyNote(note, 'example.org/log', other.publicRaw)).reason, /no signature/);
  assert.match((await verifyNote(note, 'example.org/other', key.publicRaw)).reason, /no signature/);
});

test('signatures from unknown keys are ignored', async () => {
  const key = await testKey(3);
  const other = await testKey(4);
  const note = await signNote('example.org/log\n5\nAAAA\n', 'example.org/log', key);
  const cosigned = note + (await signNote('example.org/log\n5\nAAAA\n', 'witness.example', other)).split('\n\n')[1];
  assert.equal(parseNote(cosigned).signatures.length, 2);
  assert.equal((await verifyNote(cosigned, 'example.org/log', key.publicRaw)).valid, true);
});

test('malformed notes are rejected', () => {
  assert.throws(() => parseNote('no blank line\n— a AAAAAAAA\n'.replace('\n—', '—')), /blank line|malformed/);
  assert.throws(() => parseNote('text\n\n- name AAAAAAAAAAAA\n'), /malformed signature line/);
  assert.throws(() => parseNote('text\n\n— name AAAAAAAAAAA\n'), /base64/);
  assert.throws(() => parseNote('text\n\n— name AAAAAAAA'), /newline/);
});
