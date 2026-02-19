# Contributing to CoralSwap SDK

Thank you for your interest in contributing. This document covers the setup, standards, and process for contributing to the CoralSwap TypeScript SDK.

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Git** with commit signing recommended

## Local Setup

```bash
git clone https://github.com/CoralSwap-Finance/coralswap-sdk.git
cd coralswap-sdk
npm install
npm run build
npm test
```

## Project Structure

```
src/
  client.ts          -- Main SDK entry point (CoralSwapClient)
  config.ts          -- Network configs and defaults
  errors.ts          -- Typed error hierarchy
  index.ts           -- Public API barrel exports
  contracts/         -- Contract client bindings
    factory.ts       -- FactoryClient
    pair.ts          -- PairClient
    router.ts        -- RouterClient
    lp-token.ts      -- LPTokenClient
    flash-receiver.ts -- FlashReceiverClient
  modules/           -- High-level protocol interaction modules
    swap.ts          -- Swap quoting and execution
    liquidity.ts     -- LP position management
    flash-loan.ts    -- Flash loan building
    fees.ts          -- Dynamic fee queries
    oracle.ts        -- TWAP oracle queries
  types/             -- TypeScript type definitions
  utils/             -- Utility functions (amounts, addresses, retry, simulation)
tests/               -- Jest unit tests
```

## Coding Standards

- All code must pass `npm run lint` (ESLint with TypeScript rules)
- All code must compile with `npm run build` (strict TypeScript)
- Use `bigint` for all token amounts -- never `number`
- Use typed errors from `src/errors.ts` -- never raw `throw new Error()`
- All public functions and classes must have JSDoc comments
- Prefer `async/await` over raw Promises
- No `any` types -- use `unknown` and narrow with type guards

## Commit Messages

Use conventional commits in past active voice:

```
feat(swap): implemented multi-hop routing logic
fix(client): resolved RPC timeout on slow networks
test(oracle): added TWAP calculation edge-case tests
docs(readme): updated installation instructions
refactor(errors): consolidated error mapping function
```

**Format:** `type(scope): description`

**Types:** `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`

**Scopes:** `client`, `swap`, `liquidity`, `flash-loan`, `fees`, `oracle`, `errors`, `utils`, `contracts`

## Pull Request Process

1. Fork the repo and create a branch: `feat/issue-NUMBER-short-description`
2. Make your changes following the standards above
3. Ensure CI passes: `npm run lint && npm run build && npm test`
4. Open a PR against `main` using the PR template
5. Reference the issue number in your PR description
6. Wait for review -- first response within 24 hours

## Testing

- Tests go in `tests/` using Jest
- Name test files `<module>.test.ts`
- Mock external dependencies (RPC calls, contract responses)
- All new functions must have corresponding tests
- Run tests: `npm test`
- Run with coverage: `npm run test:coverage`

## Security

- Never commit secrets, keys, or `.env` files
- Never log private keys or secret keys
- Report vulnerabilities privately via GitHub Security Advisories
- All BigInt operations must handle edge cases (zero, overflow)

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
