// Companies House company profile: from raw response bytes to the canonical record.
// No Node imports, so the same file runs on nodes and in the browser.
// Every transform, its order and its reason is documented in README.md in this folder.

import { canonicalBytes } from '../../lib/canonicalise.js';
import { sha256Hex } from '../../lib/hash.js';

export const SOURCE_ID = 'companies-house';
export const RECORD_TYPE = 'company-profile';
export const ADAPTER_ID = 'companies-house';
export const ADAPTER_VERSION = 1;

export const COMPANY_NUMBER = /^[A-Z0-9]{8}$/;

const ADDRESS_HASH_FIELD = 'registered_office_address_sha256';

// Field allowlist (DESIGN.md section 8). Only these fields reach the canonical record.
// true: a primitive or an array of primitives, copied as is.
// An object: pick those keys from an object.
// A one-element array: an array of objects, each picked with that spec.
// A value of any other shape fails loudly, so nothing unreviewed is published.
const FILING_DATES = { last_made_up_to: true, next_due: true, next_made_up_to: true, overdue: true };

export const ALLOWLIST = {
  company_number: true,
  company_name: true,
  company_status: true,
  company_status_detail: true,
  type: true,
  subtype: true,
  jurisdiction: true,
  date_of_creation: true,
  date_of_cessation: true,
  sic_codes: true,
  previous_company_names: [{ name: true, effective_from: true, ceased_on: true }],
  // Passed through only so transform 5 can reduce it. Never published in full.
  registered_office_address: {
    care_of: true,
    po_box: true,
    premises: true,
    address_line_1: true,
    address_line_2: true,
    locality: true,
    region: true,
    postal_code: true,
    country: true,
  },
  [ADDRESS_HASH_FIELD]: true,
  registered_office_is_in_dispute: true,
  undeliverable_registered_office_address: true,
  accounts: {
    accounting_reference_date: { day: true, month: true },
    last_accounts: { made_up_to: true, period_start_on: true, period_end_on: true, type: true },
    next_accounts: { due_on: true, overdue: true, period_start_on: true, period_end_on: true },
    next_due: true,
    next_made_up_to: true,
    overdue: true,
  },
  confirmation_statement: FILING_DATES,
  annual_return: FILING_DATES,
  has_charges: true,
  has_insolvency_history: true,
  has_been_liquidated: true,
  is_community_interest_company: true,
  last_full_members_list_date: true,
  external_registration_number: true,
  partial_data_available: true,
};

// Known fields deliberately left out, with the reason. Not reported as unknown.
export const EXCLUDED = {
  etag: 'Version key. Recorded in the round record, not in the canonical record',
  links: 'Navigation URLs derived from the company number',
  can_file: 'State of the filing service, not a fact about the company',
  service_address: 'Correspondence address of a registered overseas entity; may be a personal address',
  corporate_annotation: 'Free text; not reviewed for personal data',
  foreign_company_details: 'Overseas companies only; not reviewed in Phase 1',
  branch_company_details: 'UK branches of overseas companies only; not reviewed in Phase 1',
  super_secure_managing_officer_count: 'Concerns protected individuals; deferred to Phase 4',
};

