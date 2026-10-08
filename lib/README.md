# lib

The shared library, used by nodes and by front ends. It is the only implementation of:

- canonicalisation (RFC 8785, JSON Canonicalization Scheme, plus the published per-source transforms)
- hashing (SHA-256 of canonical bytes)
- signing and signature verification (Ed25519, SSHSIG)
- consensus derivation (accepted, disputed, unresolved)
- Merkle root construction (RFC 6962 style)

Plain JavaScript ES modules with no build step, so the same files run in Node and in the browser. Pure functions where possible, with no network calls in the consensus code. Never duplicate this logic elsewhere.
