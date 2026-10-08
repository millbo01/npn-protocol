# NPN git-native build plan

Version 2.2, 8 October 2026. Revised after two design reviews; D8 decided.

## How to use this plan

- Work one phase at a time. Each phase has: what you do first, the prompt to paste into Claude Code, the checks that say it is done, and a suggested model.
- Every prompt starts by making Claude Code read `CLAUDE.md`, `docs/DESIGN.md` and this file, so no session depends on remembered context.
- Theory and design changes happen in Claude chat. Claude Code gets work requests only. If Claude Code flags a design problem, paste its list into Claude chat and settle it there, then update `docs/DESIGN.md`.
- Phases 0 to 6 need nobody but you. Nothing in this plan waits on outreach.

## How docs reach the repo

- The local clone is `C:\Users\millb\Documents\npn-protocol`. It is connected to Claude chat.
- Claude chat writes only `CLAUDE.md`, `docs/DESIGN.md` and `docs/PLAN.md`, straight into the clone, as uncommitted changes. Nothing to copy by hand.
- Claude Code commits them at the start of its next session, after reading the diff (CLAUDE.md, "Start of every session").
- Before asking Claude chat for doc changes, make sure Claude Code has committed and pushed its own work, so the two never edit the same file at once. Claude chat checks each file has not changed since it last read it before writing.

## Decisions reserved for James

Principles. Claude Code must ask, not decide.

| Id | Decision | Status |
|---|---|---|
| D1 | First watchlist: which companies | Open. Default: 20 to 50 Companies House companies in one sector you know |
| D2 | Consensus threshold | **Decided:** 75%, rounded up, minimum 4 nodes |
| D3 | Who qualifies for the genesis signer list, and how that is decided | Open. Default: genesis-curated, forkable, criteria published |
| D4 | Open source from day one | **Decided:** yes |
| D5 | No VDS fees or revenue | Open. Default: yes |
| D6 | Relational schema base | Open. Default: FollowTheMoney |
| D7 | Licences | **Decided:** Apache 2.0 for code, CC0 for network-generated records, source data under its own licence |
| D8 | Personal data position | **Decided:** full history, allowlist at ingestion, names leave no permanent trace (current names only, from the name store), registered office as locality plus hash, company names in full, withdrawal only on a legal order (DESIGN.md section 8) |

## Phase status

| Phase | What | Status |
|---|---|---|
| 0 | Repo setup and design review | Scaffold and 0b done; 0c next (v2.2 docs already in the clone, uncommitted) |
| 1 | One node, one source, deterministic pulls (company profiles) | Not started |
| 2 | Signing and manifest logs | Not started |
| 3 | Four nodes, witnessing and consensus | Not started |
| 4 | Officers, PSCs and the relational layer | Not started. Legal view before individual records go public |
| 5 | Genesis front end | Not started |
| 6 | Anchoring and archival | Not started |
| 7 | VDS prototype | Not started |
| 8 | Sampling (design only, until about 25 nodes) | Not started |
| 9 | Revise White Paper and Technical Specification (Claude chat, not Claude Code) | Not started |

---

## Phase 0. Repo setup and design review

Scaffold done by Claude Code on 8 October 2026. Its first design review was settled in Claude chat and produced DESIGN.md v2.1 (applied in 0b). Its second review, from 0b step 2, produced DESIGN.md v2.2 (applied in 0c).

**Status, 8 October 2026 (Phase 0)**

- [x] `DESIGN.md` and `PLAN.md` moved from the repo root into `docs/`
- [x] Folder skeleton from DESIGN.md section 2, with a README in each folder
- [x] `package.json` (ES modules, no dependencies, no build step) and a layout test in `tests/`
- [x] `.github/workflows/test.yml`: Node's built-in test runner on every push, Node 24
- [x] Committed as "Scaffold protocol repo" and pushed. First CI run green
- [x] Design review delivered in the session
- [x] James takes the design review to Claude chat and settles the substantive points
- [x] DESIGN.md updated with the outcome (v2.1), and the Phase 0 decisions added to its decision log (done in 0b)

