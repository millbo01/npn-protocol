# config

Shared, versioned configuration that every node reads.

- `watchlist.json`: the one shared watchlist (DESIGN.md section 6). Every node pulls every record on it, and each manifest records the watchlist version it used. The entry format is set in Phase 1, when the first companies are added (decision D1).
- `adapters.json`: the adapter version every node must use, as a map from adapter name to version (DESIGN.md section 3). The adapter version is part of the key nodes vote on, so changing a pin is a coordinated change, like a watchlist change. Each manifest records the config version it used.
