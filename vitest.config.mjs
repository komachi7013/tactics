import { defineConfig } from 'vitest/config';

// Game regression suites use Vitest. Reusable CUA helpers stay with node:test.
export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
    // Keep deterministic AI replays within their existing timeout on this Mac.
    maxWorkers: 2,
  },
});