**Status, 8 October 2026 (Phase 0b)**

- [x] New CLAUDE.md, DESIGN.md v2.1 and PLAN.md v2.1 copied in
- [x] Phase 0 checklist recovered and merged above; Phase 0 decisions moved into the DESIGN.md decision log
- [x] Consistency check of DESIGN.md v2.1 against the Phase 0 review delivered in the session
- [x] LICENSE (Apache 2.0, unmodified text) and NOTICE ("Copyright 2026 N-ought")
- [x] DATA-LICENCE.md (CC0 1.0 for network-generated records; source data under its own licence)
- [x] `config/watchlist.json` (`version` 0, empty `entries`), checked by the layout test
- [x] Committed as "Apply Phase 0 review outcomes" and pushed. CI green; GitHub detects the licence as Apache-2.0
- [x] James takes the open points from the consistency check to Claude chat (settled: DESIGN.md v2.2)

### Phase 0c. Apply second review outcomes

From here on, Claude chat writes doc updates straight into the local clone (see "How docs reach the repo"). The v2.2 files are already in the clone as uncommitted changes, with your 0b checklists and decision log entries merged in.

**You do first**

Nothing. Paste Prompt 0c.

**Prompt 0c**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. Claude chat has written v2.2 of all three into the working tree as uncommitted changes, with your 0b checklists and decision log entries merged in.