// The transforms, in the order they run. Each takes the previous value and returns the next.
export const TRANSFORMS = [
  {
    id: 'decode-utf8',
    reason: 'The API returns UTF-8 JSON. Invalid UTF-8 fails rather than being replaced.',
    apply: (bytes) => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new Error('response is not valid UTF-8');
      }
    },
  },
  {
    id: 'parse-json',
    reason: 'Read the response as a JSON object. Parse errors are reported without echoing the response.',
    apply: (text, ctx) => {
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error('response is not valid JSON');
      }
      if (!isPlainObject(value)) throw new Error('response is not a JSON object');
      ctx.source = value;
      return value;
    },
  },
  {
    id: 'hash-registered-office-address',
    reason: 'Keep the full registered office address only as a SHA-256 hash of its RFC 8785 form, taken before any change, so shared addresses stay detectable without publishing them (DESIGN.md section 8).',
    apply: async (profile) => {
      if (profile.registered_office_address === undefined) return profile;
      if (Object.hasOwn(profile, ADDRESS_HASH_FIELD)) {
        throw new Error(`source already has a field named ${ADDRESS_HASH_FIELD}`);
      }
      const hash = await sha256Hex(canonicalBytes(profile.registered_office_address));
      return { ...profile, [ADDRESS_HASH_FIELD]: hash };
    },
  },
  {
    id: 'apply-allowlist',
    reason: 'Only allowlisted fields are processed (DESIGN.md section 8). Unknown fields are dropped and reported by name.',
    apply: (profile, ctx) => {
      const out = {};
      for (const key of Object.keys(profile)) {
        if (Object.hasOwn(ALLOWLIST, key)) {
          out[key] = pick(ALLOWLIST[key], profile[key], `$.${key}`, ctx.unknownFields);
        } else if (!Object.hasOwn(EXCLUDED, key)) {
          ctx.unknownFields.push(`$.${key}`);
        }
      }
      return out;
    },
  },
  {
    id: 'reduce-registered-office-address',
    reason: 'Publish the registered office only as locality, postcode district and country (DESIGN.md section 8).',
    apply: (profile) => {
      if (profile.registered_office_address === undefined) return profile;
      return { ...profile, registered_office_address: reduceAddress(profile.registered_office_address) };
    },
  },
  {
    id: 'canonicalise',
    reason: 'RFC 8785 canonical form, UTF-8 encoded. These bytes are hashed and stored.',
    apply: (profile) => canonicalBytes(profile),
  },
];

export async function runPipeline(steps, rawBytes, ctx) {
  let value = rawBytes;
  for (const step of steps) {
    value = await step.apply(value, ctx);
  }
  return value;
}

// Raw response bytes in, everything a round needs out. The raw bytes are not kept.
export async function processProfile(rawBytes, expectedCompanyNumber, steps = TRANSFORMS) {
  const rawHash = await sha256Hex(rawBytes);
  const ctx = { source: undefined, unknownFields: [] };
  const canonical = await runPipeline(steps, rawBytes, ctx);

  const versionKey = ctx.source.etag;
  if (typeof versionKey !== 'string' || versionKey === '') {
    throw new Error('profile has no etag, so it has no version key');
  }
  if (ctx.source.company_number !== expectedCompanyNumber) {
    throw new Error(`profile company_number does not match the requested ${expectedCompanyNumber}`);
  }

  return {
    recordId: `${RECORD_TYPE}/${expectedCompanyNumber}`,
    versionKey,
    canonical,
    canonicalHash: await sha256Hex(canonical),
    rawHash,
    unknownFields: ctx.unknownFields,
  };
}

// UK postcode district (outward code). Uppercased and spaces removed only to find the split.
// Anything that is not a UK postcode gives null rather than a guess.
export function postcodeDistrict(postcode) {
  if (typeof postcode !== 'string') return null;
  const compact = postcode.toUpperCase().replace(/\s+/g, '');
  const match = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/.exec(compact);
  return match ? match[1] : null;
}

function reduceAddress(address) {
  const out = {};
  if (address.locality !== undefined) out.locality = address.locality;
  if (address.postal_code !== undefined) out.postcode_district = postcodeDistrict(address.postal_code);
  if (address.country !== undefined) out.country = address.country;
  return out;
}

function pick(spec, value, path, unknownFields) {
  if (spec === true) {
    if (isPrimitive(value) || (Array.isArray(value) && value.every(isPrimitive))) return value;
    throw new Error(`${path}: expected a primitive or an array of primitives, got ${describe(value)}`);
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) throw new Error(`${path}: expected an array, got ${describe(value)}`);
    return value.map((item, i) => pick(spec[0], item, `${path}[${i}]`, unknownFields));
  }
  if (!isPlainObject(value)) throw new Error(`${path}: expected an object, got ${describe(value)}`);
  const out = {};
  for (const key of Object.keys(value)) {
    if (Object.hasOwn(spec, key)) {
      out[key] = pick(spec[key], value[key], `${path}.${key}`, unknownFields);
    } else {
      unknownFields.push(`${path}.${key}`);
    }
  }
  return out;
}

function isPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : typeof value;
}
