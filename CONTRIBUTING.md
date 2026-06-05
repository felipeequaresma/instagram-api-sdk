# Contributing

Thank you for considering a contribution. This project is maintained as a
TypeScript SDK, so changes should be small, typed, tested, and documented.

## Development Setup

```bash
git clone https://github.com/felipeequaresma/instagram-api-sdk.git
cd instagram-api-sdk
npm ci
cp .env.example .env
```

Fill `.env` only with local development values. Do not commit secrets, access
tokens, generated token files, or local environment files.

## Project Commands

```bash
npm run build
npm run type-check
npm run lint
npm test
npm run test:coverage
npm run validate
```

`npm run validate` is the required pre-merge check. It runs build, type-check,
lint, coverage, and `npm pack --dry-run`.

## Coverage Policy

The repository enforces 100 percent coverage for:

- statements
- branches
- functions
- lines

New behavior must include tests. If a change lowers coverage, the pull request
is not ready to merge.

## Pull Request Guidelines

Before opening a pull request:

- Keep the change focused on one problem.
- Add or update tests for changed behavior.
- Update README, docs, or examples when public behavior changes.
- Run `npm run validate`.
- Avoid unrelated formatting, generated files, or dependency churn.

Use a clear pull request title. The description should explain what changed, why
it changed, how it was validated, and any compatibility impact.

## Issue Guidelines

Use the issue templates in `.github/ISSUE_TEMPLATE`.

For bug reports, include:

- SDK version
- Node.js version
- operating system
- minimal reproduction
- expected behavior
- actual behavior

For feature requests, include:

- the use case
- proposed API shape if relevant
- alternatives considered
- any Instagram Graph API constraints

## Coding Standards

- Write TypeScript with strict typing.
- Follow existing module boundaries and naming.
- Prefer small functions and explicit errors.
- Do not call external APIs in unit tests.
- Mock network calls and time-dependent behavior.
- Keep public exports stable unless the change is intentionally breaking.

## Documentation Standards

Documentation should be direct and technical. Avoid marketing language,
decorative badges, or unnecessary formatting. Public API changes should update
the README and any relevant files in `docs/` and `examples/`.

## Release Process

Publishing is handled by GitHub Actions through npm Trusted Publishing. A
maintainer publishes by creating and pushing a version tag:

```bash
npm version patch
git push --follow-tags
```

The production workflow runs `npm run validate` before `npm publish`.
