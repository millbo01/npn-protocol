# NPN node

A node of the NPN (N-ought Provenance Network). It pulls public data, records what it observed, and publishes the record here. The specification, the shared code and the shared config live in the protocol repo: https://github.com/millbo01/npn-protocol

Every run checks out the protocol repo at the tag pinned in its `config/adapters.json` and runs that code. No adapter code is copied into this repo.

## Branches

- **`main`**: the node workflow and `log/`. A round record is committed to `log/rounds/` every run. Protected against force-push and deletion. Never rewritten.
- **`data`**: an orphan branch holding canonical record data, written only when the data changes. Rewritten only on a legal order (protocol repo, `docs/DESIGN.md` section 8).

Raw API responses are never stored anywhere. Each round record carries the SHA-256 of the raw bytes the node received.

## Licence

Round records are dedicated to the public domain under CC0 1.0. Source data on the `data` branch remains under its source's terms. Companies House data: Source: Companies House public register. See the protocol repo's `DATA-LICENCE.md`.
