# config

Shared, versioned configuration that every node reads.

- `watchlist.json`: the one shared watchlist (DESIGN.md section 6). Every node pulls every record on it, and each manifest records the watchlist version it used. The entry format is set in Phase 1, when the first companies are added (decision D1).
