# NPN git-native design

Status: draft, 8 October 2026.

Source documents: the NPN White Paper and the NPN Technical Specification (drafts, in the claude.ai project "Theoretical Work"). This file records how the git-native build implements them and where it departs from them. Section 10 lists every departure.

## 1. Purpose (unchanged from the White Paper)

- Verify that data is attributable to a named primary source and unaltered. This is provenance verification, not truth verification.
- No interpretation, scoring, ranking or characterisation of any institution.
- Public access with no account and no information asymmetry.

## 2. Architecture

Three kinds of repository.

| Repo | Who runs it | Holds |
|---|---|---|
| Protocol repo (this one, the genesis repo) | Genesis operator | Spec, schemas, source adapters, shared library, node template, signer lists, genesis front end |
| Node repos | One per node operator, created from the node template | Raw pulls, signed round manifests, the node's derived consensus state |
| Front ends | Anyone | Static, client-side pages. The genesis front end lives in `site/` in this repo, published with GitHub Pages |

Suggested layout for this repo:

```
CLAUDE.md
docs/            DESIGN.md, PLAN.md, FRONTEND.md (Phase 5)
lib/             shared library: canonicalise, hash, sign/verify, consensus, merkle
adapters/        one folder per public source (companies-house first)
mapping/         FollowTheMoney mapping (Phase 4)
node-template/   everything a new node needs, plus setup instructions
signers/         genesis.allowed_signers, genesis.json
site/            genesis front end
tests/           fixtures and tests
.github/workflows/
```

### Data flow, public data layer

1. On schedule, each node's CI job pulls its watchlist from each source API.
2. The raw response is saved. A canonical form is produced with RFC 8785 (JSON Canonicalization Scheme) plus only the published, minimal transforms for that source. SHA-256 of the canonical bytes.
3. The node writes a **round manifest**: for each record, the source id, record id, version key, canonical hash, retrieval time and adapter version, plus the protocol version, node id, signer list version and the hash of the node's previous manifest. The manifest is signed with the node's Ed25519 key. The commit is signed with the same key.
4. The node fetches the other listed nodes' manifests, verifies their signatures against the signer list, and derives consensus with the shared library.
5. The node writes its **consensus state**: the sorted set of accepted entries and a Merkle root over them. Honest nodes using the same signer list converge on identical roots.
6. Front ends fetch manifests directly, verify signatures in the browser, recompute consensus with the same library, and display the result.

There is no central protocol layer for public data. Nothing needs receiving, broadcasting or counting centrally.

## 3. Consensus rules

- **Unit of agreement:** (source, record id, version key, canonical hash).
- **Counted signers:** the nodes on the signer list the reader chooses. The genesis list is `signers/genesis.allowed_signers` plus `signers/genesis.json`.
- **Accepted:** at least 75% of listed nodes attest the same hash for the same (source, record id, version key).
- **Disputed:** more than 25% of listed nodes attest a different hash for the same key, so acceptance is impossible.
- **Unresolved:** neither threshold reached. Shown as unresolved with the number of silent nodes. Never shown as settled.
- **Monotonic:** accepted and disputed can only be reached, never reversed, because later attestations only add. Two honest readers cannot reach opposite outcomes unless a node signed two different hashes for the same key, which is provable equivocation.
- **Version key, not clock time:** each source adapter defines the version key, for example a record's etag or last-modified field where the API provides one. Fallback: the content hash plus a date bucket. Scheduled CI runs are not punctual, and nodes will not pull at the same instant.
- **Signer list pinned:** consensus state records the hash of the signer list used. A reader with a different list recomputes.
- **Merkle construction:** RFC 6962 (Certificate Transparency) style over sorted entry hashes, documented in `lib/`. Keeps the door open to the C2SP checkpoint and witness formats.

## 4. Signer lists and nodes

- Anyone can run a node. Only nodes on the reader's chosen signer list count.
- The genesis signer list is curated by the genesis operator. It is forkable: the front end accepts a signer list URL, so a fork with a different list is one parameter away.
- Node metadata in `signers/genesis.json`, from the Technical Specification's infrastructure diversity rules: node id, operator, public key, repo URL, hosting platform, CI or automation platform, operating system, conflict disclosure, independence status.
- Test nodes run by the genesis operator are marked `independence: none`. They prove the mechanics, not independence.

## 5. Keys and signing

- Ed25519.
- Default format: SSH signatures (SSHSIG) via `ssh-keygen -Y sign`, verified against an `allowed_signers` file, so anyone can verify with stock OpenSSH. Browser verification must also work. Confirm both in Phase 2.
- Commits signed with the same key (git SSH signing).
- **Known gap:** on hosted CI, the platform holds the private key as a secret. That is the automation-platform capture point the White Paper warns about. Hardening, later: self-hosted runner or hardware-backed key.

## 6. Relational layer