1. Run git status and git diff on CLAUDE.md and docs/. Confirm nothing from your earlier checklists or decision log entries was lost. If anything was, restore it and tell me what.
2. Check DESIGN.md v2.2 against both of your design reviews (Phase 0 and 0b step 2). For each item, state in one line whether it is resolved and in which section. List anything still unresolved or newly introduced. Do not edit DESIGN.md beyond step 1.
3. Add config/adapters.json with a version field (integer, starting at 0) and an empty map of adapter versions, and add it to the layout test.
4. Commit with the message "Apply second review outcomes" and push.
5. Tick the Phase 0c checklist below, update the Phase 0 status row, then tell me what to check and paste your step 2 results in full.
```

**Status (Phase 0c)**

- [ ] Claude chat's v2.2 docs reviewed and committed
- [ ] Consistency check of DESIGN.md v2.2 against both reviews delivered
- [ ] `config/adapters.json` added and checked by the layout test
- [ ] Committed as "Apply second review outcomes" and pushed. CI green
- [ ] James takes any open points from the consistency check to Claude chat

**Done when**

- CI is green and config/adapters.json exists.
- Nothing from the earlier checklists or decision log is lost.
- You have brought Claude Code's step 2 results back to Claude chat if anything is unresolved.

**Model:** Opus.

---

## Phase 1. One node, one source, deterministic pulls

Scope: Companies House **company profiles only**. Profiles are single records with their own etag. They can still hold personal data (a registered office that is someone's home, a person's name inside a company name), so the company-data rules in DESIGN.md section 8 apply from the start. Officers and PSCs come in Phase 4.

**You do first**

1. Register for a free Companies House API key at developer.company-information.service.gov.uk (create an application, choose a REST API key).
2. Have D1 in mind. Claude Code will ask for the company numbers.

**Prompt 1**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 1. Scope is Companies House company profiles only.

Build Phase 1 inside this repo. It moves into the node template in Phase 3.

1. Ask me for the watchlist (decision D1) and save it to config/watchlist.json with a version. Offer to help me choose if I have not decided.
2. Build a Companies House adapter in adapters/companies-house for the company profile resource. Per DESIGN.md section 3: one record per company, keyed by company number; version key = the profile's etag. Confirm from the live API that the etag field exists and behaves as a version marker. If it does not, stop and tell me. Give the adapter a version and pin it in config/adapters.json.
3. Field allowlist per DESIGN.md section 8, company data: the registered office address is published only as locality, postcode district and country, with the full address object, exactly as the source provides it, kept as a SHA-256 hash. Company names and previous company names are published in full. List every published field in the adapter's documentation.
4. Canonicalisation in lib/ per DESIGN.md section 3: RFC 8785, fixed documented transform order, every transform listed with its reason, fail loudly on integers above 2^53.
5. Keep the raw response. Compute SHA-256 of the canonical bytes and of the raw bytes. Write data files under data/ and round records under log/, so the Phase 3 split into a log repo and a data repo is mechanical.
6. Write a round record every run (an unsigned precursor of the Phase 2 manifest) listing, per record: record id, version key, adapter version, canonical hash, raw hash, retrieval time, plus the watchlist and adapters config versions.
7. A scheduled GitHub Actions workflow, daily at a fixed minute, that runs the adapter. The round record is committed every run. Raw and canonical files change only when data changes. Read the API key from a repository secret named CH_API_KEY and walk me through setting it.
8. Stay well inside 600 requests per 5 minutes.
9. Confirm and record the licence and attribution terms for Companies House data in docs/DESIGN.md.
10. Tests: identical input bytes give identical hashes; transforms apply in order; a changed field changes the canonical hash; an over-large integer fails loudly; no full registered office address appears in any published file.

Do not build signing or consensus yet. Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- Two runs against unchanged data produce identical hashes, no change to raw or canonical files, and one new round record each.
- The version key behaviour is confirmed against the live API.
- The field allowlist, transform list and licence terms are documented.
- No full registered office address appears in any published file.

**Model:** Sonnet.

---

## Phase 2. Signing and manifest logs

**You do first**

Nothing. Claude Code will generate the key on your machine and walk you through storing it.

**Prompt 2**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 2. DESIGN.md sections 4, 6 and 7 are the specification.

1. Before building anything, confirm that SSHSIG signatures (ssh-keygen -Y sign) can be verified both with stock OpenSSH and in a browser, using WebCrypto Ed25519 or a small, maintained library. If browser verification is not practical, propose the alternative with trade-offs and stop for my decision.
2. Turn the round record into the signed round manifest in DESIGN.md section 4: sequence number, previous manifest hash, protocol version, node id, signer list version, watchlist and adapters config versions, per-record entries (including adapter version and first_seq), and an empty peer checkpoints list for now.
3. Manifest log: after each append, compute the RFC 6962 Merkle root over all manifest hashes in sequence order and publish a signed checkpoint (node id, tree size, root hash). Evaluate the C2SP checkpoint format and record the decision.
4. Sign manifests and checkpoints with Ed25519, using a namespace per object type. Configure git SSH commit signing in the workflow with the same key.
5. Generate the key on my machine with ssh-keygen. Never print, log or commit the private key. Store it as a repository secret named NODE_SIGNING_KEY, using the gh CLI if available, otherwise walk me through the GitHub web interface.
6. Create signers/genesis.json (canonical, fields per DESIGN.md section 6, including a retired keys list) and a script that generates signers/genesis.allowed_signers from it, with a test that fails if they disagree. Signer list version per DESIGN.md section 6: SHA-256 of the RFC 8785 form of the sorted node ids and keys only. Mark this node independence: none.
7. Verify commands in lib/: verify a manifest or checkpoint against a signer list, honouring retired keys and their sequence ranges; verify that a later checkpoint is consistent with an earlier one.
8. Tests: a valid manifest verifies; one changed byte fails; an unlisted key fails; a rewritten earlier manifest makes the consistency check fail; editing node metadata leaves the signer list version unchanged; a rotated key still verifies manifests from its sequence range.

Update docs/PLAN.md and the decision log, then tell me what to check, including the exact ssh-keygen command I can run to verify a manifest myself.
```

**Done when**

