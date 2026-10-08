# adapters

One folder per public source. Companies House comes first (Phase 1), in `adapters/companies-house/`.

Each adapter defines, documents and versions:

- the endpoints it pulls and the record id for each record type
- the version key for each record type, and its fallback where the source provides none
- every transform applied before canonicalisation, in a fixed order, with the reason for each
- the source's licence and attribution wording

Raw responses are always kept alongside the canonical output.
