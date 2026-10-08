# NPN git-native design

Status: draft v2.2, 8 October 2026. Revised after two design reviews by Claude Code; D2, D4, D7 and D8 decided.

Source documents: the NPN White Paper and the NPN Technical Specification (drafts, in the claude.ai project "Theoretical Work"). This file records how the git-native build implements them and where it departs from them. Section 14 lists every departure.

## 1. Purpose (unchanged from the White Paper)

- Verify that data is attributable to a named primary source and unaltered. This is provenance verification, not truth verification.
- No interpretation, scoring, ranking or characterisation of any institution.
- Public access with no account and no information asymmetry.

## 2. Architecture

| Repo | Who runs it | Holds |
|---|---|---|
| Protocol repo (this one, the genesis repo) | Genesis operator | Spec, schemas, source adapters, shared library, node template, signer lists, shared config, genesis front end |
| Node log repo | One per node | Signed manifests, checkpoints, consensus state, index. **Never rewritten** |
| Node data repo | One per node | Raw and canonical company data, person record parts. Rewritten only on a legal order (section 8) |
| Node name store | One per node | Current names of individuals and their signed attestations. A static deployment regenerated every run, never committed (section 8) |
| Front ends | Anyone | Static, client-side pages. The genesis front end lives in `site/` and is published with GitHub Pages |

Layout of this repo:

```
CLAUDE.md
LICENSE            Apache 2.0 (code)
DATA-LICENCE.md    CC0 for network-generated records; source data keeps its own licence
docs/              DESIGN.md, PLAN.md, FRONTEND.md (Phase 5), VERIFY.md (Phase 6)
config/            watchlist.json and adapters.json (shared, versioned)
lib/               shared library: canonicalise, hash, sign and verify, logs, consensus, merkle
adapters/          one folder per public source (companies-house first)
mapping/           FollowTheMoney mapping (Phase 4)
node-template/     everything a new node needs, plus setup instructions
signers/           genesis.json (canonical), genesis.allowed_signers (generated)
site/              genesis front end
tests/             fixtures and tests
.github/workflows/
```

### Data flow, public data layer

1. On schedule, at the same minute on every node, each node's CI job pulls every record on the shared watchlist, using the adapter version pinned in `config/adapters.json`.
2. For each record: the adapter applies the field allowlist (section 8), produces a canonical form (section 3), and takes two hashes: SHA-256 of the canonical bytes and SHA-256 of the raw response bytes.
3. The node writes changed data to its data repo, then appends one signed **round manifest** to its log repo (section 4). A manifest is committed every round, whether or not any data changed.
4. The node fetches the other listed nodes' manifest logs, checks them for consistency, and records their checkpoints in its next manifest. This is how nodes witness each other.
5. The node derives consensus with the shared library (section 5) and writes its consensus state and per-record index to its log repo.
6. The node regenerates its name store (section 8).
7. Front ends verify what they display directly from node manifests (section 11).

There is no central protocol layer for public data. Nothing needs receiving, broadcasting or counting centrally.

## 3. Records, version keys and canonical form

- **Record:** the smallest unit the source itself identifies. A company profile is one record. Each officer appointment and each person with significant control is its own record, keyed by the source's own identifier, not the whole list.
- **Version key:** a version field the source itself provides. Use the most specific one available: the record's own etag if it has one, otherwise the etag of the enclosing list. Nothing derived from content may be used as a version key, because nodes that saw different content would then get different keys and could never disagree.
- **Item-level endpoints:** where list items carry no etag of their own, the adapter fetches the item-level endpoint if the source has one, so one changed item does not move the version key of every item in the list. Check the extra requests against rate limits.
- **Sources without a version field** are not onboarded until a rule for them is designed and recorded here.
- **Paged lists:** all pages of one list must carry the same list etag. If they do not, the list changed mid-fetch and the fetch is retried. Records are split out by source identifier, so page order does not matter.
- **Adapter version:** each adapter has a version, and the version every node uses is pinned in `config/adapters.json`. The adapter version is part of the key nodes vote on (section 5). Changing the pinned version is a coordinated config change, like a watchlist change.
- **Canonical form:** RFC 8785 (JSON Canonicalization Scheme) plus only the published transforms for that source, applied in a fixed, documented order. Every transform is listed with its reason.
- **Large integers:** RFC 8785 serialises numbers as IEEE 754 doubles, so integers above 2^53 lose precision. The canonicaliser must fail loudly on such values rather than change them. Each adapter documents any field where this could occur.
- **Line endings:** the repo forces LF (`.gitattributes`) so the same file hashes identically on Windows and in CI.

