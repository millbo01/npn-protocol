# signers

Signer lists. Readers choose which list counts, and any list can be forked (DESIGN.md section 6).

## The genesis list

- `genesis.json` is canonical. Per node: `node_id`, `public_key` (current key, valid from sequence `key_from_seq`), `retired_keys` (each with the `from_seq` to `to_seq` range it signed), `repo_url`, `name_store_url`, `operator`, `hosting_platform`, `ci_platform`, `operating_system`, `conflict_disclosure`, `independence`.
- `genesis.allowed_signers` is generated from it: `node runner/generate-allowed-signers.js`. A test fails if the two disagree. Do not edit it by hand.

**Signer list version** = SHA-256 of the RFC 8785 form of the nodes' ids and keys only, sorted by node id: `node_id`, `public_key`, `key_from_seq` and `retired_keys`. Editing any other field does not change the version (`lib/signers.js`).

## Signature namespaces

| Namespace | Signs |
|---|---|
| `npn-manifest` | Round manifests (`log/manifests/NNNNNN.json.sig`) |
| `npn-checkpoint` | Checkpoint text, for stock OpenSSH checks (`log/checkpoint.sshsig`). The checkpoint itself is a C2SP signed note |
| `git` | Commits on the node's branches |

## Key rotation

Add the new key as `public_key` with `key_from_seq` set to the first sequence it signs, and move the old key into `retired_keys` with the range it signed. Then regenerate `genesis.allowed_signers`. Stock OpenSSH cannot express sequence ranges, so it accepts a retired key for any sequence; `lib/verify.js` enforces the ranges.

Public keys only. Private keys never go in this repo.
