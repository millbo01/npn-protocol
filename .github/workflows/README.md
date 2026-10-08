# .github/workflows

GitHub Actions workflows for this repo.

- `test.yml`: runs the test suite on every push.

Scheduled node workflows (pull, sign, derive consensus) live in `node-template/`, not here. Secrets are read from repository secrets and never written to logs.
