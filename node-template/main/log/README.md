# log

Append-only record of what this node observed.

- `rounds/`: one round record per run, in RFC 8785 canonical JSON, named by start time (UTC). Unsigned in Phase 1; Phase 2 replaces them with signed manifests and checkpoints.

Never edit or delete anything here.