## 4. Manifest logs and witnessing

### Round manifest

Each manifest is signed by the node (section 7) and contains:

- protocol version, node id, signer list version, watchlist version, adapters config version;
- sequence number (starting at 0) and the hash of the previous manifest;
- one entry per record: source id, record id, version key, adapter version, canonical hash (for person records, the record part only, section 8), raw hash, retrieval time, and **first_seq**: the sequence number of this node's first entry for the same key (section 11);
- **peer checkpoints:** for each other listed node, the latest checkpoint of its log that this node has checked (node id, tree size, root hash).

### Manifest log

- Each node's manifests form an append-only log in its log repo, ordered by sequence number.
- After each append, the node publishes a signed **checkpoint**: node id, tree size and the RFC 6962 Merkle root over all its manifest hashes in sequence order. Evaluate the C2SP checkpoint format for this.
- Because this tree grows only at the end in insertion order, RFC 6962 consistency proofs work, and witness tooling can be reused.

### Witnessing

- When node A fetches node B's log, A checks that B's new checkpoint is consistent with the last B checkpoint A recorded: the earlier manifests must be an unchanged prefix.
- If it is consistent, A includes B's checkpoint in its next manifest. That inclusion is A's cosignature of B's log.
- If it is not consistent (B has rewritten or forked its history), A records the two conflicting checkpoints as **log equivocation evidence**, signed in its own manifest, and stops counting B's manifests beyond the last consistent point.
- Witnessing covers manifests, not git commit ids. A rewrite of a node's data repo (section 8) does not affect its log.
- **Witnessed:** a manifest of node B is witnessed once at least q - 1 of the other listed nodes (q as defined in section 5) have included a checkpoint of B whose tree size covers it. With 4 nodes, that is 2 of the other 3.

## 5. Consensus rules

- **Key:** (source, record id, version key, adapter version). Status is reported per key. The outcome carries the winning hash where there is one.
- **N:** the number of nodes on the signer list the reader chooses. N is fixed by the signer list version. A node that has not yet pulled a record, for example because it is behind on the watchlist or the adapter pin, is simply silent for that key. N never varies per record, because that would let outcomes reverse.
- **Minimum N:** 4. The library refuses to report final outcomes for a signer list with fewer than 4 nodes.
- **Quorum:** q = ceil(0.75 × N). With N = 4, q = 3, so one silent or one bad node is tolerated.
- **Which votes count:** under signer list L, every vote signed by a member of L with a key valid for that sequence range counts, whenever it was cast. The signer list version a manifest declares is recorded for audit only.
- **A node's vote for a key:** the hash in its earliest manifest entry for that key, by its own sequence order. Sequence order is part of the witnessed log, so every reader sees the same first entry. A later entry for the same key with a different hash is flagged as **record equivocation** and published, but does not change the vote. Because the adapter version is part of the key, an adapter upgrade that changes canonical hashes creates new keys, not equivocation.
- **Silent:** N minus the number of nodes with a vote for the key.
- **Accepted:** some hash H has at least q votes.
- **Disputed:** for every hash H, votes(H) + silent < q. No hash can reach the quorum even if every silent node joined it.
- **Unresolved:** neither. Shown as unresolved with the number of silent nodes. Never shown as settled.
- **Short-lived versions are expected to stay unresolved.** If a record changes between the first and the last node's pull, the old and new versions may each get fewer than q votes and stay unresolved permanently. That status is accurate: the network did not observe the version consistently. Pulling at the same scheduled minute and using item-level version keys (section 3) keeps this rare. It is not a fault.
- **Provisional and final:** an outcome computed only from witnessed manifests is final. An outcome that relies on any unwitnessed manifest is provisional and shown as such.
- **Monotonic within one signer list version:** with N fixed and votes fixed at first entry, accepted stays accepted and disputed stays disputed as more manifests arrive. A different signer list version is a different computation. Outcomes are always reported with the signer list version they were computed under.
- **Why outcomes cannot conflict:** final outcomes rest only on witnessed log prefixes, so every reader counts the same votes, and monotonicity does the rest. Conflicting outcomes would need two branches of one node's log both witnessed, which needs every node in the overlap of the two witness sets to be dishonest. That takes at least 2q - N dishonest nodes: 2 of 4, and roughly half the network at larger sizes. With 4 nodes, one dishonest node is tolerated.

