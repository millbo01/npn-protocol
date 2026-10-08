# site

The genesis front end, built in Phase 5 and published with GitHub Pages.

Static, client-side only. The browser fetches manifests directly from node repos, verifies signatures and recomputes consensus with `lib/`. It never trusts a precomputed result. A `?signers=<url>` parameter swaps in a different signer list. No ranking, scoring, risk colours or prominence weighting.
