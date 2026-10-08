# mapping

The FollowTheMoney (FtM) mapping, built in Phase 4 (subject to decision D6).

It is a published, versioned, deterministic transform from accepted source records to FtM entities. Edges come only from declared relational fields. No name matching and no inferred connections. Records that do not map cleanly are held unmapped and logged, not forced into the nearest type.