### Consensus state

- Each node writes `consensus/state.json` in its log repo: the final outcomes (accepted and disputed), sorted by key, plus the **inputs**: the exact peer checkpoints (node id, tree size, root hash) the state was computed from, and the signer list version.
- `consensus/root.txt`: a Merkle root over the sorted entries, giving inclusion proofs. This tree makes no append-only claim; it is recomputed each time. Append-only lives in the manifest logs (section 4).
- Nodes with the same inputs must produce the same root. Nodes with different inputs may legitimately differ. The compare tool reports "different inputs" separately from "different result for the same inputs". Only the second is a fault.
- Each node also writes a per-record **index**: for each key, a pointer to the manifest holding its latest entry. The index is an unsigned locator only; everything a reader relies on is in signed manifests (section 11).

## 6. Signer lists, nodes and shared config

- Anyone can run a node. Only nodes on the reader's chosen signer list count.
- **`signers/genesis.json` is canonical.** It holds each node's id, current public key, any retired keys with the sequence range each signed, repo URLs (log repo, data repo, name store), hosting platform, CI or automation platform, operating system, conflict disclosure and independence status.
- **`signers/genesis.allowed_signers` is generated** from it by a script, with a test that fails if the two disagree.
- **Signer list version** = SHA-256 of the RFC 8785 canonical form of the sorted array of node ids with their keys (current and retired, with sequence ranges). Metadata such as hosting, operating system or conflict disclosure is excluded, so editing it does not change the version or restart counting.
- The genesis list is curated by the genesis operator and is forkable. The front end accepts a signer list URL, so a fork with a different list is one parameter away.
- Test nodes run by the genesis operator are marked `independence: none`. They prove the mechanics, not independence.
- **Shared config:** `config/watchlist.json` and `config/adapters.json`, each with a version field. Every node uses the current versions. Each manifest records the versions it used.

## 7. Keys and signing

- Ed25519.
- Default format: SSH signatures (SSHSIG) via `ssh-keygen -Y sign`, verified against the allowed_signers file, so anyone can verify with stock OpenSSH. Browser verification must also work. Confirm both in Phase 2.
- Manifests, checkpoints and name attestations are signed. Commits are signed with the same key (git SSH signing).
- **Key rotation:** a new key is added to `genesis.json` and the old one moves to retired keys with the sequence range it covered, so earlier votes still verify.
- **Known gap:** on hosted CI, the platform holds the private key as a secret. That is the automation-platform capture point the White Paper warns about. Hardening, later: self-hosted runner or hardware-backed key.

## 8. Personal data (D8, decided)

**Principle:** full history for everything, including records about individuals. Old values stay archived and accessible. A change or removal at source is shown as a change, with the old value still visible. Safety is achieved at ingestion by the field allowlist, not by deleting later. Nothing is withdrawn automatically.

### Individuals

- **Allowlist.** For individuals (officers, individual persons with significant control, individuals named in VDS governance fields), only these fields are processed: name, role or nature of control, start and end dates, and the source's own public identifier. Addresses, dates of birth and the Companies House personal code are never processed for publication.
- **Record part, full history.** Role or nature of control, dates and identifier form the person's **record part**. It is canonicalised, hashed, voted on, stored in the data repo and archived with full history, exactly like company data.
- **Names leave no permanent trace.** Names are never written to the log repo or the data repo, in any form, including hashes. A plain hash of a name can be confirmed by anyone who guesses the name, and the link between an old name, a new name and an identifier is the disclosure section 22 of the Gender Recognition Act 2004 makes an offence where the information was acquired in connection with a business or professional service, with no exception for information already public. The network cannot tell which name changes are gender-related, so the rule covers every name.
- **Current names come from the name store.** Each run, every node publishes in its name store, for each individual on its watchlist, the current name and a signed **name attestation** (node id, source, record id, version key, name hash). The front end shows a name only when at least q listed nodes' attestations agree. When a name changes, the old name and its attestations disappear on the next run. Role history is unaffected because the identifier carries identity across the change.
- **Name store hygiene.** The name store is a static deployment regenerated from a CI artifact every run, never committed. CI artifact retention is set to 1 day. It is served with robots exclusion and no-archive headers.
- **Accepted residual risk:** crawlers can ignore robots exclusion and archive a name before it changes. That exposure is no greater than for Companies House's own pages, which the same crawlers archive.
- **Raw responses of person records** are not retained by default, so no personal data outlives the run. Their raw hash is still recorded as the node's commitment. An operator who chooses to retain them does so privately, under its own data protection responsibility, outside the protocol.
- **Corrections.** A wrong value in the record part is corrected through the normal correction chain; the old value stays, labelled superseded. A wrong name is simply replaced in the next name store run.
- **Private individuals with no public role.** Where a schema field could hold one, for example individual funders in VDS Category C, the schema records category and band without a name. Settled in Phase 7.