- `ssh-keygen -Y verify` with the allowed_signers file validates a real manifest.
- A tampered manifest fails, and a rewritten history fails the consistency check.
- No private key appears anywhere in the repo or CI logs.

**Model:** Opus.

---

## Phase 3. Four nodes, witnessing and consensus

Four nodes because D2 sets a minimum of 4: with q = 3, one silent or one bad node is tolerated.

**You do first**

1. Have a free GitLab account ready.
2. Register three more Companies House API applications, so each of the four nodes has its own key.

**Prompt 3**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 3. DESIGN.md sections 4, 5 and 6 are the specification.

1. Shared library first: consensus derivation per DESIGN.md section 5. Fixed N from the signer list, minimum 4, q = ceil(0.75 x N), first-vote counting by sequence order, record equivocation flagged, accepted / disputed / unresolved exactly as defined, provisional versus final from witnessed status. Pure functions, no network calls.
2. Unit tests with fixtures for: all agree; one node silent (still accepted); one node votes a different hash (still accepted); two nodes disagree with two others (disputed); a node attests two hashes for one key (first vote counts, flagged); a manifest not yet witnessed (provisional); signer list with 3 nodes (refused); outcomes never reverse as manifests arrive; an adapter upgrade creates new keys without equivocation; a short-lived version that only two nodes saw stays unresolved; votes from before a metadata-only signer list edit still count.
3. Witnessing per DESIGN.md section 4: when fetching a peer's log, check consistency with the last checkpoint recorded for it, include its checkpoint in the next manifest's peer checkpoints, and record log equivocation evidence if inconsistent. A manifest is witnessed once q - 1 other nodes cover it.
4. Consensus state per DESIGN.md section 5: consensus/state.json with final outcomes and the exact inputs, consensus/root.txt as a Merkle root over sorted entries, and the per-record index.
5. Turn the workflow into node-template/ with setup instructions. Each node is two repos per DESIGN.md section 2: a log repo (manifests, checkpoints, consensus state, index; never rewritten) and a data repo (raw and canonical data). Setting up a node should be: create both repos from the template, add two secrets, add the public key and repo URLs to genesis.json. Include a GitLab CI equivalent.
6. Walk me through creating four nodes from the template: nodes 1 to 3 on GitHub and node 4 on GitLab, each with its log repo and data repo (for example npn-node-1-log and npn-node-1-data). All four independence: none. The protocol repo stops running pulls itself once these are live.
7. A compare tool that fetches every listed node's consensus state and reports, separately, "different inputs" and "different result for the same inputs".
8. Run three live fault tests and show me the results: edit one signed manifest by hand (signature fails everywhere); force-push a rewritten history on one node (peers record log equivocation evidence); make one node attest a wrong hash (the other three still reach accepted).

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- Four nodes, one on GitLab, produce identical consensus roots whenever their inputs match.
- All three fault tests behave as specified.

**Model:** Opus for the consensus library and witnessing, Sonnet for the template and node setup.

---

## Phase 4. Officers, PSCs and the relational layer

**Gate:** before any record about an individual is published, take a legal view on lawful basis under UK GDPR and on the Gender Recognition Act point (DESIGN.md section 8). The build and tests can run before that, with publishing switched off.

**You do first**

Confirm D6. Default is FollowTheMoney.

**Prompt 4**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 4. DESIGN.md sections 3, 8 and 9 are the specification. Build with publishing of individual records switched off by a config flag. Ask me before switching it on.

