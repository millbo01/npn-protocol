import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalBytes } from '../lib/canonicalise.js';
import { sha256Hex } from '../lib/hash.js';
import {
  ALLOWLIST,
  TRANSFORMS,
  postcodeDistrict,
  processProfile,
  runPipeline,
} from '../adapters/companies-house/profile.js';

// Synthetic fixture: an invented company and address, never a real response.
const fixtureText = readFileSync(new URL('./fixtures/companies-house/profile-synthetic.json', import.meta.url), 'utf8');
const fixture = JSON.parse(fixtureText);
const bytes = (text) => new TextEncoder().encode(text);
const NUMBER = 'ZZ000001';
const FULL_ADDRESS_PARTS = ['Fictional House 7', '1 Invented Lane', 'Unreal Quarter', 'Testshire', 'ZX1 2YW', 'ZX12YW'];

test('identical input bytes give identical hashes', async () => {
  const a = await processProfile(bytes(fixtureText), NUMBER);
  const b = await processProfile(bytes(fixtureText), NUMBER);
  assert.equal(a.canonicalHash, b.canonicalHash);
  assert.equal(a.rawHash, b.rawHash);
  assert.deepEqual(a.canonical, b.canonical);
});

test('member order and whitespace change the raw hash but not the canonical hash', async () => {
  const reordered = JSON.stringify(Object.fromEntries(Object.entries(fixture).reverse()));
  const a = await processProfile(bytes(fixtureText), NUMBER);
  const b = await processProfile(bytes(reordered), NUMBER);
  assert.equal(a.canonicalHash, b.canonicalHash);
  assert.notEqual(a.rawHash, b.rawHash);
});

test('a changed field changes the canonical hash', async () => {
  const changed = JSON.stringify({ ...fixture, company_status: 'dissolved' });
  const a = await processProfile(bytes(fixtureText), NUMBER);
  const b = await processProfile(bytes(changed), NUMBER);
  assert.notEqual(a.canonicalHash, b.canonicalHash);
});

test('a changed registered office line changes the canonical hash through the address hash', async () => {
  const address = { ...fixture.registered_office_address, address_line_1: '2 Invented Lane' };
  const a = await processProfile(bytes(fixtureText), NUMBER);
  const b = await processProfile(bytes(JSON.stringify({ ...fixture, registered_office_address: address })), NUMBER);
  assert.notEqual(a.canonicalHash, b.canonicalHash);
});

test('an over-large integer fails loudly', async () => {
  const text = fixtureText.replace('"day": "31"', '"day": 9007199254740993');
  assert.notEqual(text, fixtureText);
  await assert.rejects(processProfile(bytes(text), NUMBER), /2\^53/);
});

test('transforms run in the documented order', () => {
  assert.deepEqual(TRANSFORMS.map((t) => t.id), [
    'decode-utf8',
    'parse-json',
    'hash-registered-office-address',
    'apply-allowlist',
    'reduce-registered-office-address',
    'canonicalise',
  ]);
  for (const t of TRANSFORMS) assert.ok(t.reason.length > 0, `${t.id} has no reason`);
});

test('the address hash is taken from the full source address, before reduction', async () => {
  const expected = await sha256Hex(canonicalBytes(fixture.registered_office_address));
  const result = await processProfile(bytes(fixtureText), NUMBER);
  const record = JSON.parse(new TextDecoder().decode(result.canonical));
  assert.equal(record.registered_office_address_sha256, expected);

  // Reducing before hashing gives a different hash, so the order matters and is enforced.
  const ids = TRANSFORMS.map((t) => t.id);
  const swapped = [...TRANSFORMS];
  const reduce = swapped.splice(ids.indexOf('reduce-registered-office-address'), 1)[0];
  swapped.splice(ids.indexOf('hash-registered-office-address'), 0, reduce);
  const ctx = { source: undefined, unknownFields: [] };
  const wrong = JSON.parse(new TextDecoder().decode(await runPipeline(swapped, bytes(fixtureText), ctx)));
  assert.notEqual(wrong.registered_office_address_sha256, expected);
});

test('the published registered office is locality, postcode district and country only', async () => {
  const result = await processProfile(bytes(fixtureText), NUMBER);
  const record = JSON.parse(new TextDecoder().decode(result.canonical));
  assert.deepEqual(record.registered_office_address, {
    locality: 'Exampletown',
    postcode_district: 'ZX1',
    country: 'England',
  });
  const text = new TextDecoder().decode(result.canonical);
  for (const part of FULL_ADDRESS_PARTS) assert.ok(!text.includes(part), `canonical record contains ${part}`);
});

test('excluded fields are dropped silently; unknown fields are dropped and reported', async () => {
  const withNew = JSON.stringify({
    ...fixture,
    some_new_field: 'x',
    accounts: { ...fixture.accounts, new_accounts_field: 1 },
  });
  const result = await processProfile(bytes(withNew), NUMBER);
  const record = JSON.parse(new TextDecoder().decode(result.canonical));
  for (const key of ['etag', 'links', 'can_file', 'service_address', 'some_new_field']) {
    assert.ok(!(key in record), `${key} was published`);
  }
  assert.ok(!('new_accounts_field' in record.accounts));
  assert.deepEqual(result.unknownFields.sort(), ['$.accounts.new_accounts_field', '$.some_new_field']);
});

test('every published top-level field is on the allowlist', async () => {
  const result = await processProfile(bytes(fixtureText), NUMBER);
  const record = JSON.parse(new TextDecoder().decode(result.canonical));
  for (const key of Object.keys(record)) assert.ok(Object.hasOwn(ALLOWLIST, key), `${key} is not allowlisted`);
});

test('an allowlisted field with an unexpected shape fails loudly', async () => {
  const odd = JSON.stringify({ ...fixture, company_name: { value: 'X' } });
  await assert.rejects(processProfile(bytes(odd), NUMBER), /company_name: expected a primitive/);
});

test('a profile without an etag fails loudly', async () => {
  const { etag, ...rest } = fixture;
  await assert.rejects(processProfile(bytes(JSON.stringify(rest)), NUMBER), /no etag/);
});

test('a profile for a different company fails loudly', async () => {
  await assert.rejects(processProfile(bytes(fixtureText), 'ZZ000002'), /does not match/);
});

test('invalid JSON fails without echoing the response', async () => {
  await assert.rejects(processProfile(bytes('{"company_name": "SECRET'), NUMBER), (err) => {
    assert.equal(err.message, 'response is not valid JSON');
    return true;
  });
});

test('postcode district', () => {
  assert.equal(postcodeDistrict('SW1A 1AA'), 'SW1A');
  assert.equal(postcodeDistrict('m1 1ae'), 'M1');
  assert.equal(postcodeDistrict('EC1A1BB'), 'EC1A');
  assert.equal(postcodeDistrict('B33 8TH'), 'B33');
  assert.equal(postcodeDistrict('CR2 6XH'), 'CR2');
  assert.equal(postcodeDistrict('DN55 1PT'), 'DN55');
  assert.equal(postcodeDistrict('not a postcode'), null);
  assert.equal(postcodeDistrict('75001'), null);
  assert.equal(postcodeDistrict(undefined), null);
});