### Company data

- **Registered office address:** published as locality, postcode district and country. The full address object, exactly as the source provides it, is kept only as a hash, so companies sharing an address are visible without the address being published. Limit: someone who already knows an address can check it against the hash, as Companies House's own search allows. No normalisation is applied before hashing, so formatting differences in the source will hide some shared addresses.
- **Company names and previous company names:** published in full. They are company identity, published by Companies House, and previous names are a strong provenance signal. The rare case of a previous company name containing a person's former name is handled by the legal-order backstop.

### Legal-order backstop

- Only for a legal order served on a specific node operator. Nothing else triggers removal.
- The operator rewrites its **data repo** to remove the affected content file and appends a published withdrawal record to its log. The log repo is never rewritten, so signed log commits and witnessing are untouched.
- **Limits:** git hosts keep removed commits reachable by hash until purged, forks keep their own copies, and third-party archives (Zenodo, Software Heritage) hold their own snapshots. The operator also files the git host's sensitive-data removal request and notifies those archives, which run their own takedown processes.

**Before individual records go public:** take a legal view on lawful basis under UK GDPR and on the Gender Recognition Act point.

## 9. Relational layer

- Map accepted records to the FollowTheMoney (FtM) model (Company, LegalEntity, Person, Ownership, Directorship and so on) for interoperability with OpenSanctions, Aleph and existing graph tooling.
- The mapping is a published, versioned, deterministic transform, subject to section 8: Person entities carry the identifier, and the front end attaches the current name from the name store.
- Edges only from declared relational fields. No inferred edges.
- Entities are linked across companies only by identifiers the source itself provides. No name matching.
- Records that do not map cleanly are held unmapped and logged, not forced into the nearest type. The White Paper's rule applies: normalisation is interpretation.
- Alternative to evaluate for ownership specifically: the Beneficial Ownership Data Standard (BODS).

## 10. VDS (institutional submissions), later phase

**Default to evaluate first: the institution's own repo is the submission channel.**

- The institution, or its accounting software, commits signed payloads to its own public repo. Payload fields follow Technical Specification section 03, signed with the institution's registered Ed25519 key, plus the signer list version the payload targets.
- Nodes treat that repo as one more source: pull, verify, then sign accept or reject with structured reasons.
- No push, no central endpoint, no broadcast. Nodes witness the institution repo's history the same way they witness each other (section 4), so a rewrite after fetching is detectable.
- Each node records when it first saw each payload. Submission time is therefore only as precise as the polling interval. Institution commit dates are self-asserted and are not used.
- Verification checks as in the Technical Specification: schema, internal consistency, signature, cross-reference with the public data layer.
- Same counting rules as section 5. Rejection is final as soon as acceptance becomes impossible, which keeps the no-holding-state rule.
- **Equivocation:** two different initial payloads signed by one institution key for the same institution, category and period are rejected and published.
- Corrections reference the superseded entry hash, as in the Technical Specification. Old values stay as evidence and the new value is promoted.
- Personal fields in submissions follow section 8. The institution's own repo is the primary publisher and its contents are the institution's responsibility.

Alternative if the default fails: the institution client pushes the identical signed payload to every listed node.

## 11. Front end verification

- **Light mode (default):** for each record on screen, read each node's index to find its latest manifest entry for the key, fetch that manifest and the manifest at the entry's **first_seq**, verify both signatures and their witnessed status, and count the first vote. If a node's first and latest entries for a key differ, show its record equivocation. Cost scales with what is displayed, not with history.
- Everything light mode relies on is signed. A false first_seq would be a signed false statement in the node's own witnessed log, provable by audit mode.
- **Audit mode (optional):** recompute everything from full manifest histories.
- Names come from name store attestations (section 8), shown only when at least q listed nodes agree.
- The front end never trusts an unsigned or precomputed result. Consensus logic is the shared library, the same code the nodes run.