1. Extend the Companies House adapter to officers and persons with significant control. One record per officer appointment and per PSC, keyed by the source's own identifier. Version key: the item's own etag if present; if list items have none, use the item-level endpoint where one exists, checked against the rate limit; otherwise the list etag. All pages of one list must carry the same list etag, or retry. Bump the adapter version in config/adapters.json.
2. Personal data per DESIGN.md section 8:
   - Corporate PSCs are published like company data.
   - For individuals, process only the allowlisted fields. The record part (role or nature of control, dates, Companies House identifier) is canonicalised, hashed, voted on, stored in the data repo and published with full history, like company data.
   - Names never go into the log repo or data repo in any form, including hashes.
   - Each run, publish a name store per node: current names plus a signed name attestation per individual (node id, source, record id, version key, name hash). Deploy it from a CI artifact (GitHub Pages, and the GitLab Pages equivalent), regenerated every run and never committed. Set artifact retention to 1 day. Serve it with robots exclusion and no-archive headers.
   - Raw responses of person records are not retained. Record their raw hash only.
   - A manual withdrawal command for legal orders only: rewrites the node's data repo to remove a named content file, appends a published withdrawal record to the log, and never touches the log repo. Document the limits from DESIGN.md section 8 in the command's help text.
3. Fetch the current FollowTheMoney schema from the official followthemoney project and pin the version.
4. Map accepted records to FtM: Company, LegalEntity, Person, Directorship, Ownership. Link entities across companies only by identifiers Companies House provides. No name matching.
5. Where a source category does not map cleanly (for example some PSC nature-of-control values), hold it unmapped, log it and list it in docs/DESIGN.md. Do not force it into the nearest type.
6. Mapping output alongside the records, deterministic and versioned, with the mapping version in the output.
7. Tests: same input gives byte-identical output; unmappable records held and logged; no edge without a declared source field; no field outside the allowlist ever appears in published content; no individual's name or name hash appears in any committed file; after a name change, the old name and its attestations are gone from the next name store; old versions of the record part stay verifiable; a name is shown only when q listed nodes' attestations agree; a legal-order withdrawal leaves the log repo untouched and consistent for peers.

Update docs/PLAN.md and the decision log, then tell me what to check and list every held-back category for my review.
```

**Done when**

- Paging and version keys behave correctly on real lists.
- No address, date of birth, individual's name or name hash appears in any committed file.
- A simulated name change leaves no trace of the old name anywhere NPN publishes, with full role history intact.
- A test legal-order withdrawal leaves the log repo untouched and consistent for peers.
- You have reviewed the held-back list.

**Model:** Opus for the personal data layer, Sonnet for the mapping.

---

## Phase 5. Genesis front end

**You do first**

Nothing until 5a returns. Then review the prose description before any HTML is written.

**Prompt 5a**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 5.

Before writing any HTML, write docs/FRONTEND.md covering each view: institution search and profile, relationship explorer, timeline, comparison. For each view state what it shows, what it explicitly does not show, how every data point links to its manifest entry, signatures and raw source, how provisional, unresolved and disputed are displayed, and how the ?signers=<url> parameter changes what counts. Describe light mode and audit mode per DESIGN.md section 11. Base the views on NPN Technical Specification section 07, minus anything that needs a server. Stop for my review.
```

**Prompt 5b** (after you approve FRONTEND.md)

