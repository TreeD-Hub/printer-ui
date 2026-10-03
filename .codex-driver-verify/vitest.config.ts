import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
  root: resolve('.codex-driver-verify'),
  resolve: {alias: {'@treed/printer-logic': resolve('.codex-driver-verify/packages/printer-logic/src/index.ts'), '#runtime': resolve('.codex-driver-verify/mocks/runtime.ts')}},
  test: {globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'packages/printer-logic/test/*.test.ts'], exclude: []}
})