## 12. Anchoring and archival

- Each new manifest log checkpoint and consensus root is timestamped externally with OpenTimestamps.
- Periodic snapshot releases of log repos and data repos are archived to Zenodo (DOI) through its GitHub integration. The name store and raw responses of person records are never archived (section 8).
- Public repos are also crawled by Software Heritage.

## 13. Scaling, later

- Below about 25 listed nodes, every node verifies everything.
- Above that: a fixed-size random sample per item, not a percentage, with the 75% threshold applied within the sample.
- The sample is derived from a public randomness beacon (drand, run by the League of Entropy) plus the item hash plus the signer list version, so anyone can check that the sample was drawn correctly.

## 14. Departures from the Technical Specification

| Technical Specification | Git-native build |
|---|---|
| Central protocol layer receives, broadcasts and counts | Removed for public data. VDS uses the institution's own repo. Counting is done by every node and every reader |
| Consortium public key list, signed by the founding organisation, then multisig | Signer list files. Reader chooses. Forkable |
| One verified record chain with sequential entry_id | Per-node append-only manifest logs in a never-rewritten log repo, witnessed by peers, plus a recomputed consensus state with inclusion proofs |
| 60-second consensus window | No window. Fixed-N counting, provisional until witnessed, then final |
| Public data ingestion, verification method unspecified | Public data verified by node consensus |
| API key-gated, rate-limited access | Data served as static files from public repos |
| Staged open source release | Open from day one (D4, decided) |
| VDS fees, revenue split, treasury | None (pending D5) |
| Node hardware minimums, 99% uptime | Scheduled CI job. Uptime matters only for VDS |
| Node admission by 75% consortium vote | Signer list curation (mechanism pending D3) |
| Minimum 3 nodes | Minimum 4 nodes for final outcomes (D2, decided) |
| Individuals' data held in the verified record | Record parts with full history; names only in a non-archived name store (D8, decided) |

## 15. Prior art to reuse rather than reinvent

| What | Use it for | Gap it leaves |
|---|---|---|
| Git scraping / GitHub Flat Data | Scheduled pull and commit-on-change pattern | Single operator, unsigned, no cross-repo agreement |
| Transparency log witnesses (transparency.dev, C2SP checkpoint and witness specs) | Checkpoint format and witnessing of manifest logs | Witnesses check append-only, not content |
| Chainlink Off-Chain Reporting | Reference for independent observation and quorum signing | Medians not exact match, blockchain and token bound, curated operators |
| API3 Airnode (first-party oracles) | Reference for VDS: data owners sign their own data | Blockchain bound |
| FollowTheMoney | Relational model | Data licences vary; model only |
| OpenCorporates provenance objects | Per-data-point source URL, type and timestamp | Single party, commercial |
| RFC 8785 (JCS) | Canonical JSON | Large integers (section 3) |
| RFC 6962 | Manifest log tree and consistency proofs | None |
| drand | Public randomness for sampling | External dependency |

## 16. Operational notes to verify

