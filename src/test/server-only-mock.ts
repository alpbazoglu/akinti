// Vitest stand-in for the `server-only` package (aliased in `vitest.config.ts`).
//
// `server-only`'s real implementation throws unless it's imported inside
// Next's RSC bundler, which sets a special module condition vitest never
// sets — so any lib module that (correctly) guards itself with
// `import "server-only"` at the top can't be imported directly in a unit
// test at all otherwise (see `src/lib/billing/iyzico.test.ts`/`paddle.test.ts`,
// the first modules in this codebase to unit-test something below that
// guard rather than only exercising it through a mocked route handler).
// This file intentionally does nothing.
export {};
