// RFC 8785 JSON Canonicalization Scheme (JCS).
// No imports, so the same file runs in Node and in the browser.
//
// Stricter than RFC 8785 in three places, all failing loudly rather than changing data:
// - integer-valued numbers at or above 2^53 in magnitude are rejected, because the
//   IEEE 754 double that holds them may not equal the source value (DESIGN.md section 3);
// - strings with lone surrogates are rejected (I-JSON, RFC 7493);
// - only plain objects, arrays, strings, finite numbers, booleans and null are accepted.

export class CanonicaliseError extends Error {
  constructor(message, path) {
    super(`${message} at ${path}`);
    this.name = 'CanonicaliseError';
    this.path = path;
  }
}

export function canonicalise(value) {
  return serialise(value, '$');
}

export function canonicalBytes(value) {
  return new TextEncoder().encode(canonicalise(value));
}

function serialise(value, path) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serialiseNumber(value, path);
    case 'string':
      return serialiseString(value, path);
    case 'object':
      if (Array.isArray(value)) {
        return '[' + value.map((item, i) => serialise(item, `${path}[${i}]`)).join(',') + ']';
      }
      return serialiseObject(value, path);
    default:
      throw new CanonicaliseError(`unsupported type ${typeof value}`, path);
  }
}

function serialiseNumber(value, path) {
  if (!Number.isFinite(value)) {
    throw new CanonicaliseError('non-finite number', path);
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new CanonicaliseError('integer at or above 2^53 cannot be held exactly; refusing to change it', path);
  }
  // ECMAScript number serialisation, as RFC 8785 section 3.2.2.3 requires. -0 becomes 0.
  return JSON.stringify(value);
}

function serialiseString(value, path) {
  if (!value.isWellFormed()) {
    throw new CanonicaliseError('string contains a lone surrogate', path);
  }
  // ECMAScript string serialisation, as RFC 8785 section 3.2.2.2 requires.
  return JSON.stringify(value);
}

function serialiseObject(value, path) {
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new CanonicaliseError('not a plain object', path);
  }
  // Default sort compares UTF-16 code units, as RFC 8785 section 3.2.3 requires.
  const keys = Object.keys(value).sort();
  const members = keys.map((key) => {
    const member = value[key];
    if (member === undefined) {
      throw new CanonicaliseError('undefined value', `${path}.${key}`);
    }
    return serialiseString(key, path) + ':' + serialise(member, `${path}.${key}`);
  });
  return '{' + members.join(',') + '}';
}
