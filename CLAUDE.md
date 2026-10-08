# CLAUDE.md

Standing instructions for Claude Code in this repository.

## Read first, every session

1. `docs/DESIGN.md` - architecture, consensus rules and decision log.
2. `docs/PLAN.md` - find the current phase, its prompt and its acceptance checks.

Do not rely on memory of earlier sessions. These two files are the source of truth. If something you remember conflicts with them, the files win.

## Start of every session

Claude chat writes updates to `CLAUDE.md`, `docs/DESIGN.md` and `docs/PLAN.md` straight into this working tree, uncommitted. Before any other work:

1. Run `git status`. If any of those three files changed and you did not change them, Claude chat did.
2. Read the diff. Check that nothing you added earlier (checklists, decision log entries) was lost. Restore anything that was, and tell the user.
3. Commit them on their own with the message "Docs from Claude chat: <one-line summary>", then carry on.

Claude chat never writes any other file. If anything else changed unexpectedly, stop and tell the user.

## What this project is

NPN (N-ought Provenance Network), git-native build. Independent nodes pull the same public data, sign what they observed and publish it to their own repos. Anyone can derive consensus from the signed observations. The network verifies provenance, not truth, and never interprets.

## Hard rules

- **No inference, anywhere.** No scores, rankings, risk colours, prominence weighting, derived or inferred connections, or "significance" labels. Store and display only what a source declared and what nodes observed.
- **No entity resolution beyond identifiers the source itself provides.** No fuzzy name matching, ever.
- **Personal data, per `docs/DESIGN.md` section 8.**
  - Only allowlisted fields about individuals are ever processed. Never publish an individual's address, date of birth or Companies House personal code.
  - Never write an individual's name, or any hash of it, to a log repo or data repo. Current names exist only in the name store, which is never committed and never archived.
  - Raw responses of person records are not retained. Record their raw hash only.
  - Company registered office addresses are published only as locality, postcode district and country, with the full address kept as a hash.
- **Every transform is published.** Canonicalisation and schema mapping must be deterministic, documented in this repo, versioned, and keep the raw response alongside the transformed output, except raw responses of person records (see above).
- **Never rewrite a log repo.** Data repos are rewritten only for a legal order, following `docs/DESIGN.md` section 8.
- **Never commit secrets.** Private keys and API keys live only in CI secrets or on the operator's machine. Check the diff before every commit.
- **One consensus library.** Nodes and the front end use the same shared library for canonicalisation, hashing, signature checks and consensus. Never duplicate that logic.
- **Determinism.** The same input bytes must give the same hashes on any machine. Add a test whenever you touch canonicalisation, hashing, signing or consensus.
- **Plain JavaScript ES modules, no build step,** unless `docs/DESIGN.md` records a decision otherwise.
- **The user has no local Python install.** Do not assume local Python. Prefer running tests in CI. Ask before installing anything on the user's machine.

## Decisions you must not make

Anything listed under "Decisions reserved for James" in `docs/PLAN.md`. Stop and ask. Method and implementation choices are yours: make them, then record them in the decision log.

## Writing style for docs, commit messages and UI text

- British spelling.
- No em dashes. Use commas, hyphens, colons or full stops.
- Plain, clinical register. No marketing language.

## End of every session

1. Update the phase status and checklist in `docs/PLAN.md`.
2. Add every decision you made to the decision log in `docs/DESIGN.md`, with the date and a one-line reason.
3. Tell the user in plain words: what changed, what to check, and which prompt comes next.
4. List anything that needs the user's decision rather than deciding it yourself.
