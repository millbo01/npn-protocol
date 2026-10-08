[PLAN.md](https://github.com/user-attachments/files/33192416/PLAN.md)
# NPN git-native build plan

## How to use this plan

- Work one phase at a time. Each phase has: what you do first, the prompt to paste into Claude Code, the checks that say it is done, and a suggested model.
- Every prompt starts by making Claude Code read `CLAUDE.md`, `docs/DESIGN.md` and this file, so no session depends on remembered context.
- Theory and design changes happen in Claude chat. Claude Code gets work requests only. If Claude Code flags a design problem, paste its list into Claude chat and settle it there, then update `docs/DESIGN.md`.
- Phases 0 to 6 need nobody but you. Nothing in this plan waits on outreach.

## Decisions reserved for James

Principles. Claude Code must ask, not decide.

| Id | Decision | Default if you are unsure |
|---|---|---|
| D1 | First watchlist: which institutions | 20 to 50 Companies House companies in one sector you know |
| D2 | Consensus threshold | Keep 75% |
| D3 | Who qualifies for the genesis signer list, and how that is decided | Genesis-curated, forkable, criteria published |
| D4 | Open source from day one (drops the White Paper's staged release) | Yes |
| D5 | No VDS fees or revenue (drops revenue split and treasury) | Yes |
| D6 | Relational schema base | FollowTheMoney |
| D7 | Licences for code and for published data | Code: MIT or Apache 2.0. Data: follow each source's licence |

## Phase status

| Phase | What | Status |
|---|---|---|
| 0 | Repo setup and design review | Not started |
| 1 | One node, one source, deterministic pulls | Not started |
| 2 | Signing | Not started |
| 3 | Three nodes and consensus | Not started |
| 4 | Relational layer (FollowTheMoney) | Not started |
| 5 | Genesis front end | Not started |
| 6 | Anchoring and archival | Not started |
| 7 | VDS prototype | Not started |
| 8 | Sampling (design only, until about 25 nodes) | Not started |
| 9 | Revise White Paper and Technical Specification (Claude chat, not Claude Code) | Not started |

---

## Phase 0. Repo setup and design review

**You do first**

1. Optional but recommended: create a free GitHub organisation for the network (for example `npn-network`), so the protocol repo and node repos sit together and are not under your personal account.
2. Create a new **public** repository called `npn-protocol`, with a README.
3. Clone it in the Claude desktop app (Code tab), the same way as IPF-Research.
4. Copy in the three files from this pack: `CLAUDE.md` at the root, `DESIGN.md` and `PLAN.md` into a `docs` folder.
5. Open Claude Code in that folder and paste Prompt 0.

**Prompt 0**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md in full before doing anything.

Then:
1. Review docs/DESIGN.md. List anything ambiguous, contradictory or technically unsound, one line each with the reason. Do not change DESIGN.md yet.
2. Create the folder skeleton from DESIGN.md section 2, with a short README in each folder saying what will live there.
3. Add a GitHub Actions workflow that runs the test suite on every push. An empty suite that passes is fine for now. Use plain JavaScript ES modules with Node's built-in test runner, no build step.
4. Commit with the message "Scaffold protocol repo" and push.
5. Update the Phase 0 status in docs/PLAN.md, then tell me what to check and what your design review found.
```

**Done when**

- The skeleton is committed and the CI run is green.
- You have read Claude Code's design review and brought anything substantive back to Claude chat.

**Model:** Opus (it is reviewing the design).

---

## Phase 1. One node, one source, deterministic pulls

**You do first**

1. Register for a free Companies House API key at developer.company-information.service.gov.uk (create an application, choose a REST API key).
2. Have D1 in mind. Claude Code will ask for the company numbers.

**Prompt 1**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 1.

Build Phase 1 inside this repo. It moves into the node template in Phase 3.

1. Ask me for the watchlist (decision D1) and save it as config/watchlist.json. Offer to help me choose if I have not decided.
2. Build a Companies House source adapter in adapters/companies-house covering, for each company number: company profile, officers, and persons with significant control.
3. The adapter must define and document the version key for each record type. Check the live API documentation for a version field such as etag and use it where present. Document the fallback where there is none.
4. Canonicalisation in lib/: RFC 8785 (JCS). Save raw responses alongside canonical output. Strip nothing except transport metadata, and document every transform with the reason. Transforms apply in a fixed, documented order.
5. SHA-256 of the canonical bytes.
6. A scheduled GitHub Actions workflow, daily, that runs the adapter and commits only changed files. Read the API key from a repository secret named CH_API_KEY and walk me through setting it.
7. Stay well inside 600 requests per 5 minutes.
8. Confirm and record the licence and attribution terms for Companies House data in docs/DESIGN.md.
9. Tests: identical input bytes give identical hashes; transforms apply in order; a changed field changes the hash.

Do not build signing or consensus yet. Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- Two runs against unchanged data produce identical hashes and no new commit.
- Raw responses sit next to canonical output.
- The transform list and version keys are documented.

**Model:** Sonnet.

---

## Phase 2. Signing

**You do first**

Nothing. Claude Code will generate the key on your machine and walk you through storing it.

**Prompt 2**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 2.

1. Before building anything, confirm that SSHSIG signatures (ssh-keygen -Y sign) can be verified both with stock OpenSSH and in a browser, using WebCrypto Ed25519 or a small, maintained library. If browser verification is not practical, propose the alternative with trade-offs and stop for my decision.
2. Round manifest per run, per DESIGN.md section 2 step 3: per-record entries (source id, record id, version key, canonical hash, retrieval time, adapter version), plus protocol version, node id, signer list version and the hash of the previous manifest.
3. Sign each manifest with Ed25519, namespace "npn-manifest".
4. Configure git SSH commit signing in the workflow with the same key.
5. Generate the key on my machine with ssh-keygen. Never print, log or commit the private key. Store it as a repository secret named NODE_SIGNING_KEY, using the gh CLI if available, otherwise walk me through the GitHub web interface.
6. Create signers/genesis.allowed_signers and signers/genesis.json with the fields in DESIGN.md section 4. Mark this node independence: none.
7. A verify command in lib/: given a manifest and a signer list, report valid or invalid and why.
8. Tests: a valid manifest verifies; a manifest with one changed byte fails; a manifest signed by an unlisted key fails.

Update docs/PLAN.md and the decision log, then tell me what to check, including the exact ssh-keygen command I can run to verify a manifest myself.
```

**Done when**

- `ssh-keygen -Y verify` with the allowed_signers file validates a real manifest.
- A tampered manifest fails.
- No private key appears anywhere in the repo or CI logs.

**Model:** Opus.

---

## Phase 3. Three nodes and consensus

**You do first**

1. Have a free GitLab account ready. Claude Code will walk you through creating two more node repos from the template: one on GitHub (`npn-node-test-2`) and one on GitLab (`npn-node-test-3`). GitLab tests portability and the White Paper's automation-platform diversity rule.
2. Register two more Companies House API applications so each node has its own key.

**Prompt 3**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 3.

1. Shared library first: consensus derivation per DESIGN.md section 3 (accepted, disputed, unresolved, monotonic, equivocation detection, signer list pinned). Pure functions, no network calls. Unit tests with fixtures for: all nodes agree; one node tampered; one node silent; a node attests two hashes for one key; signer list changed between rounds; nodes saw different version keys.
2. Merkle root over sorted accepted entries, RFC 6962 style, documented.
3. Turn the Phase 1 and 2 workflow into node-template/, with setup instructions, so a new node is: create a repo from the template, add two secrets, add the public key to the signer list. Include a GitLab CI equivalent of the GitHub workflow.
4. Node workflow step: after pulling and signing, fetch the other listed nodes' manifests (repo URLs from signers/genesis.json), verify them, derive consensus, write consensus/state.json (sorted) and consensus/root.txt.
5. Walk me through creating npn-node-test-2 (GitHub) and npn-node-test-3 (GitLab) from the template. Mark all three nodes independence: none.
6. A compare script that fetches every listed node's root and reports match or mismatch with detail.
7. Run a deliberate tamper test: edit one manifest on one node by hand and show that the other nodes flag it.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- Three nodes, one of them on GitLab, publish identical roots for the same data versions.
- The tamper test is flagged by the other two nodes.

**Model:** Opus for the consensus library, Sonnet for the template and node setup.

---

## Phase 4. Relational layer (FollowTheMoney)

**You do first**

Confirm D6. Default is FollowTheMoney.

**Prompt 4**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 4.

1. Fetch the current FollowTheMoney schema definitions from the official followthemoney project. Pin the version you use.
2. Map accepted Companies House entries to FtM entities: companies to Company, officers to Person plus Directorship, persons with significant control to Person or LegalEntity plus Ownership or the closest declared relationship type.
3. Use only identifiers Companies House itself provides to link entities across companies. No name matching, no fuzzy resolution.
4. Where a source category does not map cleanly (for example some PSC nature-of-control values), hold it unmapped, log it, and list it in docs/DESIGN.md. Do not force it into the nearest type.
5. Output mapped entities alongside raw records. The mapping is deterministic and versioned, and its version is recorded in the output.
6. Tests: the same input gives byte-identical output; unmappable records are held and logged; no edge exists without a declared source field.

Update docs/PLAN.md and the decision log, then tell me what to check and list every held-back category for my review.
```

**Done when**

- Mapping output is deterministic.
- Every edge traces to a declared source field.
- You have reviewed the held-back list.

**Model:** Sonnet.

---

## Phase 5. Genesis front end

**You do first**

Nothing until 5a returns. Then review the prose description before any HTML is written.

**Prompt 5a**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 5.

Before writing any HTML, write docs/FRONTEND.md covering each view: institution search and profile, relationship explorer, timeline, comparison. For each view, state what it shows, what it explicitly does not show, how every data point links to its manifest entry, signatures and raw source, and how the ?signers=<url> parameter changes what counts. Base the views on the NPN Technical Specification section 07 front end, minus anything that needs a server. Stop for my review.
```

**Prompt 5b** (after you approve FRONTEND.md)

```
Read CLAUDE.md, docs/DESIGN.md, docs/PLAN.md and docs/FRONTEND.md. We are on Phase 5b.

1. Build the front end in site/ as static HTML, CSS and JavaScript, published with GitHub Pages from this repo.
2. The browser fetches manifests directly from node repos, verifies signatures, and computes consensus with lib/. The front end never trusts a precomputed result.
3. Accept ?signers=<url> for an alternative signer list. Default to signers/genesis.json.
4. Every data point links to its manifest entry, node signatures and raw source record.
5. Every view has shareable URL state.
6. Design system: background #070810, accent #4a9eff, secondary #1a2a7a, Courier New monospace throughout, the Ø mark in Georgia serif only, #2a3860 for uppercase micro-labels, #7a8faa for readable prose. No em dashes in any text.
7. No inference, per CLAUDE.md: no ranking, scoring, risk colours or prominence weighting.
8. Check CORS for each node host. If a host blocks browser fetches, propose a fix that keeps signature verification in the browser, and stop for my decision.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- The site shows only data it has verified itself.
- Pointing ?signers at a list containing the tampered test node shows the affected records as disputed.
- Viewing the source shows no ranking or scoring logic.

**You do after:** optionally point `npn.n-ought.com` at the Pages site through Ionos DNS. Claude Code can give you the exact records.

**Model:** Sonnet to build, Opus to review.

---

## Phase 6. Anchoring and archival

**Prompt 6**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 6.

1. Timestamp each new consensus root with OpenTimestamps in the node workflow. Store the proof next to the root, and add a later job that upgrades pending proofs.
2. Walk me through connecting this repo to Zenodo's GitHub integration, and add a monthly release workflow that snapshots consensus state so each release gets a DOI.
3. Write docs/VERIFY.md: how anyone can check a record end to end, from raw source to manifest signature to consensus root to external timestamp, using only standard tools.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- Every consensus root has a timestamp proof.
- The first Zenodo release exists with a DOI.
- You can follow VERIFY.md yourself without help.

**Model:** Sonnet, or Haiku for the release workflow.

---

## Phase 7. VDS prototype

**You do first**

Choose the test institution. The White Paper requires node operators to integrate their own data before verifying others, so the natural first test is N-ought submitting its own data. A clearly labelled fictional test institution also works.

**Prompt 7**

```
Read CLAUDE.md, docs/DESIGN.md and docs/PLAN.md. We are on Phase 7. DESIGN.md section 7 is the specification.

1. A payload schema based on NPN Technical Specification section 03, with the fields it lists, plus the signer list version the payload targets.
2. A small submission tool that builds, validates and signs a payload with the institution's Ed25519 key and commits it to the institution's own public repo. Create a test institution repo and walk me through it.
3. A VDS source adapter so nodes pull institution repos like any other source and record first-seen time.
4. Node verification: schema, internal consistency, signature, and cross-reference against the public data layer where a field has a public counterpart. Each node signs accept or reject with structured reasons.
5. The monotonic thresholds from DESIGN.md section 3, with rejection final as soon as acceptance is impossible.
6. Equivocation detection and the correction chain, per DESIGN.md section 7.
7. Front end: VDS-sourced data marked as such, the gap between public data and VDS data visible, correction history shown.
8. Tests for every rule above, including an equivocating institution and a correction that supersedes an accepted entry.

Update docs/PLAN.md and the decision log, then tell me what to check.
```

**Done when**

- A test submission is accepted by the three test nodes and shows on the front end.
- An equivocating submission is rejected and published.
- A correction supersedes without deleting the original.

**Model:** Opus.

---

## Phase 8. Sampling (design only for now)

Not needed until the genesis signer list passes about 25 nodes. When it does: fixed sample size per item, 75% threshold within the sample, sample drawn from drand plus item hash plus signer list version (DESIGN.md section 9). Design in Claude chat first, then hand the build to Claude Code.

## Phase 9. Revise the White Paper and Technical Specification

Claude chat, not Claude Code. Update both documents to the git-native architecture, using DESIGN.md section 10 as the change list. Also fix the existing inconsistency: the White Paper says failed submissions are "held", which contradicts the Technical Specification's no-holding-state rule.

---

## Model allocation summary

| Work | Model |
|---|---|
| Design review, signing, consensus library, VDS | Opus |
| Adapters, templates, mapping, front end build, anchoring | Sonnet |
| Release workflows, doc and status updates | Haiku |
