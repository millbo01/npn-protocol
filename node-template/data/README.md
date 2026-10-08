# NPN node data

Canonical record data written by this node's rounds, one file per record, in RFC 8785 canonical JSON. The SHA-256 of each file is the canonical hash in the node's round records on `main`.

Layout: `{source}/{record type}/{record id}.json`, for example `companies-house/company-profile/00000006.json`.

Published fields and transforms for each source are documented in the protocol repo, for example `adapters/companies-house/README.md`. Source data remains under its source's terms. Companies House data: Source: Companies House public register.
