# runner

Node-only code: what a node runs each round, and the command line tools. Everything that readers also need (canonicalisation, hashing, signatures, Merkle proofs, tiles, verification) is in `lib/`, which runs unchanged in the browser. Nodes run this folder from the protocol tag pinned in `config/adapters.json`; nothing here is copied into node repos.

| File | What it does |
|---|---|
| `round.js` | One round: collect from each adapter, write changed data, append a signed manifest, rebuild the tiles, publish a signed checkpoint. Builds and verifies everything in memory, including consistency with the previous checkpoint, before writing anything to the log |
| `log-store.js` | Reads and writes a node's `log/`. Add-only, except the latest `checkpoint` |
| `run.js` | Command line entry used by the node workflow |
| `verify.js` | Verify a manifest, a checkpoint, or a whole node log against a signer list |
| `generate-allowed-signers.js` | Regenerate `signers/genesis.allowed_signers` from `signers/genesis.json` |

```bash
node runner/verify.js manifest log/manifests/000000.json log/manifests/000000.json.sig --signers signers/genesis.json
node runner/verify.js checkpoint log/checkpoint --node npn-node-1 --signers signers/genesis.json
node runner/verify.js log path/to/node/log --node npn-node-1 --signers signers/genesis.json [--since old-checkpoint]
```