- GitHub can disable scheduled workflows in public repos after a period with no repository activity (60 days at the time of writing). A manifest commits to the log repo every round, which should count as activity. Verify in Phase 1.
- Companies House API: 600 requests per 5 minutes; persistent breaches risk a ban. Each node uses its own key. Size the watchlist, and any item-level fetching, accordingly.
- CI artifact retention for the name store must be set to 1 day on every platform used.
- Source licences: confirm and record each source's licence and attribution wording before publishing its data.
- CORS: browser fetches from raw file hosts and name stores must be checked for each hosting platform (Phase 5).

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-08 | Build the MVP git-native | Git supplies the hash chain, content addressing and Ed25519 signing the spec needs, with no custom infrastructure |
| 2026-10-08 | Consensus by fixed-N thresholds with first-vote counting, no clock | Per-key yes/no needs no global ordering, so no BFT engine and no window |
| 2026-10-08 | Version keys only from source-provided fields | Content-derived keys make disputes impossible and let tampering hide as a new key (review 1, item 1) |
| 2026-10-08 | Shared JS library for nodes and front end | Readers must compute consensus exactly as nodes do |
| 2026-10-08 | Two trees: RFC 6962 manifest logs (append-only) and a sorted consensus tree (inclusion only) | One sorted tree cannot support consistency proofs (review 1, item 2) |
| 2026-10-08 | Nodes witness each other's manifest logs; outcomes final only when witnessed by q - 1 other nodes | Force-push rewrites must be provable (review 1, item 3); a witness threshold tied to q keeps the safety bound at 2q - N dishonest nodes |
| 2026-10-08 | Record = smallest source-identified unit; version key = most specific source etag | Paged lists and per-entry changes (review 1, item 9) |
| 2026-10-08 | One shared, versioned watchlist; N fixed by signer list | Variable N would let outcomes reverse (review 1, item 11) |
| 2026-10-08 | genesis.json canonical; allowed_signers generated | Single source of truth for signer identity (review 1, item 12) |
| 2026-10-08 | Manifests sign a raw-bytes hash as per-node evidence | Raw responses were otherwise unprotected (review 1, item 13) |
| 2026-10-08 | D2: threshold 75%, rounded up, minimum 4 nodes | 4 nodes tolerate one silent or one bad node; 3 would mean unanimity |
| 2026-10-08 | D4: open source from day one | Repo is already public |
| 2026-10-08 | D7: Apache 2.0 for code, CC0 for network-generated records, source data under its own licence | Permissive with a patent grant; network records free to reuse |
| 2026-10-08 | D8: full history for all records including individuals; allowlist at ingestion; withdrawal only on a legal order | Provenance requires old values to stay accessible |
| 2026-10-08 | Names leave no permanent trace, not even hashes; current names served with signed attestations from a non-archived name store | A name hash is a confirmation oracle; Gender Recognition Act 2004 s.22 (review 2, items A and B) |
| 2026-10-08 | Adapter version is part of the vote key; adapter versions pinned in shared config | Upgrades must not read as equivocation or split votes (review 2, item C) |
| 2026-10-08 | Short-lived versions documented as expected to stay unresolved; same-minute pulls; item-level endpoints where list items lack etags | Accurate status, not a fault (review 2, item D) |
| 2026-10-08 | Signer list version = hash of node ids and keys only; votes count by membership | Metadata edits must not restart counting (review 2, item E) |
| 2026-10-08 | Person raw responses not retained by default; raw hash still recorded | No personal data outlives the run (review 2, item F) |
| 2026-10-08 | Name store: 1-day artifact retention, robots exclusion, no-archive headers; crawler risk accepted | Exposure no greater than the source's own pages (review 2, item G) |
| 2026-10-08 | Each node split into a never-rewritten log repo and a data repo; legal-order limits documented | A legal-order rewrite must not touch signed logs (review 2, item H) |
| 2026-10-08 | Manifest entries carry first_seq; index is an unsigned locator only | Light mode relies only on signed data (review 2, item I) |
| 2026-10-08 | Registered office: locality, postcode district and country published, full address hashed | Small companies' registered offices are often home addresses; shared addresses stay detectable (review 2, item J) |
| 2026-10-08 | Company names and previous company names published in full | Company identity and a strong provenance signal; rare former-name case goes to the legal-order backstop (review 2, item J) |
| 2026-10-08 | `.gitattributes` forces LF line endings and marks `tests/fixtures/` as binary | Windows checkouts otherwise convert line endings, so the same file would hash differently on different machines |
| 2026-10-08 | CI on Node 24 (current LTS); `package.json` declares Node 22 or later | Node 22 is the oldest maintained line with native glob support in `node --test` and WebCrypto Ed25519 |
| 2026-10-08 | Test files are `tests/**/*.test.js` | Explicit pattern, so the runner does not pick up fixtures or `node-template/` files |
| 2026-10-08 | `package.json` is `private`, licence field `Apache-2.0` | Prevents accidental npm publishing; licence per D7 |
| 2026-10-08 | LICENSE holds the unmodified Apache 2.0 text; the copyright line "Copyright 2026 N-ought" goes in NOTICE | Apache's recommended practice; keeps LICENSE recognisable to licence detection tools. Holder name chosen by James |
| 2026-10-08 | `config/watchlist.json` starts as `{"version": 0, "entries": []}`; entry schema set in Phase 1 | Step 5 of Prompt 0b needs a placeholder; an integer version is the simplest value a manifest can record |
| 2026-10-08 | `config/adapters.json` starts as `{"version": 0, "adapters": {}}`, a map from adapter name to pinned version | Same shape as the watchlist: an integer config version for manifests, plus one pin per adapter |
