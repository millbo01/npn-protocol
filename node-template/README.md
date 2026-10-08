# node-template

What a new node repo needs. Phase 2 version: one source (Companies House company profiles), signed manifests in a C2SP tlog-tiles log, signed checkpoints, signed commits. Phase 3 adds witnessing and consensus, completes the template, adds setup for GitLab, and adds nodes 2 to 4.

- `main/`: the contents of the node repo's `main` branch: the node workflow, `log/`, a README and `.gitattributes`.
- `data/`: the contents of the first commit on the node repo's orphan `data` branch.

The node never copies adapter code. Each run, the workflow reads `config/` from this protocol repo's default branch, checks this repo out at the pinned `protocol_tag`, and runs that code (DESIGN.md section 6).

## Setting up a node (GitHub)

Replace `OWNER` and `npn-node-N` throughout. Run from a folder outside any other git repo.

1. Create the repo and push `main`:

   ```bash
   gh repo create OWNER/npn-node-N --public --description "NPN node N"
   git clone https://github.com/OWNER/npn-node-N.git && cd npn-node-N
   cp -r /path/to/npn-protocol/node-template/main/. .
   git add -A && git commit -m "Node from template" && git push origin HEAD:main
   ```

2. Create the orphan `data` branch:

   ```bash
   git switch --orphan data
   cp -r /path/to/npn-protocol/node-template/data/. .
   git add -A && git commit -m "Data branch" && git push origin data
   git switch main
   ```

3. Protect `main` against force-push and deletion (a repository ruleset):

   ```bash
   gh api repos/OWNER/npn-node-N/rulesets --method POST --input - <<'EOF'
   {"name": "protect-main-log", "target": "branch", "enforcement": "active",
    "conditions": {"ref_name": {"include": ["refs/heads/main"], "exclude": []}},
    "rules": [{"type": "non_fast_forward"}, {"type": "deletion"}]}
   EOF
   ```

4. Add the Companies House API key as a secret. The command prompts for the value, so it never appears in your shell history:

   ```bash
   gh secret set CH_API_KEY --repo OWNER/npn-node-N
   ```

5. Generate the node signing key on the operator's machine and store it as a secret. No passphrase, because CI uses it unattended. Never print, log or commit the private key:

   ```bash
   ssh-keygen -q -t ed25519 -N "" -C npn-node-N -f ~/.ssh/npn-node-N_ed25519
   gh secret set NODE_SIGNING_KEY --repo OWNER/npn-node-N < ~/.ssh/npn-node-N_ed25519
   ```

   Then add `~/.ssh/npn-node-N_ed25519.pub` and the node's details to `signers/genesis.json` in the protocol repo, run `node runner/generate-allowed-signers.js`, and commit both files. A round refuses to sign with a key that is not the node's listed key.

6. Optional: set a node id other than the repo name with a repository variable `NODE_ID`.

7. Run once by hand: Actions tab, `npn-node`, "Run workflow". Tick "probe" to check etag behaviour without writing anything.

Each node needs its own Companies House API key: the 600 requests per 5 minutes limit is per key.
