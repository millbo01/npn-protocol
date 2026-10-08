# config

Shared, versioned configuration. Every node reads it from this repo's default branch at the start of each run. Raise `version` by one on every change.

## watchlist.json

The one shared watchlist (DESIGN.md section 6). Every node pulls every record on it, and each round record carries the watchlist version it used.

```json
{
  "version": 1,
  "entries": [
    { "source": "companies-house", "type": "company-profile", "id": "00000006" }
  ]
}
```

`id` is the 8-character Companies House company number, including leading zeros and any letter prefix (for example `SC123456`). Choosing the companies is decision D1.

## adapters.json

Which code every node runs (DESIGN.md sections 3 and 6).

```json
{
  "version": 1,
  "protocol_tag": "v0.1.0",
  "adapters": { "companies-house": 1 }
}
```

- `protocol_tag`: the tag of this repo that nodes check out and run.
- `adapters`: the adapter version that tag contains. A round stops if the pin does not match the code, so a pin cannot drift from the code that ran.

The adapter version is part of the key nodes vote on, so changing a pin is a coordinated change, like a watchlist change.
