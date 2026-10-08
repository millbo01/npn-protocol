# Companies House adapter

Adapter id `companies-house`, version **1**. Phase 1 scope: the company profile resource only.

| File | What it does |
|---|---|
| `profile.js` | Raw response bytes to canonical record: allowlist, transforms, hashes. No Node imports, so the browser can rerun it |
| `fetch.js` | API requests, request spacing, retries |
| `collect.js` | One round's collection: fetch, process, write changed data, return manifest entries. `runner/round.js` turns them into a signed manifest |
| `probe.js` | Live check of etag behaviour. Prints company numbers, etags and HTTP statuses only |

## Record, record id and version key

- **Endpoint:** `GET https://api.company-information.service.gov.uk/company/{company_number}`, HTTP Basic auth with the API key as the user name and an empty password.
- **Record:** one company profile per company (DESIGN.md section 3).
- **Record id:** `company-profile/{company_number}`, using the 8-character company number from the watchlist. The response's `company_number` must match it, or the record fails.
- **Version key:** the profile's `etag` field, a version field the source itself provides. A profile without an etag fails; there is no fallback (DESIGN.md section 3: sources without a version field are not onboarded).
- **Key nodes vote on:** (`companies-house`, record id, etag, adapter version 1).

## Published fields

Only these fields reach the canonical record. Anything else is dropped. A field Companies House adds later is dropped and reported by name in the run log, so it can be reviewed before it is ever published. An allowlisted field that arrives in an unexpected shape (for example an object where a string was expected) fails the record rather than being published unreviewed.

| Field | Notes |
|---|---|
| `company_number`, `company_name` | Company identity. Names published in full (DESIGN.md section 8) |
| `company_status`, `company_status_detail` | |
| `type`, `subtype`, `jurisdiction` | |
| `date_of_creation`, `date_of_cessation` | |
| `sic_codes` | |
| `previous_company_names[]` | `name`, `effective_from`, `ceased_on`. Published in full (DESIGN.md section 8) |
| `registered_office_address` | **Reduced** to `locality`, `postcode_district`, `country` (transform 5) |
| `registered_office_address_sha256` | SHA-256 of the full source address object, added by transform 3 |
| `registered_office_is_in_dispute`, `undeliverable_registered_office_address` | |
| `accounts` | `accounting_reference_date` (`day`, `month`), `last_accounts` (`made_up_to`, `period_start_on`, `period_end_on`, `type`), `next_accounts` (`due_on`, `overdue`, `period_start_on`, `period_end_on`), `next_due`, `next_made_up_to`, `overdue` |
| `confirmation_statement`, `annual_return` | `last_made_up_to`, `next_due`, `next_made_up_to`, `overdue` |
| `has_charges`, `has_insolvency_history`, `has_been_liquidated`, `is_community_interest_company` | Source-declared flags, published as the source states them |
| `last_full_members_list_date`, `external_registration_number`, `partial_data_available` | |

Known fields deliberately not published:

| Field | Reason |
|---|---|
| `etag` | The version key. Recorded in the manifest entry, not in the canonical record |
| `links` | Navigation URLs derived from the company number |
| `can_file` | State of the filing service, not a fact about the company |
| `service_address` | Correspondence address of a registered overseas entity; may be a personal address |
| `corporate_annotation` | Free text; not reviewed for personal data |
| `foreign_company_details`, `branch_company_details` | Overseas companies only; not reviewed in Phase 1 |
| `super_secure_managing_officer_count` | Concerns protected individuals; deferred to Phase 4 |

## Transforms, in order

The raw hash is SHA-256 of the response body bytes exactly as received, taken before transform 1. The raw bytes are then dropped. They are never written anywhere (DESIGN.md section 3).

| # | Id | What and why |
|---|---|---|
| 1 | `decode-utf8` | Decode the body as UTF-8. Invalid UTF-8 fails rather than being replaced |
| 2 | `parse-json` | Parse as a JSON object. Errors are reported without echoing the response. `JSON.parse` keeps the last of any duplicate member names |
| 3 | `hash-registered-office-address` | SHA-256 of the RFC 8785 form of the full `registered_office_address` object, exactly as the source provides it, before any change. Lets shared addresses be detected without publishing them (DESIGN.md section 8). No normalisation, so formatting differences at source give different hashes |
| 4 | `apply-allowlist` | Keep only the fields above. Unknown fields are dropped and reported by name |
| 5 | `reduce-registered-office-address` | Replace the address with `locality`, `postcode_district` and `country`. A key is present only if the source had the underlying field |
| 6 | `canonicalise` | RFC 8785 (`lib/canonicalise.js`), UTF-8. Integers at or above 2^53 fail loudly. These bytes are stored on the data branch and their SHA-256 is the canonical hash |

**Postcode district** is the outward code of a UK postcode. To find it, the postcode is uppercased and its spaces removed, then split as outward code plus a 3-character inward code (digit, letter, letter). `SW1A 1AA` gives `SW1A`. A value that is not a UK postcode gives `null` rather than a guess.

Order matters: transform 3 must run before transform 5, or the hash would cover the reduced address. A test checks this.

## Output

- **Data branch:** `companies-house/company-profile/{company_number}.json`, the canonical bytes, written only when they change.
- **Manifest entries:** per record: source, record id, version key, adapter version, canonical hash, raw hash, retrieval time. `runner/round.js` adds `first_seq` and writes the signed manifest to `log/manifests/` on `main` (DESIGN.md section 4). Phase 1 wrote unsigned round records to `log/rounds/` instead.

## Rate limit

Companies House allows 600 requests per 5 minutes per API key, answers `429` above that, and may block keys that breach it repeatedly ([rate limiting guide](https://developer-specs.company-information.service.gov.uk/guides/rateLimiting)). This adapter spaces requests at least 1 second apart, so a node stays at or below 300 per 5 minutes. On a `429` the round stops at once rather than retrying. Server errors are retried twice, 10 seconds apart. One request per company per round, so a 50-company watchlist takes under a minute.

## Licence and attribution

See DESIGN.md section 17. In short: information on the public register is made available under approvals issued by Companies House under section 47 of the Copyright, Designs and Patents Act 1988 and Schedule 1 of the Database Regulations. Companies House imposes no rules on how it is used. It is not released under the Open Government Licence. NPN credits the source as "Source: Companies House public register".
