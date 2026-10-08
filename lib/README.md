# lib

The shared library, used by nodes and by front ends. It is the only implementation of this logic; never duplicate it elsewhere. Plain JavaScript ES modules with no build step and no Node imports, so the same files run in Node and in the browser (WebCrypto for every hash and signature).

| Module | What |
|---|---|
| `canonicalise.js` | RFC 8785 canonical JSON, failing loudly on integers at or above 2^53 |
| `hash.js` | SHA-256, SHA-512 |
| `bytes.js` | Byte, base64, hex and SSH wire format helpers |
| `ed25519.js` | Ed25519 sign and verify (RFC 8032) |
| `ssh.js` | OpenSSH public key lines and unencrypted private key files |
| `sshsig.js` | SSH signatures, byte-identical to `ssh-keygen -Y sign` |
| `signed-note.js` | C2SP signed notes |
| `checkpoint.js` | C2SP checkpoints |
| `merkle.js` | RFC 6962 / 9162 tree hashes, inclusion and consistency proofs and their verification |
| `tiles.js` | C2SP tlog-tiles: building the files, and reading them back as a proof source |
| `signers.js` | Signer lists: validation, signer list version, key by sequence, allowed_signers generation |
| `manifest.js` | Round manifests: building, `first_seq`, strict parsing |
| `verify.js` | Verify a manifest, a checkpoint, log consistency and manifest inclusion against a signer list |

Consensus derivation (accepted, disputed, unresolved) arrives in Phase 3, as pure functions with no network calls.