```
Read CLAUDE.md, docs/DESIGN.md, docs/PLAN.md and docs/FRONTEND.md. We are on Phase 5b.

1. Build the front end in site/ as static HTML, CSS and JavaScript, published with GitHub Pages from this repo.
2. Light mode by default and audit mode on request, per DESIGN.md section 11, using lib/ for every check. Light mode uses the index only to locate manifests and verifies each node's first vote through the signed first_seq. Names come from name store attestations, shown only when q listed nodes agree. The front end never trusts an unsigned or precomputed result.
3. Accept ?signers=<url> for an alternative signer list. Default to signers/genesis.json.
4. Every data point links to its manifest entry, node signatures and raw source record (subject to DESIGN.md section 8 for individuals).
5. Every view has shareable URL state.
6. Design system: background #070810, accent #4a9eff, secondary #1a2a7a, Courier New monospace throughout, the Ø mark in Georgia serif only, #2a3860 for uppercase micro-labels, #7a8faa for readable prose. No em dashes in any text.
7. No inference, per CLAUDE.md: no ranking, scoring, risk colours or prominence weighting.
8. Check CORS for each node host. If a host blocks browser fetches, propose a fix that keeps signature verification in the browser, and stop for my decision.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- The site shows only data it has verified itself, with provisional and final clearly distinguished.
- Pointing ?signers at a list including the wrong-hash test node still shows the record as accepted with that node's dissent visible.
- Viewing the source shows no ranking or scoring logic.

**You do after:** optionally point `npn.n-ought.com` at the Pages site through Ionos DNS. Claude Code can give you the exact records.

**Model:** Sonnet to build, Opus to review.

---

## Phase 6. Anchoring and archival

**Prompt 6**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 6. DESIGN.md section 12 is the specification.

1. Timestamp each new manifest log checkpoint and consensus root with OpenTimestamps in the node workflow. Store proofs next to what they prove, and add a later job that upgrades pending proofs.
2. Walk me through connecting the protocol repo and node repos to Zenodo's GitHub integration, and add a monthly release workflow that snapshots manifest logs, record data and consensus states. The name store and raw responses of person records are never included, per DESIGN.md section 8.
3. Write docs/VERIFY.md: how anyone can check a record end to end, from raw source to manifest signature, log consistency, witnessing, consensus root and external timestamp, using only standard tools.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- Every checkpoint and consensus root has a timestamp proof.
- The first Zenodo release exists with a DOI.
- You can follow VERIFY.md yourself without help.

**Model:** Sonnet, or Haiku for the release workflow.

---

## Phase 7. VDS prototype

**You do first**

Choose the test institution. The White Paper requires node operators to integrate their own data before verifying others, so the natural first test is N-ought submitting its own data. A clearly labelled fictional test institution also works.

**Prompt 7**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 7. DESIGN.md section 10 is the specification.

1. A payload schema based on NPN Technical Specification section 03, with the fields it lists, plus the signer list version the payload targets. Personal fields follow DESIGN.md section 8. Propose how individual funders in Category C are recorded by category and band without naming private individuals, and stop for my decision.
2. A small submission tool that builds, validates and signs a payload with the institution's Ed25519 key and commits it to the institution's own public repo. Create a test institution repo and walk me through it.
3. A VDS source adapter so nodes pull institution repos like any other source, witness their history as in DESIGN.md section 4, and record first-seen time.
4. Node verification: schema, internal consistency, signature, and cross-reference against the public data layer where a field has a public counterpart. Each node signs accept or reject with structured reasons.
5. The counting rules from DESIGN.md section 5, with rejection final as soon as acceptance is impossible.
6. Equivocation detection and the correction chain, per DESIGN.md section 10.
7. Front end: VDS-sourced data marked as such, the gap between public data and VDS data visible, correction history shown.
8. Tests for every rule above, including an equivocating institution, a rewritten institution history, and a correction that supersedes an accepted entry.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- A test submission is accepted by the four test nodes and shows on the front end.
- An equivocating submission is rejected and published.
- A correction supersedes without deleting the original.

**Model:** Opus.

---

## Phase 8. Sampling (design only for now)

Not needed until the genesis signer list passes about 25 nodes. When it does: fixed sample size per item, 75% threshold within the sample, sample drawn from drand plus item hash plus signer list version (DESIGN.md section 13). Design in Claude chat first, then hand the build to Claude Code.

## Phase 9. Revise the White Paper and Technical Specification

Claude chat, not Claude Code. Update both documents to the git-native architecture, using DESIGN.md section 14 as the change list. Also fix the existing inconsistency: the White Paper says failed submissions are "held", which contradicts the Technical Specification's no-holding-state rule.

---

## Model allocation summary

| Work | Model |
|---|---|
| Design checks, signing and logs, consensus and witnessing, personal data layer, VDS | Opus |
| Adapters, templates, mapping, front end build, anchoring | Sonnet |
| Release workflows, doc and status updates | Haiku |