- Map source records to the FollowTheMoney (FtM) model (Person, Company, Directorship, Ownership and so on) for interoperability with OpenSanctions, Aleph and existing graph tooling.
- The mapping is a published, versioned, deterministic transform. Raw records are kept.
- Edges only from declared relational fields. No inferred edges.
- Records that do not map cleanly are held unmapped and logged, not forced into the nearest type. The White Paper's rule applies: normalisation is interpretation.
- Mapping runs on accepted entries only.
- Alternative to evaluate for ownership specifically: the Beneficial Ownership Data Standard (BODS).

## 7. VDS (institutional submissions), later phase

**Default to evaluate first: the institution's own repo is the submission channel.**

- The institution, or its accounting software, commits signed payloads to its own public repo. Payload fields follow Technical Specification section 03, signed with the institution's registered Ed25519 key.
- Nodes treat that repo as one more source: pull, verify, then sign accept or reject with structured reasons.
- No push, no central endpoint, no broadcast. A rewrite of the institution's history after nodes have fetched it is detectable.
- Each node records when it first saw each payload. The spread of first-seen times across nodes gives a submission time that no single party asserts. Submission lag (Technical Specification) is computed from that.
- Verification checks as in the Technical Specification: schema, internal consistency, signature, cross-reference with the public data layer.
- Same monotonic thresholds as section 3. Rejection is final as soon as acceptance becomes impossible, which keeps the no-holding-state rule.
- **Equivocation:** two different initial payloads signed by one institution key for the same institution, category and period are rejected and published.
- Each payload names the signer list version it targets, so the counted set cannot change mid-round.
- Corrections reference the superseded entry hash, as in the Technical Specification.

Alternative if the default fails: the institution client pushes the identical signed payload to every listed node.

## 8. Anchoring and archival

- Each new consensus root timestamped externally with OpenTimestamps.
- Periodic snapshot releases archived to Zenodo (DOI) through its GitHub integration.
- Public repos are also crawled by Software Heritage.

## 9. Scaling, later

- Below about 25 listed nodes, every node verifies everything.
- Above that: a fixed-size random sample per item, not a percentage, with the 75% threshold applied within the sample.
- The sample is derived from a public randomness beacon (drand) plus the item hash plus the signer list version, so anyone can check that the sample was drawn correctly.

## 10. Departures from the Technical Specification

| Technical Specification | Git-native build |
|---|---|
| Central protocol layer receives, broadcasts and counts | Removed for public data. VDS uses the institution's own repo. Counting is done by every node and every reader |
| Consortium public key list, signed by the founding organisation, then multisig | Signer list files. Reader chooses. Forkable |
| One verified record chain with sequential entry_id | Set of accepted entries with a Merkle root over sorted entries. Each node's git history gives append-only |
| 60-second consensus window | No window. Monotonic thresholds plus an "unresolved" label |
| Public data ingestion, verification method unspecified | Public data verified by node consensus |
| API key-gated, rate-limited access | Data served as static files from public repos |
| Staged open source release | Open from day one (pending D4) |
| VDS fees, revenue split, treasury | None (pending D5) |
| Node hardware minimums, 99% uptime | Scheduled CI job. Uptime matters only for VDS |
| Node admission by 75% consortium vote | Signer list curation (mechanism pending D3) |

## 11. Prior art to reuse rather than reinvent

| What | Use it for | Gap it leaves |
|---|---|---|
| Git scraping / GitHub Flat Data | Scheduled pull and commit-on-change pattern | Single operator, unsigned, no cross-repo agreement |
| Transparency log witnesses (transparency.dev, C2SP checkpoint and witness specs) | Format and protocol for cosigning consensus roots | Witnesses check append-only, not content |
| Chainlink Off-Chain Reporting | Reference for independent observation and quorum signing | Medians not exact match, blockchain and token bound, curated operators |
| API3 Airnode (first-party oracles) | Reference for VDS: data owners sign their own data | Blockchain bound |
| FollowTheMoney | Relational model | Data licences vary; model only |
| OpenCorporates provenance objects | Per-data-point source URL, type and timestamp | Single party, commercial |
| RFC 8785 (JCS) | Canonical JSON | None |
| drand | Public randomness for sampling | External dependency, but run by 17 independent organisations |

## 12. Operational notes to verify

- GitHub can disable scheduled workflows in public repos after a period with no repository activity (60 days at the time of writing). Signed round manifests commit every round, which should count as activity. Verify in Phase 1.
- Companies House API: 600 requests per 5 minutes; persistent breaches risk a ban. Each node uses its own key. Size the watchlist accordingly.
- Source licences: confirm and record each source's licence and attribution wording before publishing its data.
- CORS: browser fetches from raw file hosts must be checked for each hosting platform (Phase 5).

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-08 | Build the MVP git-native, as described above | Git supplies the hash chain, content addressing and Ed25519 signing the spec needs, with no custom infrastructure |
| 2026-10-08 | Consensus by monotonic thresholds, no clock | Per-item yes/no needs no global ordering, so no BFT engine and no window |
| 2026-10-08 | Version key per source, not wall-clock rounds | Scheduled runs are unpunctual; avoids false disagreements |
| 2026-10-08 | Shared JS library for nodes and front end | Readers must compute consensus exactly as nodes do |
