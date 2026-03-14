# Contributing to MnemeBrain TypeScript SDK

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 18
- npm >= 9

### Install

```bash
git clone https://github.com/mnemebrain/mnemebrain-ts.git
cd mnemebrain-ts
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# Integration tests (requires running backend)
npm run test:integration

# E2E tests (requires running backend)
npm run test:e2e
```

### Type Check

```bash
npm run typecheck
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commits must follow this format:

```
type(scope): description
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`

**Examples:**

```
feat(client): add batch believe operation
fix(sandbox): handle timeout on fork
docs: update README quickstart
test(e2e): add working memory workflow test
```

Commit messages are enforced via commitlint + husky.

## Pull Request Process

1. Fork the repo and create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass: `npm test`
4. Ensure types check: `npm run typecheck`
5. Ensure build succeeds: `npm run build`
6. Open a PR with a clear description of the change

## Code Style

- TypeScript strict mode is enabled
- All public functions and classes need JSDoc comments
- Export types explicitly via `src/index.ts`
- Use `snake_case` for API payloads, `camelCase` for TypeScript interfaces

## Running Against the Backend

For integration/E2E tests, start the MnemeBrain backend:

```bash
cd ../backend
uv sync --extra dev
MNEMEBRAIN_API_TOKEN=test-token uv run python -m mnemebrain
```

Then in another terminal:

```bash
MNEMEBRAIN_E2E=1 npm run test:e2e
MNEMEBRAIN_INTEGRATION=1 npm run test:integration
```

## Reporting Issues

Use GitHub Issues with the provided templates. Include:

- SDK version
- Node.js version
- Minimal reproduction steps
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
