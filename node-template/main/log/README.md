# log

Append-only, signed record of what this node observed (protocol repo, `docs/DESIGN.md` section 4).

| Path | What |
|---|---|
| `manifests/NNNNNN.json` | One round manifest per run, RFC 8785 canonical JSON, numbered by sequence from 0 |
| `manifests/NNNNNN.json.sig` | SSH signature of the manifest, namespace `npn-manifest` |
| `tile/...` | The manifest log as a Merkle tree, in the C2SP tlog-tiles layout. Each log entry is the SHA-256 of one manifest file |
| `checkpoint` | Latest checkpoint: origin, tree size, root hash, as a C2SP signed note |
| `checkpoint.sshsig` | SSH signature of the checkpoint's first three lines, namespace `npn-checkpoint` |
| `checkpoints/N`, `checkpoints/N.sshsig` | Every checkpoint ever published, by tree size |
| `rounds/` | Phase 1 round records (unsigned), kept as history |

Every file here is written once and never changed, except `checkpoint` and `checkpoint.sshsig`, which always hold the latest checkpoint. Never edit or delete anything here.

## Verifying with stock OpenSSH

From a clone of this repo and of the protocol repo (`npn-protocol`):

```bash
ssh-keygen -Y verify -f npn-protocol/signers/genesis.allowed_signers -I npn-node-1 -n npn-manifest -s log/manifests/000000.json.sig < log/manifests/000000.json
head -n 3 log/checkpoint | ssh-keygen -Y verify -f npn-protocol/signers/genesis.allowed_signers -I npn-node-1 -n npn-checkpoint -s log/checkpoint.sshsig
```

The full check (sequence chain, tiles, inclusion, consistency) is `node npn-protocol/runner/verify.js log log --node npn-node-1 --signers npn-protocol/signers/genesis.json`.
