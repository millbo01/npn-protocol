# tests

Tests and fixtures, run with Node's built-in test runner (`npm test`, or `node --test "tests/**/*.test.js"`). CI runs them on every push.

Test files end in `.test.js`. Fixtures go in `tests/fixtures/`. Any change to canonicalisation, hashing, signing or consensus needs a test, including determinism tests: the same input bytes must give the same hashes on any machine.
