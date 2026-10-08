# signers

Signer lists. Readers choose which list counts, and any list can be forked.

The genesis list, created in Phase 2:

- `genesis.allowed_signers`: public keys in OpenSSH `allowed_signers` format, so anyone can verify with `ssh-keygen -Y verify`.
- `genesis.json`: node metadata (node id, operator, public key, repo URL, hosting platform, CI or automation platform, operating system, conflict disclosure, independence status).

Public keys only. Private keys never go in this repo.
