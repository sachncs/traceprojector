# Contributing to traceprojector

Thank you for helping. The full walkthrough, from a fresh clone to a merged
change, is the [developer guide](docs/developer-guide.md); this page is the
summary.

## The loop

```bash
git checkout -b fix/my-change     # branch from master
npm install
npm test                          # the fast suite, about 15 seconds
# ... change code, add a test that fails without the change ...
npm run lint:fix
npm run verify                    # what the CI test jobs run
```

Then open a pull request against `master`. It needs the four required checks
(`test (24)`, `test (26)`, `validate`, `web`) to pass.

## What a good change looks like

- **A test that fails without it.** For a bug fix, name the test after the bug.
- **Evidence, not assertion.** If you change what an operator guarantees, show
  the number: the validation tests (`npm run validate`) have tolerances that
  were fixed before the first run and are not loosened to turn a test green. If
  one must change, say why in [docs/VALIDATION.md](docs/VALIDATION.md).
- **Documentation that matches.** The site renders `docs/`, so a user-visible
  change updates the page that describes it. The examples in the getting-started
  guide and the README are executed by the validation suite.
- **Google JavaScript style**, enforced by ESLint (`npm run lint`): two-space
  indentation, 80 columns, semicolons, single quotes.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <description>`, with type one of `feat`, `fix`, `docs`,
`style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`, and the module
name as the scope (`fix(local-weights): ...`).

## Reporting bugs and asking for features

Use the issue templates in `.github/ISSUE_TEMPLATE/`. For a bug, include a
minimal reproduction, the expected and the actual behaviour, and your Node.js
version and operating system. For a question about the mathematics or the
papers, use [Discussions](https://github.com/sachncs/traceprojector/discussions).
Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking
part you agree to uphold it.
