import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalise, canonicalBytes, CanonicaliseError } from '../lib/canonicalise.js';

// RFC 8785 section 3.2.2 example, without 1E30: this library rejects integers at or above 2^53.
test('RFC 8785 serialisation example', () => {
  const input = {
    numbers: [333333333.33333329, 4.50, 2e-3, 0.000000000000000000000000001],
    string: '€$\u000F\u000aA\'B"\\\\"\/',
    literals: [null, true, false],
  };
  const expected = String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`;
  assert.equal(canonicalise(input), expected);
});

// RFC 8785 section 3.2.3 example: keys sorted by UTF-16 code units.
test('RFC 8785 key sorting example', () => {
  const input = {
    '€': 'Euro Sign',
    '\r': 'Carriage Return',
    'דּ': 'Hebrew Letter Dalet With Dagesh',
    '1': 'One',
    '😀': 'Emoji: Grinning Face',
    '\u0080': 'Control',
    'ö': 'Latin Small Letter O With Diaeresis',
  };
  const order = ['\r', '1', '\u0080', 'ö', '€', '😀', 'דּ'];
  const expected = '{' + order.map((k) => JSON.stringify(k) + ':' + JSON.stringify(input[k])).join(',') + '}';
  assert.equal(canonicalise(input), expected);
});

test('insertion order does not change the output', () => {
  const a = { b: 1, a: { y: [1, 2], x: 'z' } };
  const b = { a: { x: 'z', y: [1, 2] }, b: 1 };
  assert.equal(canonicalise(a), canonicalise(b));
  assert.deepEqual(canonicalBytes(a), canonicalBytes(b));
});

test('negative zero serialises as 0', () => {
  assert.equal(canonicalise(-0), '0');
});

test('integers at or above 2^53 fail loudly', () => {
  assert.equal(canonicalise(Number.MAX_SAFE_INTEGER), '9007199254740991');
  assert.throws(() => canonicalise(2 ** 53), CanonicaliseError);
  assert.throws(() => canonicalise({ n: 9007199254740993 }), /2\^53/);
  assert.throws(() => canonicalise([-(2 ** 60)]), CanonicaliseError);
  assert.throws(() => canonicalise(1e30), CanonicaliseError);
});

test('unsupported values fail loudly', () => {
  assert.throws(() => canonicalise({ a: undefined }), CanonicaliseError);
  assert.throws(() => canonicalise(() => 1), CanonicaliseError);
  assert.throws(() => canonicalise(new Date(0)), CanonicaliseError);
  assert.throws(() => canonicalise(NaN), CanonicaliseError);
  assert.throws(() => canonicalise(10n), CanonicaliseError);
});

test('lone surrogates fail loudly', () => {
  assert.throws(() => canonicalise('\ud800'), CanonicaliseError);
  assert.throws(() => canonicalise({ '\udc00': 1 }), CanonicaliseError);
});

test('output is UTF-8', () => {
  assert.deepEqual(canonicalBytes('é'), new Uint8Array([0x22, 0xc3, 0xa9, 0x22]));
});
